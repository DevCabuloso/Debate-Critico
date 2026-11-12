const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const createRegistrationRouter = require('./routes/registration');
const createAdminContentRouter = require('./routes/admin-content');
const createAdminProfilesRouter = require('./routes/admin-profiles');

const app = express();
const PORT = process.env.PORT || 3001;
const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabasePublishableKey || !supabaseSecretKey) {
  throw new Error('Configure SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY no arquivo .env.');
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
const supabaseAuth = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

app.use(express.json({ limit: '2mb' }));
const frontendBuildPath = path.resolve(__dirname, '../frontend/dist');
app.use(express.static(frontendBuildPath));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function handleDatabaseError(res, error) {
  console.error('Supabase request failed:', error.message);
  return res.status(500).json({
    code: 'DATABASE_ERROR',
    message: 'Não foi possível concluir a operação no banco de dados.',
  });
}

function toVideo(video) {
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    youtubeUrl: video.youtube_url,
    youtubeId: video.youtube_id,
    duration: video.duration_seconds,
    language: video.language,
    status: video.status,
    embeddable: video.embeddable,
    categories: (video.video_category_relations || [])
      .map((relation) => relation.video_categories?.name)
      .filter(Boolean),
  };
}

function ensureAuth(req, res, next) {
  Promise.resolve().then(async () => {
    const authorization = req.headers.authorization || '';
    const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!accessToken) {
      return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Envie um access token Bearer válido.' });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Sessão inválida ou expirada.' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, email, role, status')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileError) {
      return handleDatabaseError(res, profileError);
    }
    if (!profile || profile.status !== 'ACTIVE') {
      return res.status(403).json({ code: 'PROFILE_INACTIVE', message: 'Perfil não encontrado ou inativo.' });
    }

    req.user = profile;
    next();
  }).catch(next);
}

function ensureAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Acesso administrativo negado.' });
  }
  next();
}

app.use('/api/v1/auth', createRegistrationRouter({
  supabase,
  supabaseAuth,
  asyncRoute,
  handleDatabaseError,
  ensureAuth,
}));

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

async function getCycle(cycleId, userId) {
  return supabase
    .from('user_cycles')
    .select('*')
    .eq('id', cycleId)
    .eq('user_id', userId)
    .maybeSingle();
}

function toCycle(cycle) {
  return {
    id: cycle.id,
    userId: cycle.user_id,
    videoId: cycle.video_id,
    quizId: cycle.quiz_id,
    cycleNumber: cycle.cycle_number,
    state: cycle.state,
    status: cycle.status,
    startedAt: cycle.started_at,
    completedAt: cycle.completed_at,
  };
}

app.get('/api/v1/health', (req, res) => {
  res.json({ ok: true, service: 'debate-platform-api' });
});

app.get('/api/v1/videos', asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('videos')
    .select('id, title, description, youtube_url, youtube_id, duration_seconds, language, status, embeddable, video_category_relations(video_categories(name))')
    .eq('status', 'PUBLISHED')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return handleDatabaseError(res, error);
  res.json({ items: data.map(toVideo) });
}));

app.get('/api/v1/videos/:id', asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('videos')
    .select('id, title, description, youtube_url, youtube_id, duration_seconds, language, status, embeddable, video_category_relations(video_categories(name))')
    .eq('id', req.params.id)
    .eq('status', 'PUBLISHED')
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return handleDatabaseError(res, error);
  if (!data) return res.status(404).json({ code: 'VIDEO_NOT_FOUND', message: 'Debate não encontrado.' });
  res.json({ item: toVideo(data) });
}));

app.post('/api/v1/cycles', ensureAuth, asyncRoute(async (req, res) => {
  const { videoId } = req.body || {};
  if (!videoId) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Informe o debate.' });
  }

  const { data: video, error: videoError } = await supabase
    .from('videos')
    .select('id')
    .eq('id', videoId)
    .eq('status', 'PUBLISHED')
    .is('deleted_at', null)
    .maybeSingle();
  if (videoError) return handleDatabaseError(res, videoError);
  if (!video) return res.status(404).json({ code: 'VIDEO_NOT_FOUND', message: 'Debate não encontrado.' });

  const { data: quiz, error: quizError } = await supabase
    .from('quizzes')
    .select('id')
    .eq('video_id', videoId)
    .eq('status', 'APPROVED')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (quizError) return handleDatabaseError(res, quizError);
  if (!quiz) return res.status(409).json({ code: 'QUIZ_NOT_AVAILABLE', message: 'Este debate ainda não possui questionário aprovado.' });

  const { data: existing, error: existingError } = await supabase
    .from('user_cycles')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('video_id', videoId)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (existingError) return handleDatabaseError(res, existingError);
  if (existing) return res.json({ item: toCycle(existing) });

  const { data: previousCycle, error: previousError } = await supabase
    .from('user_cycles')
    .select('cycle_number')
    .eq('user_id', req.user.id)
    .eq('video_id', videoId)
    .order('cycle_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) return handleDatabaseError(res, previousError);

  const { data: cycle, error: insertError } = await supabase
    .from('user_cycles')
    .insert({
      user_id: req.user.id,
      video_id: videoId,
      quiz_id: quiz.id,
      cycle_number: (previousCycle?.cycle_number || 0) + 1,
      state: 'INITIAL_VIDEO',
      status: 'ACTIVE',
    })
    .select('*')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return res.status(409).json({ code: 'ACTIVE_CYCLE_EXISTS', message: 'Já existe um ciclo ativo para este debate.' });
    }
    return handleDatabaseError(res, insertError);
  }

  res.status(201).json({ item: toCycle(cycle) });
}));

