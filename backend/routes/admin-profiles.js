const express = require('express');

module.exports = function createAdminProfilesRouter({
  supabase,
  asyncRoute,
  handleDatabaseError,
  ensureAuth,
  ensureAdmin,
  audit,
}) {
  const router = express.Router();
  const adminOnly = [ensureAuth, ensureAdmin];

  router.get('/profiles', ...adminOnly, asyncRoute(async (req, res) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, status, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return handleDatabaseError(res, error);
    res.json({
      items: data.map((profile) => ({
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        status: profile.status,
        createdAt: profile.created_at,
      })),
    });
  }));

  router.post('/profiles', ...adminOnly, asyncRoute(async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({ code: 'INVALID_NAME', message: 'Informe um nome com 2 a 100 caracteres.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ code: 'INVALID_EMAIL', message: 'Informe um endereço de e-mail válido.' });
    }

    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existingProfileError) return handleDatabaseError(res, existingProfileError);
    if (existingProfile) {
      return res.status(409).json({ code: 'EMAIL_ALREADY_REGISTERED', message: 'Este e-mail já possui um perfil.' });
    }

    const appBaseUrl = process.env.APP_BASE_URL;
    if (!appBaseUrl) {
      return res.status(500).json({ code: 'APP_BASE_URL_REQUIRED', message: 'Configure APP_BASE_URL antes de enviar convites.' });
    }
    let redirectTo;
    try {
      const baseUrl = new URL(appBaseUrl);
      if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('Protocolo inválido');
      redirectTo = new URL('/admin/accept-invite', baseUrl).toString();
    } catch {
      return res.status(500).json({ code: 'INVALID_APP_BASE_URL', message: 'APP_BASE_URL deve ser uma URL http(s) válida.' });
    }

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { name },
      redirectTo,
    });
    if (error || !data.user) {
      const duplicate = /already|registered|exists/i.test(error?.message || '');
      if (duplicate) {
        let existingAuthUser = null;
        for (let page = 1; page <= 100; page += 1) {
          const { data: usersPage, error: usersError } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
          if (usersError) {
            console.error('Falha ao localizar conta existente para vincular perfil:', usersError.message);
            return res.status(502).json({ code: 'PROFILE_RECOVERY_FAILED', message: 'Não foi possível verificar a conta existente no serviço de autenticação.' });
          }
          existingAuthUser = usersPage.users.find((user) => (user.email || '').toLowerCase() === email) || null;
          if (existingAuthUser || usersPage.users.length < 1000) break;
        }

        if (existingAuthUser) {
          const { error: insertError } = await supabase.from('profiles').upsert({
            id: existingAuthUser.id,
            name,
            email,
          }, { onConflict: 'id', ignoreDuplicates: true });
          if (insertError) return handleDatabaseError(res, insertError);
          await audit(req, 'PROFILE_RECOVER', 'profile', existingAuthUser.id, { email });
          return res.status(201).json({
            message: 'A conta já existia no Supabase Auth e agora está vinculada a um perfil. A pessoa pode entrar com a senha já cadastrada.',
          });
        }
      }
      return res.status(duplicate ? 409 : 502).json({
        code: duplicate ? 'EMAIL_ALREADY_REGISTERED' : 'PROFILE_INVITATION_FAILED',
        message: duplicate
          ? 'Este e-mail já possui uma conta.'
          : 'Não foi possível enviar o convite. Verifique a configuração de e-mail do Supabase.',
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .update({ name, email })
      .eq('id', data.user.id)
      .select('id')
      .maybeSingle();
    if (profileError) {
      const { error: cleanupError } = await supabase.auth.admin.deleteUser(data.user.id);
      if (cleanupError) console.error('Falha ao remover conta após erro ao criar perfil:', cleanupError.message);
      return handleDatabaseError(res, profileError);
    }
    if (!profile) {
      const { error: insertError } = await supabase.from('profiles').insert({
        id: data.user.id,
        name,
        email,
      });
      if (insertError) {
        const { error: cleanupError } = await supabase.auth.admin.deleteUser(data.user.id);
        if (cleanupError) console.error('Falha ao remover conta após erro ao criar perfil:', cleanupError.message);
        return handleDatabaseError(res, insertError);
      }
    }

    await audit(req, 'PROFILE_INVITE', 'profile', data.user.id, { email });
    res.status(201).json({
      message: 'Convite enviado por e-mail. A pessoa deve confirmar o endereço e definir a senha para acessar.',
    });
  }));

  router.patch('/profiles/:id', ...adminOnly, asyncRoute(async (req, res) => {
    const profileId = req.params.id;
    const name = req.body?.name;
    const status = req.body?.status;
    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100)) {
      return res.status(400).json({ code: 'INVALID_NAME', message: 'O nome deve ter de 2 a 100 caracteres.' });
    }
    if (status !== undefined && !['ACTIVE', 'SUSPENDED', 'DELETED'].includes(status)) {
      return res.status(400).json({ code: 'INVALID_STATUS', message: 'Status inválido.' });
    }
    if (name === undefined && status === undefined) {
      return res.status(400).json({ code: 'NO_CHANGES', message: 'Informe os dados que deseja alterar.' });
    }
    if (profileId === req.user.id && status && status !== 'ACTIVE') {
      return res.status(409).json({ code: 'SELF_CHANGE_BLOCKED', message: 'Você não pode suspender ou excluir seu próprio perfil.' });
    }

    const { data: current, error: currentError } = await supabase
      .from('profiles')
      .select('id, name, email, role, status')
      .eq('id', profileId)
      .maybeSingle();
    if (currentError) return handleDatabaseError(res, currentError);
    if (!current) return res.status(404).json({ code: 'PROFILE_NOT_FOUND', message: 'Perfil não encontrado.' });
    if (current.status === 'DELETED' && status && status !== 'DELETED') {
      return res.status(409).json({ code: 'PROFILE_DELETED', message: 'Um perfil excluído não pode ser reativado por esta página.' });
    }
    if (current.status !== 'ACTIVE' && status === 'ACTIVE') {
      return res.status(409).json({ code: 'PROFILE_INACTIVE', message: 'Somente perfis suspensos podem ser reativados.' });
    }

    if (status && current.role === 'ADMIN' && status !== 'ACTIVE') {
      const { count, error: adminCountError } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'ADMIN')
        .eq('status', 'ACTIVE');
      if (adminCountError) return handleDatabaseError(res, adminCountError);
      if (count <= 1) {
        return res.status(409).json({ code: 'LAST_ADMIN', message: 'Não é possível suspender ou excluir o último administrador ativo.' });
      }
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (status !== undefined) {
      updates.status = status;
      updates.deleted_at = status === 'DELETED' ? new Date().toISOString() : null;
    }
    updates.updated_at = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profileId)
      .select('id, name, email, role, status')
      .single();
    if (updateError) return handleDatabaseError(res, updateError);

    if (status !== undefined) {
      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(profileId, {
        ban_duration: status === 'ACTIVE' ? 'none' : '876000h',
        ...(name !== undefined ? { user_metadata: { name: name.trim() } } : {}),
      });
      if (authUpdateError) {
        const rollback = {
          status: current.status,
          deleted_at: current.status === 'DELETED' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
          ...(name !== undefined ? { name: current.name } : {}),
        };
        const { error: rollbackError } = await supabase.from('profiles').update(rollback).eq('id', profileId);
        if (rollbackError) console.error('Falha ao reverter status de perfil após erro do Auth:', rollbackError.message);
        console.error('Falha ao atualizar acesso do perfil no Supabase Auth:', authUpdateError.message);
        return res.status(502).json({ code: 'PROFILE_ACCESS_UPDATE_FAILED', message: 'Não foi possível atualizar o acesso deste perfil. Tente novamente.' });
      }
    } else if (name !== undefined) {
      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(profileId, {
        user_metadata: { name: name.trim() },
      });
      if (authUpdateError) {
        const { error: rollbackError } = await supabase.from('profiles').update({
          name: current.name,
          updated_at: new Date().toISOString(),
        }).eq('id', profileId);
        if (rollbackError) console.error('Falha ao reverter nome de perfil após erro do Auth:', rollbackError.message);
        console.error('Falha ao atualizar nome no Supabase Auth:', authUpdateError.message);
        return res.status(502).json({ code: 'PROFILE_UPDATE_FAILED', message: 'Não foi possível atualizar o perfil. Tente novamente.' });
      }
    }

    const action = status === 'DELETED' ? 'PROFILE_DELETE' : status ? 'PROFILE_STATUS_CHANGE' : 'PROFILE_UPDATE';
    await audit(req, action, 'profile', updated.id, {
      email: updated.email,
      ...(name !== undefined ? { name: updated.name } : {}),
      ...(status !== undefined ? { status } : {}),
    });
    res.json({ item: updated });
  }));

  router.get('/settings/registration', ...adminOnly, asyncRoute(async (req, res) => {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('public_registration_enabled, require_email_confirmation')
      .eq('id', 'registration')
      .single();
    if (error) return handleDatabaseError(res, error);
    res.json({
      publicRegistrationEnabled: data.public_registration_enabled,
      requireEmailConfirmation: data.require_email_confirmation,
    });
  }));

  router.patch('/settings/registration', ...adminOnly, asyncRoute(async (req, res) => {
    const enabled = req.body?.publicRegistrationEnabled;
    const requireEmailConfirmation = req.body?.requireEmailConfirmation;
    if (enabled === undefined && requireEmailConfirmation === undefined) {
      return res.status(400).json({ code: 'INVALID_SETTING', message: 'Informe ao menos uma configuração de cadastro.' });
    }
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return res.status(400).json({ code: 'INVALID_SETTING', message: 'O cadastro público deve ser habilitado ou desabilitado.' });
    }
    if (requireEmailConfirmation !== undefined && typeof requireEmailConfirmation !== 'boolean') {
      return res.status(400).json({ code: 'INVALID_SETTING', message: 'A confirmação por e-mail deve ser exigida ou desativada.' });
    }
    const updates = { updated_at: new Date().toISOString() };
    if (enabled !== undefined) updates.public_registration_enabled = enabled;
    if (requireEmailConfirmation !== undefined) updates.require_email_confirmation = requireEmailConfirmation;
    const { data, error } = await supabase
      .from('platform_settings')
      .update(updates)
      .eq('id', 'registration')
      .select('public_registration_enabled, require_email_confirmation')
      .single();
    if (error) return handleDatabaseError(res, error);
    await audit(req, 'REGISTRATION_SETTINGS_CHANGE', 'platform_setting', null, {
      ...(enabled !== undefined ? { publicRegistrationEnabled: enabled } : {}),
      ...(requireEmailConfirmation !== undefined ? { requireEmailConfirmation } : {}),
    });
    res.json({
      publicRegistrationEnabled: data.public_registration_enabled,
      requireEmailConfirmation: data.require_email_confirmation,
    });
  }));

  return router;
};
