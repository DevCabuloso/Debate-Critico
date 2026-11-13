const express = require('express');

const isValidWebUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

module.exports = function createAdminContentRouter({
  supabase,
  asyncRoute,
  handleDatabaseError,
  ensureAuth,
  ensureAdmin,
  audit,
}) {
  const router = express.Router();
  const adminOnly = [ensureAuth, ensureAdmin];

  router.post('/invitations', ...adminOnly, asyncRoute(async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({ code: 'INVALID_NAME', message: 'Informe um nome com 2 a 100 caracteres.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ code: 'INVALID_EMAIL', message: 'Informe um endereço de e-mail válido.' });
    }

    const appBaseUrl = process.env.APP_BASE_URL;
    if (!appBaseUrl) {
      return res.status(500).json({ code: 'APP_BASE_URL_REQUIRED', message: 'Configure APP_BASE_URL com a URL pública da plataforma antes de enviar convites.' });
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
      ...(redirectTo ? { redirectTo } : {}),
    });
    if (error || !data.user) {
      const duplicate = /already|registered|exists/i.test(error?.message || '');
      return res.status(duplicate ? 409 : 502).json({
        code: duplicate ? 'EMAIL_ALREADY_REGISTERED' : 'INVITATION_FAILED',
        message: duplicate
          ? 'Este e-mail já possui uma conta. A promoção de contas existentes deve ser feita por um procedimento administrativo confiável.'
          : 'Não foi possível enviar o convite. Verifique a configuração de e-mail do Supabase.',
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .update({ name, email, role: 'ADMIN' })
      .eq('id', data.user.id)
      .select('id')
      .maybeSingle();
    if (profileError) return handleDatabaseError(res, profileError);
    if (!profile) {
      const { error: insertError } = await supabase.from('profiles').insert({
        id: data.user.id,
        name,
        email,
        role: 'ADMIN',
      });
      if (insertError) return handleDatabaseError(res, insertError);
    }

    await audit(req, 'ADMIN_INVITE', 'profile', data.user.id, { email });
    res.status(201).json({
      message: 'Convite de administrador enviado. A pessoa deve confirmar o e-mail para ativar o acesso.',
    });
  }));

  router.get('/lesson-modules', ...adminOnly, asyncRoute(async (req, res) => {
    const { data, error } = await supabase
      .from('lesson_modules')
      .select('id, title, description, status, lesson_module_relations(lesson_id, position)')
      .order('created_at', { ascending: false });
    if (error) return handleDatabaseError(res, error);
    res.json({
      items: data.map((module) => ({
        id: module.id,
        title: module.title,
        description: module.description,
        status: module.status,
        lessonsCount: module.lesson_module_relations.length,
      })),
    });
  }));

  router.post('/lesson-modules', ...adminOnly, asyncRoute(async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    if (title.length < 2 || title.length > 150) {
      return res.status(400).json({ code: 'INVALID_TITLE', message: 'O título do módulo deve ter de 2 a 150 caracteres.' });
    }

    const { data, error } = await supabase
      .from('lesson_modules')
      .insert({ title, description, status: 'DRAFT' })
      .select('id, title, description, status')
      .single();
    if (error) return handleDatabaseError(res, error);
    await audit(req, 'LESSON_MODULE_CREATE', 'lesson_module', data.id, { title });
    res.status(201).json({ item: data });
  }));

  router.get('/lessons', ...adminOnly, asyncRoute(async (req, res) => {
    const { data, error } = await supabase
      .from('lessons')
      .select('id, title, description, content, video_url, category, version, status, lesson_module_relations(module_id, position, lesson_modules(title))')
      .order('created_at', { ascending: false });
    if (error) return handleDatabaseError(res, error);
    res.json({
      items: data.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        content: lesson.content,
        videoUrl: lesson.video_url,
        category: lesson.category,
        version: lesson.version,
        status: lesson.status,
        modules: lesson.lesson_module_relations.map((relation) => ({
          id: relation.module_id,
          title: relation.lesson_modules?.title || '',
          position: relation.position,
        })),
      })),
    });
  }));

  router.post('/lessons', ...adminOnly, asyncRoute(async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    const videoUrl = typeof req.body?.videoUrl === 'string' ? req.body.videoUrl.trim() : '';
    const category = typeof req.body?.category === 'string' ? req.body.category.trim() : '';
    const moduleId = typeof req.body?.moduleId === 'string' ? req.body.moduleId : '';
    if (title.length < 2 || title.length > 200 || !content || content.length > 20000 || !moduleId) {
      return res.status(400).json({ code: 'INVALID_INPUT', message: 'Informe título, conteúdo (até 20 mil caracteres) e módulo.' });
    }
    if (videoUrl && !isValidWebUrl(videoUrl)) {
      return res.status(400).json({ code: 'INVALID_VIDEO_URL', message: 'Informe uma URL http(s) válida para a videoaula.' });
    }
    const { data: module, error: moduleError } = await supabase
      .from('lesson_modules')
      .select('id, title')
      .eq('id', moduleId)
      .maybeSingle();
    if (moduleError) return handleDatabaseError(res, moduleError);
    if (!module) return res.status(404).json({ code: 'MODULE_NOT_FOUND', message: 'Módulo não encontrado.' });

    const { data: previousVersion, error: versionError } = await supabase
      .from('lessons')
      .select('version')
      .eq('title', title)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionError) return handleDatabaseError(res, versionError);

    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .insert({
        title,
        description,
        content,
        video_url: videoUrl || null,
        category: category || null,
        version: (previousVersion?.version || 0) + 1,
        status: 'DRAFT',
      })
      .select('id, title, description, video_url, category, version, status')
      .single();
    if (lessonError) return handleDatabaseError(res, lessonError);

    const { data: relations, error: relationError } = await supabase
      .from('lesson_module_relations')
      .select('position')
      .eq('module_id', moduleId)
      .order('position', { ascending: false })
      .limit(1);
    if (relationError) return handleDatabaseError(res, relationError);
    const position = (relations[0]?.position || 0) + 1;
    const { error: attachError } = await supabase
      .from('lesson_module_relations')
      .insert({ module_id: moduleId, lesson_id: lesson.id, position });
    if (attachError) return handleDatabaseError(res, attachError);

    await audit(req, 'LESSON_CREATE', 'lesson', lesson.id, { title, moduleId });
    res.status(201).json({ item: { ...lesson, moduleTitle: module.title } });
  }));

  router.patch('/lessons/:id', ...adminOnly, asyncRoute(async (req, res) => {
    const { status } = req.body || {};
    if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
      return res.status(400).json({ code: 'INVALID_STATUS', message: 'Status inválido.' });
    }
    const { data, error } = await supabase
      .from('lessons')
      .update({ status })
      .eq('id', req.params.id)
      .select('id, title, status')
      .maybeSingle();
    if (error) return handleDatabaseError(res, error);
    if (!data) return res.status(404).json({ code: 'LESSON_NOT_FOUND', message: 'Videoaula não encontrada.' });
    await audit(req, 'LESSON_STATUS_CHANGE', 'lesson', data.id, { title: data.title, status });
    res.json({ item: data });
  }));

  router.patch('/lesson-modules/:id', ...adminOnly, asyncRoute(async (req, res) => {
    const { status } = req.body || {};
    if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
      return res.status(400).json({ code: 'INVALID_STATUS', message: 'Status inválido.' });
    }
    const { data, error } = await supabase
      .from('lesson_modules')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('id, title, status')
      .maybeSingle();
    if (error) return handleDatabaseError(res, error);
    if (!data) return res.status(404).json({ code: 'MODULE_NOT_FOUND', message: 'Módulo não encontrado.' });
    await audit(req, 'LESSON_MODULE_STATUS_CHANGE', 'lesson_module', data.id, { title: data.title, status });
    res.json({ item: data });
  }));

  return router;
};