app.get('/api/v1/cycles/:id', ensureAuth, asyncRoute(async (req, res) => {
  const { data, error } = await getCycle(req.params.id, req.user.id);
  if (error) return handleDatabaseError(res, error);
  if (!data) return res.status(404).json({ code: 'CYCLE_NOT_FOUND', message: 'Ciclo não encontrado.' });
  res.json({ item: toCycle(data) });
}));

app.post('/api/v1/cycles/:id/video-events', ensureAuth, asyncRoute(async (req, res) => {
  const { data: cycle, error: cycleError } = await getCycle(req.params.id, req.user.id);
  if (cycleError) return handleDatabaseError(res, cycleError);
  if (!cycle) return res.status(404).json({ code: 'CYCLE_NOT_FOUND', message: 'Ciclo não encontrado.' });

  const events = req.body?.events;
  if (!Array.isArray(events) || events.length < 1 || events.length > 100) {
    return res.status(400).json({ code: 'INVALID_EVENTS', message: 'Envie de 1 a 100 eventos de vídeo.' });
  }

  const stage = cycle.state.startsWith('FINAL_') ? 'FINAL' : 'INITIAL';
  const rows = [];
  for (const event of events) {
    const eventType = String(event.type || '').toUpperCase();
    const position = Number(event.position);
    const playbackRate = Number(event.playbackRate || 1);
    if (!['PLAY', 'PAUSE', 'SEEK', 'ENDED', 'HEARTBEAT'].includes(eventType)
      || !Number.isFinite(position) || position < 0
      || !Number.isFinite(playbackRate) || playbackRate <= 0 || playbackRate > 2) {
      return res.status(400).json({ code: 'INVALID_EVENT', message: 'Um ou mais eventos de vídeo são inválidos.' });
    }
    rows.push({
      cycle_id: cycle.id,
      stage,
      event_type: eventType,
      position_seconds: position,
      playback_rate: playbackRate,
      client_ts: event.timestamp || new Date().toISOString(),
    });
  }

  const { error: insertError } = await supabase.from('video_watch_events').insert(rows);
  if (insertError) return handleDatabaseError(res, insertError);
  res.json({ ok: true, received: rows.length, cycle: toCycle(cycle) });
}));

app.get('/api/v1/cycles/:id/video-progress', ensureAuth, asyncRoute(async (req, res) => {
  const { data: cycle, error: cycleError } = await getCycle(req.params.id, req.user.id);
  if (cycleError) return handleDatabaseError(res, cycleError);
  if (!cycle) return res.status(404).json({ code: 'CYCLE_NOT_FOUND', message: 'Ciclo não encontrado.' });

  const { data, error } = await supabase
    .from('video_progress')
    .select('stage, unique_seconds_watched, completed_at')
    .eq('cycle_id', cycle.id);
  if (error) return handleDatabaseError(res, error);
  res.json({ items: data });
}));

