const express = require('express');

const registrationAttempts = new Map();
const REGISTRATION_WINDOW_MS = 15 * 60 * 1000;
const MAX_REGISTRATIONS_PER_WINDOW = 5;

module.exports = function createRegistrationRouter({ supabase, supabaseAuth, asyncRoute, handleDatabaseError, ensureAuth }) {
  const router = express.Router();

  router.post('/register', asyncRoute(async (req, res) => {
    const now = Date.now();
    const clientKey = req.ip || req.socket.remoteAddress || 'unknown';
    const attempts = (registrationAttempts.get(clientKey) || []).filter((timestamp) => now - timestamp < REGISTRATION_WINDOW_MS);
    if (attempts.length >= MAX_REGISTRATIONS_PER_WINDOW) {
      return res.status(429).json({
        code: 'REGISTRATION_RATE_LIMITED',
        message: 'Muitas tentativas de cadastro deste endereço. Aguarde 15 minutos e tente novamente.',
      });
    }
    attempts.push(now);
    registrationAttempts.set(clientKey, attempts);
    if (registrationAttempts.size > 10000) {
      for (const [key, timestamps] of registrationAttempts) {
        if (!timestamps.some((timestamp) => now - timestamp < REGISTRATION_WINDOW_MS)) registrationAttempts.delete(key);
      }
    }

    const { name, email, password, ageConfirmed, termsAccepted, privacyAccepted } = req.body || {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (cleanName.length < 2 || cleanName.length > 100) {
      return res.status(400).json({ code: 'INVALID_NAME', message: 'Informe um nome com 2 a 100 caracteres.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ code: 'INVALID_EMAIL', message: 'Informe um endereço de e-mail válido.' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ code: 'INVALID_PASSWORD', message: 'A senha deve ter pelo menos 8 caracteres.' });
    }
    if (ageConfirmed !== true || termsAccepted !== true || privacyAccepted !== true) {
      return res.status(400).json({
        code: 'CONSENT_REQUIRED',
        message: 'Confirme a idade mínima e aceite os termos de uso e a política de privacidade.',
      });
    }

    const { data: registrationSettings, error: settingsError } = await supabase
      .from('platform_settings')
      .select('public_registration_enabled, require_email_confirmation')
      .eq('id', 'registration')
      .single();
    if (settingsError) return handleDatabaseError(res, settingsError);
    if (!registrationSettings.public_registration_enabled) {
      return res.status(403).json({
        code: 'PUBLIC_REGISTRATION_DISABLED',
        message: 'O cadastro público está temporariamente desabilitado. Peça um convite a um administrador.',
      });
    }

    let emailRedirectTo;
    if (registrationSettings.require_email_confirmation && process.env.APP_BASE_URL) {
      try {
        const baseUrl = new URL(process.env.APP_BASE_URL);
        if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('Protocolo inválido');
        emailRedirectTo = baseUrl.toString();
      } catch {
        return res.status(500).json({ code: 'INVALID_APP_BASE_URL', message: 'APP_BASE_URL deve ser uma URL http(s) válida.' });
      }
    }

    const registrationResult = registrationSettings.require_email_confirmation
      ? await supabaseAuth.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: { name: cleanName },
          ...(emailRedirectTo ? { emailRedirectTo } : {}),
        },
      })
      : await supabase.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { name: cleanName },
      });
    const { data, error } = registrationResult;
    if (error) {
      const isDuplicate = /already registered|already exists|user already/i.test(error.message)
        || (data?.user?.identities && data.user.identities.length === 0);
      return res.status(isDuplicate ? 409 : 400).json({
        code: isDuplicate ? 'EMAIL_ALREADY_REGISTERED' : 'REGISTRATION_FAILED',
        message: isDuplicate ? 'Este e-mail já possui cadastro.' : 'Não foi possível criar a conta com os dados informados.',
      });
    }
    if (!data?.user) {
      return res.status(502).json({ code: 'REGISTRATION_FAILED', message: 'O serviço de autenticação não confirmou a criação da conta.' });
    }
    if (
      registrationSettings.require_email_confirmation
      && Array.isArray(data.user.identities)
      && data.user.identities.length === 0
    ) {
      return res.status(409).json({ code: 'EMAIL_ALREADY_REGISTERED', message: 'Este e-mail já possui cadastro.' });
    }
    if (registrationSettings.require_email_confirmation && data.session) {
      const { error: cleanupError } = await supabase.auth.admin.deleteUser(data.user.id);
      if (cleanupError) {
        console.error('Falha ao cancelar cadastro sem confirmação de e-mail:', cleanupError.message);
        return res.status(502).json({
          code: 'EMAIL_CONFIRMATION_REQUIRED',
          message: 'Não foi possível aplicar a exigência de confirmação. Contate o administrador da plataforma.',
        });
      }
      return res.status(503).json({
        code: 'EMAIL_CONFIRMATION_REQUIRED',
        message: 'A confirmação por e-mail precisa estar habilitada no provedor Email do Supabase.',
      });
    }

    const timestamp = new Date().toISOString();
    const { data: updatedProfile, error: profileError } = await supabase
      .from('profiles')
      .update({ name: cleanName, email: cleanEmail, age_confirmed_at: timestamp })
      .eq('id', data.user.id)
      .select('id')
      .maybeSingle();
    if (profileError) {
      if (!registrationSettings.require_email_confirmation) {
        const { error: cleanupError } = await supabase.auth.admin.deleteUser(data.user.id);
        if (cleanupError) console.error('Falha ao remover cadastro incompleto:', cleanupError.message);
      }
      return handleDatabaseError(res, profileError);
    }

    if (!updatedProfile) {
      const { error: insertProfileError } = await supabase
        .from('profiles')
        .insert({ id: data.user.id, name: cleanName, email: cleanEmail, age_confirmed_at: timestamp });
      if (insertProfileError) {
        if (!registrationSettings.require_email_confirmation) {
          const { error: cleanupError } = await supabase.auth.admin.deleteUser(data.user.id);
          if (cleanupError) console.error('Falha ao remover cadastro incompleto:', cleanupError.message);
        }
        return handleDatabaseError(res, insertProfileError);
      }
    }

    const { error: consentError } = await supabase
      .from('consents')
      .upsert([
        { user_id: data.user.id, document_type: 'TERMS', document_version: 'v1' },
        { user_id: data.user.id, document_type: 'PRIVACY', document_version: 'v1' },
      ], { onConflict: 'user_id,document_type,document_version' });
    if (consentError) {
      if (!registrationSettings.require_email_confirmation) {
        const { error: cleanupError } = await supabase.auth.admin.deleteUser(data.user.id);
        if (cleanupError) console.error('Falha ao remover cadastro incompleto:', cleanupError.message);
      }
      return handleDatabaseError(res, consentError);
    }

    res.status(201).json({
      message: registrationSettings.require_email_confirmation
        ? 'Cadastro iniciado. Confirme seu e-mail e depois entre.'
        : 'Cadastro concluído e e-mail confirmado automaticamente. Entre usando seu e-mail e senha.',
      confirmationRequired: registrationSettings.require_email_confirmation,
    });
  }));

  router.post('/login', asyncRoute(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ code: 'INVALID_INPUT', message: 'Informe e-mail e senha.' });
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      if (/email not confirmed/i.test(error?.message || '')) {
        return res.status(401).json({ code: 'EMAIL_NOT_CONFIRMED', message: 'Confirme seu e-mail antes de entrar.' });
      }
      return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos.' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, email, role, status')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profileError) return handleDatabaseError(res, profileError);
    if (!profile || profile.status !== 'ACTIVE') {
      return res.status(403).json({ code: 'PROFILE_INACTIVE', message: 'Perfil não encontrado ou inativo.' });
    }

    res.json({
      user: profile,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
    });
  }));

  router.post('/admin-invitation/complete', asyncRoute(async (req, res) => {
    const accessToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!accessToken) {
      return res.status(401).json({ code: 'INVITATION_TOKEN_REQUIRED', message: 'Abra o link recebido no convite de administrador.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ code: 'INVALID_PASSWORD', message: 'A senha deve ter pelo menos 8 caracteres.' });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return res.status(401).json({ code: 'INVITATION_TOKEN_INVALID', message: 'O convite expirou ou não é válido. Solicite um novo convite a um administrador.' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, status')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (profileError) return handleDatabaseError(res, profileError);
    if (!profile || !['ADMIN', 'USER'].includes(profile.role) || profile.status !== 'ACTIVE') {
      return res.status(403).json({ code: 'PROFILE_INVITATION_REQUIRED', message: 'Este convite não habilita um perfil ativo.' });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(authData.user.id, { password });
    if (updateError) {
      console.error('Falha ao definir senha do administrador convidado:', updateError.message);
      return res.status(502).json({ code: 'PASSWORD_SETUP_FAILED', message: 'Não foi possível definir a senha. Solicite um novo convite ao administrador.' });
    }

    res.json({
      ok: true,
      role: profile.role,
      message: profile.role === 'ADMIN'
        ? 'Perfil de administrador finalizado. Entre com seu e-mail e a nova senha.'
        : 'Perfil finalizado. Entre com seu e-mail e a nova senha.',
    });
  }));

  router.get('/me', ensureAuth, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
};