app.post('/api/v1/cycles/:id/attempts', ensureAuth, asyncRoute(async (req, res) => {
  const { data: cycle, error: cycleError } = await getCycle(req.params.id, req.user.id);
  if (cycleError) return handleDatabaseError(res, cycleError);
  if (!cycle) return res.status(404).json({ code: 'CYCLE_NOT_FOUND', message: 'Ciclo não encontrado.' });

  const attemptType = String(req.body?.attemptType || 'initial').toUpperCase();
  if (!['INITIAL', 'FINAL'].includes(attemptType)) {
    return res.status(400).json({ code: 'INVALID_ATTEMPT_TYPE', message: 'A tentativa deve ser INITIAL ou FINAL.' });
  }

  const requiredState = attemptType === 'INITIAL' ? 'INITIAL_QUIZ' : 'FINAL_QUIZ';
  if (cycle.state !== requiredState) {
    return res.status(409).json({ code: 'CYCLE_STATE_INVALID', message: 'A avaliação não está liberada nesta etapa do ciclo.' });
  }

  const { data: existing, error: existingError } = await supabase
    .from('quiz_attempts')
    .select('id, cycle_id, quiz_id, attempt_type, status, started_at')
    .eq('cycle_id', cycle.id)
    .eq('attempt_type', attemptType)
    .maybeSingle();
  if (existingError) return handleDatabaseError(res, existingError);

  let attempt = existing;
  let orderRows;
  if (attempt) {
    if (attempt.status !== 'IN_PROGRESS') {
      return res.status(409).json({ code: 'ATTEMPT_ALREADY_SUBMITTED', message: 'Esta tentativa já foi enviada.' });
    }
    const { data, error } = await supabase
      .from('attempt_question_order')
      .select('question_id, position, option_order')
      .eq('attempt_id', attempt.id)
      .order('position');
    if (error) return handleDatabaseError(res, error);
    orderRows = data;
  } else {
    const idempotencyKey = req.body?.idempotencyKey || `${cycle.id}:${attemptType}`;
    const { data, error } = await supabase
      .from('quiz_attempts')
      .insert({
        cycle_id: cycle.id,
        quiz_id: cycle.quiz_id,
        attempt_type: attemptType,
        idempotency_key: idempotencyKey,
      })
      .select('id, cycle_id, quiz_id, attempt_type, status, started_at')
      .single();
    if (error) return handleDatabaseError(res, error);
    attempt = data;

    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('id, question_options(id)')
      .eq('quiz_id', cycle.quiz_id);
    if (questionsError) return handleDatabaseError(res, questionsError);
    if (!questions.length) {
      return res.status(409).json({ code: 'QUIZ_EMPTY', message: 'O questionário aprovado não possui questões.' });
    }

    orderRows = shuffle(questions).map((question, index) => ({
      attempt_id: attempt.id,
      question_id: question.id,
      position: index + 1,
      option_order: shuffle(question.question_options.map((option) => option.id)),
    }));
    const { error: orderError } = await supabase.from('attempt_question_order').insert(orderRows);
    if (orderError) return handleDatabaseError(res, orderError);
  }

  const questionIds = (orderRows || []).map((row) => row.question_id);
  const { data: questions, error: questionsError } = await supabase
    .from('questions')
    .select('id, statement, category, difficulty, question_options(id, content)')
    .in('id', questionIds);
  if (questionsError) return handleDatabaseError(res, questionsError);

  const questionById = new Map(questions.map((question) => [question.id, question]));
  const safeQuestions = orderRows.map((row) => {
    const question = questionById.get(row.question_id);
    const optionsById = new Map(question.question_options.map((option) => [option.id, option]));
    return {
      id: question.id,
      statement: question.statement,
      category: question.category,
      difficulty: question.difficulty,
      options: row.option_order.map((id) => optionsById.get(id)).filter(Boolean)
        .map((option) => ({ id: option.id, text: option.content })),
    };
  });

  res.status(existing ? 200 : 201).json({
    item: {
      id: attempt.id,
      cycleId: attempt.cycle_id,
      quizId: attempt.quiz_id,
      attemptType: attempt.attempt_type.toLowerCase(),
      status: attempt.status,
      startedAt: attempt.started_at,
      questions: safeQuestions,
    },
  });
}));

app.post('/api/v1/attempts/:id/submit', ensureAuth, asyncRoute(async (req, res) => {
  const { data: attempt, error: attemptError } = await supabase
    .from('quiz_attempts')
    .select('id, cycle_id, quiz_id, attempt_type, status, user_cycles!inner(user_id, state)')
    .eq('id', req.params.id)
    .eq('user_cycles.user_id', req.user.id)
    .maybeSingle();
  if (attemptError) return handleDatabaseError(res, attemptError);
  if (!attempt) return res.status(404).json({ code: 'ATTEMPT_NOT_FOUND', message: 'Tentativa não encontrada.' });

  if (attempt.status === 'SUBMITTED') {
    const { data: answers, error: answersError } = await supabase
      .from('user_answers')
      .select('is_correct')
      .eq('attempt_id', attempt.id);
    if (answersError) return handleDatabaseError(res, answersError);
    const correct = answers.filter((answer) => answer.is_correct).length;
    return res.json({
      attemptId: attempt.id,
      attemptType: attempt.attempt_type.toLowerCase(),
      score: answers.length ? Math.round((correct / answers.length) * 100) : 0,
      correct,
      total: answers.length,
      visibility: attempt.attempt_type === 'FINAL' ? 'FINAL_GABARITO_VISIBLE' : 'INITIAL_ONLY_SCORE_VISIBLE',
    });
  }
  if (attempt.status !== 'IN_PROGRESS') {
    return res.status(409).json({ code: 'ATTEMPT_NOT_ACTIVE', message: 'Esta tentativa não está ativa.' });
  }

  const answers = req.body?.answers;
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ code: 'INVALID_ANSWERS', message: 'Envie as respostas da avaliação.' });
  }

  const { data: questionOrder, error: orderError } = await supabase
    .from('attempt_question_order')
    .select('question_id')
    .eq('attempt_id', attempt.id);
  if (orderError) return handleDatabaseError(res, orderError);
  const orderIds = new Set(questionOrder.map((row) => row.question_id));
  const submittedIds = new Set(answers.map((answer) => answer.questionId));
  if (answers.length !== orderIds.size || submittedIds.size !== answers.length
    || answers.some((answer) => !orderIds.has(answer.questionId) || !answer.selectedOptionId)) {
    return res.status(400).json({ code: 'INVALID_ANSWERS', message: 'Responda cada questão uma única vez usando uma alternativa válida.' });
  }

  const answerRows = [];
  for (const answer of answers) {
    const { data: selectedOption, error: optionError } = await supabase
      .from('question_options')
      .select('id')
      .eq('question_id', answer.questionId)
      .eq('id', answer.selectedOptionId)
      .maybeSingle();
    if (optionError) return handleDatabaseError(res, optionError);
    if (!selectedOption) {
      return res.status(400).json({ code: 'INVALID_OPTION', message: 'Uma alternativa não pertence à questão informada.' });
    }

    const { data: key, error: keyError } = await supabase
      .from('question_answer_keys')
      .select('correct_option_id')
      .eq('question_id', answer.questionId)
      .maybeSingle();
    if (keyError) return handleDatabaseError(res, keyError);
    if (!key) return res.status(409).json({ code: 'ANSWER_KEY_MISSING', message: 'O gabarito de uma questão está indisponível.' });
    answerRows.push({
      attempt_id: attempt.id,
      quiz_id: attempt.quiz_id,
      question_id: answer.questionId,
      selected_option_id: answer.selectedOptionId,
      is_correct: key.correct_option_id === answer.selectedOptionId,
    });
  }

  const { error: answersInsertError } = await supabase.from('user_answers').insert(answerRows);
  if (answersInsertError) return handleDatabaseError(res, answersInsertError);

  const correct = answerRows.filter((answer) => answer.is_correct).length;
  const score = Math.round((correct / answerRows.length) * 100);
  const submittedAt = new Date().toISOString();
  const nextState = attempt.attempt_type === 'INITIAL' ? 'LEARNING' : 'COMPLETED';
  const { error: updateAttemptError } = await supabase
    .from('quiz_attempts')
    .update({
      status: 'SUBMITTED',
      score,
      submitted_at: submittedAt,
      duration_seconds: 0,
    })
    .eq('id', attempt.id);
  if (updateAttemptError) return handleDatabaseError(res, updateAttemptError);

  const { error: updateCycleError } = await supabase
    .from('user_cycles')
    .update({
      state: nextState,
      status: nextState === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE',
      state_updated_at: submittedAt,
      completed_at: nextState === 'COMPLETED' ? submittedAt : null,
    })
    .eq('id', attempt.cycle_id);
  if (updateCycleError) return handleDatabaseError(res, updateCycleError);

  const response = {
    attemptId: attempt.id,
    attemptType: attempt.attempt_type.toLowerCase(),
    score,
    correct,
    total: answerRows.length,
    passed: score >= 70,
    cycleState: nextState,
    visibility: attempt.attempt_type === 'FINAL' ? 'FINAL_GABARITO_VISIBLE' : 'INITIAL_ONLY_SCORE_VISIBLE',
  };

  if (attempt.attempt_type === 'FINAL') {
    const { data: feedback, error: feedbackError } = await supabase
      .from('questions')
      .select('id, explanation, question_answer_keys(correct_option_id)')
      .eq('quiz_id', attempt.quiz_id);
    if (feedbackError) return handleDatabaseError(res, feedbackError);
    response.feedback = feedback;
  }

  res.json(response);
}));

app.get('/api/v1/quizzes', ensureAuth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('quizzes')
    .select('id, video_id, version, questions(id, category), videos!inner(title, status, deleted_at)')
    .eq('status', 'APPROVED')
    .eq('videos.status', 'PUBLISHED')
    .is('videos.deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) return handleDatabaseError(res, error);

  res.json({
    items: data.map((quiz) => ({
      id: quiz.id,
      videoId: quiz.video_id,
      videoTitle: quiz.videos.title,
      version: quiz.version,
      questionCount: quiz.questions.length,
      categories: [...new Set(quiz.questions.map((question) => question.category))],
    })),
  });
}));

app.get('/api/v1/lessons/modules', ensureAuth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('lesson_modules')
    .select('id, title, description, lesson_module_relations(position, lessons!inner(id, title, description, video_url, category, version, status))')
    .eq('status', 'PUBLISHED')
    .eq('lesson_module_relations.lessons.status', 'PUBLISHED')
    .order('created_at', { ascending: false });
  if (error) return handleDatabaseError(res, error);

  res.json({
    items: data.map((module) => ({
      id: module.id,
      title: module.title,
      description: module.description,
      lessons: module.lesson_module_relations
        .sort((left, right) => left.position - right.position)
        .map(({ lessons: lesson }) => ({
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          videoUrl: lesson.video_url,
          category: lesson.category,
          version: lesson.version,
        })),
    })),
  });
}));

app.get('/api/v1/reports/me', ensureAuth, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .select('id, attempt_type, status, score, started_at, submitted_at, user_cycles!inner(id, user_id, video_id, cycle_number, videos(title))')
    .eq('user_cycles.user_id', req.user.id)
    .order('started_at', { ascending: false });
  if (error) return handleDatabaseError(res, error);

  res.json({
    items: data.map((attempt) => ({
      id: attempt.id,
      attemptType: attempt.attempt_type,
      status: attempt.status,
      score: attempt.score,
      startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at,
      cycleId: attempt.user_cycles.id,
      cycleNumber: attempt.user_cycles.cycle_number,
      videoId: attempt.user_cycles.video_id,
      videoTitle: attempt.user_cycles.videos?.title,
    })),
  });
}));

app.get('/api/v1/admin/ai-jobs', ensureAuth, ensureAdmin, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('ai_jobs')
    .select('id, status, cost_estimate, job_type, step, attempts, error_message, created_at, videos(title)')
    .order('created_at', { ascending: false });
  if (error) return handleDatabaseError(res, error);
  res.json({
    items: data.map((job) => ({
      id: job.id,
      status: job.status,
      costEstimate: job.cost_estimate,
      type: job.job_type,
      step: job.step,
      attempts: job.attempts,
      errorMessage: job.error_message,
      videoTitle: job.videos?.title || null,
      createdAt: job.created_at,
    })),
  });
}));

app.get('/api/v1/admin/videos', ensureAuth, ensureAdmin, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('videos')
    .select('id, title, description, youtube_url, youtube_id, duration_seconds, language, status, embeddable, video_category_relations(video_categories(name))')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) return handleDatabaseError(res, error);
  res.json({ items: data.map(toVideo) });
}));

app.post('/api/v1/admin/videos', ensureAuth, ensureAdmin, asyncRoute(async (req, res) => {
  const { title, description, youtubeUrl, duration, language, rightsBasis, categories = [] } = req.body || {};
  if (!title || !youtubeUrl || !rightsBasis || !Number.isInteger(Number(duration)) || Number(duration) <= 0) {
    return res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'Informe título, URL, duração positiva e declaração da base de direitos do conteúdo.',
    });
  }

  let youtubeId;
  try {
    const url = new URL(youtubeUrl);
    if (url.hostname === 'youtu.be') youtubeId = url.pathname.slice(1);
    else if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) youtubeId = url.searchParams.get('v');
  } catch {
    return res.status(400).json({ code: 'INVALID_YOUTUBE_URL', message: 'Informe uma URL válida do YouTube.' });
  }
  if (!youtubeId || !/^[A-Za-z0-9_-]{11}$/.test(youtubeId)) {
    return res.status(400).json({ code: 'INVALID_YOUTUBE_URL', message: 'A URL não contém um ID válido de vídeo do YouTube.' });
  }
  const { data: existingVideo, error: existingVideoError } = await supabase
    .from('videos')
    .select('id, title, status')
    .eq('youtube_id', youtubeId)
    .maybeSingle();
  if (existingVideoError) return handleDatabaseError(res, existingVideoError);
  if (existingVideo) {
    return res.status(409).json({
      code: 'VIDEO_ALREADY_EXISTS',
      message: `Este vídeo já está cadastrado como “${existingVideo.title}” (${existingVideo.status.toLowerCase()}).`,
    });
  }
  if (!Array.isArray(categories) || categories.some((category) => typeof category !== 'string' || !category.trim())) {
    return res.status(400).json({ code: 'INVALID_CATEGORIES', message: 'Categorias inválidas.' });
  }

  const { data, error } = await supabase
    .from('videos')
    .insert({
      title,
      description: description || '',
      youtube_url: youtubeUrl,
      youtube_id: youtubeId,
      duration_seconds: Number(duration),
      language: language || 'pt-BR',
      rights_basis: rightsBasis,
      status: 'DRAFT',
      created_by: req.user.id,
    })
    .select('id, title, description, youtube_url, youtube_id, duration_seconds, language, status, embeddable')
    .single();
  if (error?.code === '23505') {
    return res.status(409).json({
      code: 'VIDEO_ALREADY_EXISTS',
      message: 'Este vídeo já foi cadastrado. Verifique a lista de debates antes de tentar novamente.',
    });
  }
  if (error) return handleDatabaseError(res, error);
  await audit(req, 'VIDEO_CREATE', 'video', data.id, { title });

  if (categories.length) {
    const { data: categoryRows, error: categoryError } = await supabase
      .from('video_categories')
      .upsert(categories.map((name) => ({ name: name.trim() })), { onConflict: 'name' })
      .select('id');
    if (categoryError) return handleDatabaseError(res, categoryError);

    const relations = categoryRows.map((category) => ({ video_id: data.id, category_id: category.id }));
    const { error: relationError } = await supabase.from('video_category_relations').insert(relations);
    if (relationError) return handleDatabaseError(res, relationError);
  }

  res.status(201).json({ item: toVideo(data) });
}));

// ---------------------------------------------------------------------------
// Rotas administrativas (todas exigem ensureAuth + ensureAdmin)
// ---------------------------------------------------------------------------
const MIN_AGGREGATE_SAMPLE = 5; // n mínimo para exibir médias agregadas (especificação 5.5)

// Registro de auditoria; falha de gravação é logada, mas não derruba a ação.
async function audit(req, action, entityType, entityId, metadata = {}) {
  const { error } = await supabase.from('audit_logs').insert({
    actor_id: req.user.id, action, entity_type: entityType, entity_id: entityId, metadata,
  });
  if (error) console.error('Falha ao gravar auditoria:', error.message);
}

const averageOf = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

app.get('/api/v1/admin/reports/overview', ensureAuth, ensureAdmin, asyncRoute(async (req, res) => {
  const [users, videos, approved, pending, cycles, attempts, jobs] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    supabase.from('videos').select('status').is('deleted_at', null),
    supabase.from('quizzes').select('id', { count: 'exact', head: true }).eq('status', 'APPROVED'),
    supabase.from('quizzes').select('id', { count: 'exact', head: true }).eq('status', 'PENDING_REVIEW'),
    supabase.from('user_cycles').select('id, state, status'),
    supabase.from('quiz_attempts').select('cycle_id, attempt_type, score').eq('status', 'SUBMITTED'),
    supabase.from('ai_jobs').select('id', { count: 'exact', head: true }).eq('status', 'RUNNING'),
  ]);
  const errors = [users, videos, approved, pending, cycles, attempts, jobs].map((result) => result.error).filter(Boolean);
  if (errors.length) return handleDatabaseError(res, errors[0]);

  // Pares inicial/final por ciclo (somente ciclos com as duas avaliações enviadas).
  const byCycle = new Map();
  for (const attempt of attempts.data) {
    const entry = byCycle.get(attempt.cycle_id) || {};
    entry[attempt.attempt_type] = Number(attempt.score);
    byCycle.set(attempt.cycle_id, entry);
  }
  const pairs = [...byCycle.values()].filter((entry) => entry.INITIAL != null && entry.FINAL != null);
  const visible = pairs.length >= MIN_AGGREGATE_SAMPLE;
  const gains = pairs.filter((pair) => pair.INITIAL < 100).map((pair) => (pair.FINAL - pair.INITIAL) / (100 - pair.INITIAL));

  const funnel = {};
  for (const cycle of cycles.data) {
    const key = cycle.status === 'ABANDONED' ? 'ABANDONED' : cycle.state;
    funnel[key] = (funnel[key] || 0) + 1;
  }
  const completedCycles = cycles.data.filter((cycle) => cycle.status === 'COMPLETED').length;

  res.json({
    totalUsers: users.count || 0,
    totalVideos: videos.data.length,
    publishedVideos: videos.data.filter((video) => video.status === 'PUBLISHED').length,
    approvedQuizzes: approved.count || 0,
    pendingQuizzes: pending.count || 0,
    totalCycles: cycles.data.length,
    completedCycles,
    completionRate: cycles.data.length ? (completedCycles / cycles.data.length) * 100 : null,
    activeJobs: jobs.count || 0,
    minSample: MIN_AGGREGATE_SAMPLE,
    funnel,
    outcomes: {
      sampleSize: pairs.length,
      visible,
      avgInitial: visible ? averageOf(pairs.map((pair) => pair.INITIAL)) : null,
      avgFinal: visible ? averageOf(pairs.map((pair) => pair.FINAL)) : null,
      avgVariation: visible ? averageOf(pairs.map((pair) => pair.FINAL - pair.INITIAL)) : null,
      avgNormalizedGain: visible ? averageOf(gains) : null,
    },
  });
}));

app.patch('/api/v1/admin/videos/:id', ensureAuth, ensureAdmin, asyncRoute(async (req, res) => {
  const { status } = req.body || {};
  if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
    return res.status(400).json({ code: 'INVALID_STATUS', message: 'Status inválido.' });
  }
  const { data, error } = await supabase
    .from('videos')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .is('deleted_at', null)
    .select('id, title, status')
    .maybeSingle();
  if (error) return handleDatabaseError(res, error);
  if (!data) return res.status(404).json({ code: 'VIDEO_NOT_FOUND', message: 'Debate não encontrado.' });
  await audit(req, 'VIDEO_STATUS_CHANGE', 'video', data.id, { title: data.title, status });
  res.json({ ok: true, item: data });
}));

app.get('/api/v1/admin/quizzes', ensureAuth, ensureAdmin, asyncRoute(async (req, res) => {
  const status = String(req.query.status || '');
  if (status && !['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED'].includes(status)) {
    return res.status(400).json({ code: 'INVALID_STATUS', message: 'Filtro de status inválido.' });
  }
  let query = supabase
    .from('quizzes')
    .select('id, video_id, version, status, created_at, videos(title), questions(id)')
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return handleDatabaseError(res, error);
  res.json({
    items: data.map((quiz) => ({
      id: quiz.id,
      videoId: quiz.video_id,
      videoTitle: quiz.videos?.title || 'Debate removido',
      version: quiz.version,
      status: quiz.status,
      questionCount: quiz.questions.length,
      createdAt: quiz.created_at,
    })),
  });
}));

// Gabarito e explicações só saem aqui, para revisão humana (rota restrita a ADMIN).
app.get('/api/v1/admin/quizzes/:id', ensureAuth, ensureAdmin, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('quizzes')
    .select('id, version, status, videos(title), questions(id, statement, explanation, category, difficulty, evidence_excerpt, timestamp_seconds, created_at, question_options(id, content, position_hint), question_answer_keys(correct_option_id))')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return handleDatabaseError(res, error);
  if (!data) return res.status(404).json({ code: 'QUIZ_NOT_FOUND', message: 'Questionário não encontrado.' });
  const questions = [...data.questions]
    .sort((left, right) => new Date(left.created_at) - new Date(right.created_at))
    .map((question) => {
      const key = [].concat(question.question_answer_keys || [])[0];
      return {
        id: question.id,
        statement: question.statement,
        explanation: question.explanation,
        category: question.category,
        difficulty: question.difficulty,
        evidenceExcerpt: question.evidence_excerpt,
        timestampSeconds: question.timestamp_seconds,
        options: [...question.question_options]
          .sort((left, right) => left.position_hint - right.position_hint)
          .map((option) => ({ id: option.id, text: option.content, isCorrect: option.id === key?.correct_option_id })),
      };
    });
  res.json({ item: { id: data.id, version: data.version, status: data.status, videoTitle: data.videos?.title, questions } });
}));

app.post('/api/v1/admin/quizzes/:id/approve', ensureAuth, ensureAdmin, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('quizzes')
    .update({ status: 'APPROVED', approved_by: req.user.id, approved_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('status', 'PENDING_REVIEW')
    .select('id, video_id, version, status, approved_by, approved_at')
    .maybeSingle();
  if (error) return handleDatabaseError(res, error);
  if (!data) return res.status(404).json({ code: 'QUIZ_NOT_FOUND', message: 'Questionário pendente não encontrado.' });
  await supabase.from('quiz_review_events').insert({ quiz_id: data.id, admin_id: req.user.id, action: 'APPROVE' });
  await audit(req, 'QUIZ_APPROVE', 'quiz', data.id, { version: data.version, videoId: data.video_id });
  res.json({ ok: true, item: data });
}));

app.post('/api/v1/admin/quizzes/:id/reject', ensureAuth, ensureAdmin, asyncRoute(async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 500) {
    return res.status(400).json({ code: 'REASON_REQUIRED', message: 'Informe o motivo da reprovação (até 500 caracteres).' });
  }
  const { data, error } = await supabase
    .from('quizzes')
    .update({ status: 'REJECTED' })
    .eq('id', req.params.id)
    .eq('status', 'PENDING_REVIEW')
    .select('id, video_id, version, status')
    .maybeSingle();
  if (error) return handleDatabaseError(res, error);
  if (!data) return res.status(404).json({ code: 'QUIZ_NOT_FOUND', message: 'Questionário pendente não encontrado.' });
  await supabase.from('quiz_review_events').insert({ quiz_id: data.id, admin_id: req.user.id, action: 'REJECT', reason });
  await audit(req, 'QUIZ_REJECT', 'quiz', data.id, { version: data.version, reason });
  res.json({ ok: true, item: data });
}));

app.post('/api/v1/admin/ai-jobs/:id/retry', ensureAuth, ensureAdmin, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('ai_jobs')
    .update({ status: 'QUEUED', step: 'QUEUED', error_message: null, locked_by: null, lease_expires_at: null, next_run_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .in('status', ['FAILED', 'CANCELLED'])
    .select('id')
    .maybeSingle();
  if (error) return handleDatabaseError(res, error);
  if (!data) return res.status(409).json({ code: 'JOB_NOT_RETRYABLE', message: 'Só é possível reprocessar jobs que falharam ou foram cancelados.' });
  await audit(req, 'AI_JOB_RETRY', 'ai_job', data.id);
  res.json({ ok: true });
}));

app.post('/api/v1/admin/ai-jobs/:id/cancel', ensureAuth, ensureAdmin, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('ai_jobs')
    .update({ status: 'CANCELLED', finished_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .in('status', ['QUEUED', 'RUNNING'])
    .select('id')
    .maybeSingle();
  if (error) return handleDatabaseError(res, error);
  if (!data) return res.status(409).json({ code: 'JOB_NOT_CANCELLABLE', message: 'Só é possível cancelar jobs na fila ou em execução.' });
  await audit(req, 'AI_JOB_CANCEL', 'ai_job', data.id);
  res.json({ ok: true });
}));

app.get('/api/v1/admin/users', ensureAuth, ensureAdmin, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return handleDatabaseError(res, error);
  res.json({ items: data.map((user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, status: user.status, createdAt: user.created_at })) });
}));

app.patch('/api/v1/admin/users/:id', ensureAuth, ensureAdmin, asyncRoute(async (req, res) => {
  const { status } = req.body || {};
  if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
    return res.status(400).json({ code: 'INVALID_STATUS', message: 'Status inválido.' });
  }
  if (req.params.id === req.user.id) {
    return res.status(409).json({ code: 'SELF_CHANGE_BLOCKED', message: 'Você não pode alterar o status da própria conta.' });
  }
  const { data, error } = await supabase
    .from('profiles')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('role', 'USER')
    .neq('status', 'DELETED')
    .select('id, email, status')
    .maybeSingle();
  if (error) return handleDatabaseError(res, error);
  if (!data) return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'Usuário não encontrado ou não pode ser alterado.' });
  await audit(req, 'USER_STATUS_CHANGE', 'user', data.id, { email: data.email, status });
  res.json({ ok: true, item: data });
}));

app.get('/api/v1/admin/audit-logs', ensureAuth, ensureAdmin, asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, metadata, created_at, profiles(name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return handleDatabaseError(res, error);
  res.json({
    items: data.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entity_type,
      entityId: log.entity_id,
      metadata: log.metadata,
      actorName: log.profiles?.name || null,
      createdAt: log.created_at,
    })),
  });
}));

app.use('/api/v1/admin', createAdminContentRouter({
  supabase,
  asyncRoute,
  handleDatabaseError,
  ensureAuth,
  ensureAdmin,
  audit,
}));

app.use('/api/v1/admin', createAdminProfilesRouter({
  supabase,
  asyncRoute,
  handleDatabaseError,
  ensureAuth,
  ensureAdmin,
  audit,
}));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

app.use((req, res) => {
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') {
    console.warn(`JSON inválido na requisição ${req.method} ${req.path}.`);
    return res.status(400).json({
      code: 'INVALID_JSON',
      message: 'O corpo da requisição não contém JSON válido. Verifique aspas, chaves e o cabeçalho Content-Type: application/json.',
    });
  }
  const status = Number(error.statusCode || error.status);
  if (status >= 400 && status < 500) {
    console.warn(`Requisição inválida (${status}) em ${req.method} ${req.path}: ${error.message}`);
    return res.status(status).json({
      code: status === 413 ? 'REQUEST_TOO_LARGE' : 'INVALID_REQUEST',
      message: status === 413 ? 'O corpo da requisição excede o limite permitido.' : 'Requisição inválida.',
    });
  }
  console.error('Unhandled API error:', error.message);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`Plataforma de debates rodando em http://localhost:${PORT}`);
});
