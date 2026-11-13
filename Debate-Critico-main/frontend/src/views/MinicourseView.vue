<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { clearSession, session } from '../lib/session';
import { levels, modules, quickTips } from '../data/minicourse';

const router = useRouter();
const progressKey = `debate-critico:minicurso:v1:${session.user?.id || 'usuario'}`;
const notice = ref('');
const activeView = ref('trilha');
const screen = ref('home');
const activeModuleId = ref(modules[0]?.id || '');
const activeLessonId = ref('');
const quizSession = ref(null);
const quizResult = ref(null);
const showModelAnswer = ref(false);
const reflectionAnswer = ref('');
const tipCategory = ref('todos');
const tipQuery = ref('');

function emptyProgress() {
  return { lessons: [], passed: [], attempts: {} };
}

function readProgress() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(progressKey) || '{}');
    return {
      lessons: Array.isArray(saved.lessons) ? [...new Set(saved.lessons)] : [],
      passed: Array.isArray(saved.passed) ? [...new Set(saved.passed)] : [],
      attempts: saved.attempts && typeof saved.attempts === 'object' ? saved.attempts : {},
    };
  } catch {
    return emptyProgress();
  }
}

const progress = ref(readProgress());
const activeModule = computed(() => modules.find((module) => module.id === activeModuleId.value));
const activeLesson = computed(() => activeModule.value?.lessons.find((lesson) => lesson.id === activeLessonId.value));
const progressPercent = computed(() => {
  const completed = new Set(progress.value.lessons.filter((id) => modules.some((module) => module.lessons.some((lesson) => lesson.id === id))));
  const total = modules.reduce((count, module) => count + module.lessons.length, 0);
  return total ? Math.round((completed.size / total) * 100) : 0;
});
const visibleTips = computed(() => {
  const query = tipQuery.value.trim().toLocaleLowerCase('pt-BR');
  return quickTips.filter((tip) => {
    const matchesCategory = tipCategory.value === 'todos' || tip.category === tipCategory.value;
    const searchable = `${tip.name} ${tip.hint} ${tip.definition} ${tip.example}`.toLocaleLowerCase('pt-BR');
    return matchesCategory && searchable.includes(query);
  });
});
const totalLessons = computed(() => modules.reduce((count, module) => count + module.lessons.length, 0));
const totalQuestions = computed(() => modules.reduce((count, module) => count + module.questions.length, 0));

function saveProgress() {
  try {
    sessionStorage.setItem(progressKey, JSON.stringify(progress.value));
  } catch {
    notice.value = 'Não foi possível salvar o progresso neste navegador.';
  }
}

function setView(view) {
  activeView.value = view;
  screen.value = 'home';
  notice.value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hasCompletedLesson(lessonId) {
  return progress.value.lessons.includes(lessonId);
}

function isModuleComplete(moduleId) {
  return progress.value.passed.includes(moduleId);
}

function isModuleAvailable(index) {
  return index === 0 || isModuleComplete(modules[index - 1].id);
}

function lessonsAtLevel(module, levelId) {
  return module.lessons.filter((lesson) => lesson.level === levelId);
}

function isLevelAvailable(module, levelId) {
  const levelIndex = levels.findIndex((level) => level.id === levelId);
  if (levelIndex <= 0) return true;
  return lessonsAtLevel(module, levels[levelIndex - 1].id).every((lesson) => hasCompletedLesson(lesson.id));
}

function isLessonAvailable(module, lesson) {
  const lessonIndex = module.lessons.findIndex((item) => item.id === lesson.id);
  return module.lessons.slice(0, lessonIndex).every((item) => hasCompletedLesson(item.id))
    && isLevelAvailable(module, lesson.level);
}

function moduleLessonCount(module) {
  return module.lessons.filter((lesson) => hasCompletedLesson(lesson.id)).length;
}

function moduleStatus(module, index) {
  if (isModuleComplete(module.id)) return 'Concluído';
  return isModuleAvailable(index) ? 'Em andamento' : 'Bloqueado';
}

function firstOpenModule() {
  return modules.find((module, index) => isModuleAvailable(index) && !isModuleComplete(module.id))
    || modules[modules.length - 1];
}

function openModule(moduleId) {
  const index = modules.findIndex((module) => module.id === moduleId);
  if (index < 0) return;
  if (!isModuleAvailable(index)) {
    notice.value = 'Conclua e aprove o módulo anterior para avançar.';
    return;
  }
  activeModuleId.value = moduleId;
  screen.value = 'module';
  activeView.value = 'trilha';
  notice.value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function continueCourse() {
  const module = firstOpenModule();
  if (!module) return;
  const firstLesson = module.lessons.find((lesson) => !hasCompletedLesson(lesson.id));
  if (firstLesson) openLesson(module.id, firstLesson.id);
  else {
    activeModuleId.value = module.id;
    startQuiz(module.id);
  }
}

function openLesson(moduleId, lessonId) {
  const module = modules.find((item) => item.id === moduleId);
  const lesson = module?.lessons.find((item) => item.id === lessonId);
  if (!module || !lesson) return;
  const moduleIndex = modules.indexOf(module);
  if (!isModuleAvailable(moduleIndex) || !isLessonAvailable(module, lesson)) {
    notice.value = 'Siga a sequência: conclua as aulas anteriores primeiro.';
    return;
  }
  activeModuleId.value = moduleId;
  activeLessonId.value = lessonId;
  screen.value = 'lesson';
  activeView.value = 'trilha';
  notice.value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function completeLesson() {
  const module = activeModule.value;
  const lesson = activeLesson.value;
  if (!module || !lesson) return;
  if (!hasCompletedLesson(lesson.id)) {
    progress.value.lessons.push(lesson.id);
    saveProgress();
  }

  const index = module.lessons.findIndex((item) => item.id === lesson.id);
  const nextLesson = module.lessons[index + 1];
  if (nextLesson && isLessonAvailable(module, nextLesson)) openLesson(module.id, nextLesson.id);
  else openModule(module.id);
}

function startQuiz(moduleId) {
  const module = modules.find((item) => item.id === moduleId);
  const index = modules.indexOf(module);
  if (!module || !isModuleAvailable(index)) return;
  activeModuleId.value = moduleId;
  activeView.value = 'trilha';
  screen.value = 'quiz';
  quizSession.value = { index: 0, correct: 0, selected: null };
  quizResult.value = null;
  reflectionAnswer.value = '';
  showModelAnswer.value = false;
  notice.value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function answerQuestion(optionIndex) {
  if (!quizSession.value || quizSession.value.selected !== null) return;
  const question = activeModule.value.questions[quizSession.value.index];
  quizSession.value.selected = optionIndex;
  if (optionIndex === question.correct) quizSession.value.correct += 1;
}

function nextQuestion() {
  if (!quizSession.value || quizSession.value.selected === null) return;
  if (quizSession.value.index < activeModule.value.questions.length - 1) {
    quizSession.value.index += 1;
    quizSession.value.selected = null;
    return;
  }
  finishQuiz();
}

function finishQuiz() {
  const module = activeModule.value;
  const { correct } = quizSession.value;
  const score = Math.round((correct / module.questions.length) * 100);
  const lessonsComplete = module.lessons.every((lesson) => hasCompletedLesson(lesson.id));
  const passed = score >= 70 && lessonsComplete;
  const previousBest = progress.value.attempts[module.id]?.best || 0;

  progress.value.attempts[module.id] = {
    best: Math.max(previousBest, score),
    last: score,
    total: module.questions.length,
    correct,
  };
  if (passed && !isModuleComplete(module.id)) progress.value.passed.push(module.id);
  saveProgress();
  quizResult.value = { score, correct, total: module.questions.length, passed, lessonsComplete };
  screen.value = 'result';
}

function openTipModule(moduleId) {
  openModule(moduleId);
}

function categoryName(category) {
  return { falacia: 'Falácia', retorica: 'Retórica', checagem: 'Checagem' }[category] || 'Conceito';
}

function logout() {
  clearSession();
  router.replace('/');
}

function printModule() {
  window.print();
}
</script>

<template>
  <div class="course-page">
    <header class="course-topbar">
      <div class="course-topbar-inner">
        <RouterLink class="course-brand" to="/app/curso" aria-label="ARGUMENTA, minicurso" @click="setView('trilha')">
          <span class="course-brand-mark">A</span>
          <span>ARGUMENTA<small>LABORATÓRIO DE PENSAMENTO CRÍTICO</small></span>
        </RouterLink>
        <nav class="course-main-nav" aria-label="Navegação do minicurso">
          <button class="course-nav-link" :class="{ active: activeView === 'trilha' }" :aria-current="activeView === 'trilha' ? 'page' : undefined" @click="setView('trilha')">Minicurso</button>
          <button class="course-nav-link" :class="{ active: activeView === 'macetes' }" :aria-current="activeView === 'macetes' ? 'page' : undefined" @click="setView('macetes')">Consulta rápida</button>
          <RouterLink class="course-nav-link" to="/app">Debates</RouterLink>
        </nav>
        <div class="course-user">
          <span>{{ session.user?.name || 'Estudante' }}</span>
          <RouterLink to="/app" class="course-user-link">Minha área</RouterLink>
          <button class="course-user-link" @click="logout">Sair</button>
        </div>
        <div class="course-top-progress">
          <span>{{ progressPercent }}% concluído</span>
          <span class="course-progress-line" role="progressbar" aria-label="Progresso do minicurso" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="progressPercent">
            <i :style="{ width: `${progressPercent}%` }"></i>
          </span>
        </div>
      </div>
    </header>

    <main class="course-shell">
      <p v-if="notice" class="course-notice" role="status">{{ notice }}</p>

      <template v-if="activeView === 'trilha'">
        <template v-if="screen === 'home'">
          <section class="course-hero">
            <div>
              <p class="course-eyebrow">Pensamento crítico · análise de discursos</p>
              <h1>Aprender a ler o que está por trás das palavras.</h1>
              <p class="course-hero-copy">Quatro módulos para entender argumentos, reconhecer falácias, analisar persuasão e checar informações. Avance no seu ritmo: cada etapa prepara a próxima.</p>
              <div class="course-hero-actions">
                <button class="course-button" @click="continueCourse">Continuar a trilha <span aria-hidden="true">→</span></button>
                <RouterLink class="course-button-outline" to="/app">Aplicar nos debates</RouterLink>
              </div>
              <div class="course-hero-stats">
                <span>4 módulos</span><span>{{ totalLessons }} aulas</span><span>3 níveis</span><span>{{ totalQuestions }} exercícios</span>
              </div>
            </div>
            <article class="course-paper course-hero-note">
              <div class="course-note-top"><span class="course-label">Ficha de análise</span><span class="course-label">Nº 01</span></div>
              <blockquote>“O candidato não explicou o plano, portanto não tem plano.”</blockquote>
              <div class="course-analysis-list">
                <div><b>Tese</b><span>O candidato não tem plano.</span></div>
                <div><b>Evidência</b><span>A fala não apresentou uma explicação naquele trecho.</span></div>
                <div><b>Raciocínio</b><span>Uma ausência de explicação é tratada como prova de inexistência.</span></div>
              </div>
              <div class="course-signal"><strong>Sinal de alerta</strong>Não apresentar evidência em um trecho não demonstra que o plano não exista. Procure o documento e examine seu conteúdo.</div>
            </article>
          </section>

          <section class="course-section">
            <div class="course-section-heading">
              <div><span class="course-eyebrow">A trilha</span><h2>Quatro módulos, uma ordem que faz sentido</h2><p>Primeiro compreenda a estrutura do argumento; depois identifique falhas; em seguida analise estratégias de persuasão; por fim verifique alegações e fontes.</p></div>
            </div>
            <div class="course-module-list">
              <button v-for="(module, index) in modules" :key="module.id" class="course-module-row" :disabled="!isModuleAvailable(index)" @click="openModule(module.id)">
                <span class="course-module-number">{{ module.number }}</span>
                <span class="course-module-main">
                  <strong class="course-module-title">Módulo {{ module.number }} — {{ module.title }}</strong>
                  <span class="course-module-sub">{{ module.subtitle }}</span>
                  <span class="course-module-meta"><span>{{ module.lessons.length }} aulas</span><span>3 níveis</span><span>{{ module.questions.length }} questões</span></span>
                </span>
                <span class="course-module-status">
                  <strong>{{ moduleStatus(module, index) }}</strong>
                  <span>{{ moduleLessonCount(module) }}/{{ module.lessons.length }}</span>
                  <span class="course-mini-bar"><i :style="{ width: `${(moduleLessonCount(module) / module.lessons.length) * 100}%` }"></i></span>
                </span>
              </button>
            </div>
          </section>

          <section class="course-steps-band">
            <div class="course-section">
              <div class="course-section-heading"><div><span class="course-eyebrow">Como se estuda aqui</span><h2>Três movimentos por conceito</h2></div></div>
              <div class="course-steps">
                <article><span>01</span><h3>Estude a aula</h3><p>Objetivos, teoria, exemplos fictícios, comparações, quadros de atenção e macetes em sequência progressiva.</p></article>
                <article><span>02</span><h3>Treine com feedback</h3><p>Questões variadas com explicação para cada resposta e espaço para elaborar sua própria análise.</p></article>
                <article><span>03</span><h3>Aplique nos debates</h3><p>Use a trilha para examinar argumentos reais com cuidado, sem reduzir pessoas a rótulos.</p></article>
              </div>
            </div>
          </section>

          <section class="course-section course-criteria">
            <div class="course-section-heading">
              <div><span class="course-eyebrow">Critério de avanço</span><h2>Aprender antes de desbloquear</h2><p>Conclua as aulas de um módulo e alcance ao menos 70% no exercício final para liberar o módulo seguinte. É possível refazer a avaliação.</p></div>
              <button class="course-button-outline" @click="setView('macetes')">Abrir consulta rápida</button>
            </div>
            <div class="course-notice">Persuasão não é sinônimo de manipulação, e uma falácia em uma frase não torna automaticamente todo o discurso falso. O curso analisa razões e evidências, não partidos ou identidades.<br><br><strong>Todas as falas, personagens e situações retratadas são fictícias.</strong></div>
            <p class="course-local-note">Seu progresso é salvo neste navegador para esta conta.</p>
          </section>
        </template>

        <template v-else-if="screen === 'module' && activeModule">
          <section class="course-module-hero">
            <div class="course-crumb"><button @click="screen = 'home'">MINICURSO</button> / MÓDULO {{ activeModule.number }}</div>
            <span class="course-eyebrow">Formação em pensamento crítico</span>
            <h1>Módulo {{ activeModule.number }} — {{ activeModule.title }}</h1>
            <p>{{ activeModule.intro }}</p>
            <div class="course-module-tools">
              <button class="course-button" @click="startQuiz(activeModule.id)">Exercícios do módulo · {{ activeModule.questions.length }} questões</button>
              <button class="course-button-outline" @click="printModule">Imprimir / salvar como PDF</button>
              <RouterLink class="course-text-link" to="/app">Ir aos debates →</RouterLink>
            </div>
            <div class="course-learning-sequence">
              <div v-for="(level, index) in levels" :key="level.id" :class="{ locked: !isLevelAvailable(activeModule, level.id) }">
                <span>{{ String(index + 1).padStart(2, '0') }} · {{ level.name }}</span>
                {{ lessonsAtLevel(activeModule, level.id).filter((lesson) => hasCompletedLesson(lesson.id)).length }}/{{ lessonsAtLevel(activeModule, level.id).length }} aulas concluídas
              </div>
            </div>
          </section>

          <section v-for="level in levels" :key="level.id" class="course-level-section">
            <div class="course-level-heading">
              <div><span class="course-eyebrow">{{ isLevelAvailable(activeModule, level.id) ? 'Etapa disponível' : 'Etapa bloqueada até concluir o nível anterior' }}</span><h2>{{ level.name }}</h2><p>{{ level.description }}</p></div>
              <span class="course-level-count">{{ lessonsAtLevel(activeModule, level.id).filter((lesson) => hasCompletedLesson(lesson.id)).length }}/{{ lessonsAtLevel(activeModule, level.id).length }} aulas</span>
            </div>
            <div>
              <button v-for="lesson in lessonsAtLevel(activeModule, level.id)" :key="lesson.id" class="course-lesson-row" :disabled="!isLessonAvailable(activeModule, lesson)" @click="openLesson(activeModule.id, lesson.id)">
                <span class="course-lesson-icon">{{ hasCompletedLesson(lesson.id) ? '✓' : '○' }}</span>
                <span><strong>{{ lesson.title }}</strong><small>{{ lesson.summary }}</small></span>
                <span class="course-tag" :class="lesson.level">{{ lesson.minutes }} min</span>
              </button>
            </div>
          </section>

          <section class="course-section">
            <div class="course-section-heading">
              <div><span class="course-eyebrow">Pronto para aplicar?</span><h2>Mostre o que você compreendeu</h2><p>Avaliação com identificação de técnicas, leitura de argumentos e aplicação em situações fictícias.</p></div>
              <button class="course-button" @click="startQuiz(activeModule.id)">Iniciar avaliação</button>
            </div>
            <div v-if="isModuleComplete(activeModule.id)" class="course-notice">Módulo concluído. Sua melhor aprovação foi de {{ progress.attempts[activeModule.id]?.best }}%. Você pode voltar às aulas ou refazer a avaliação.</div>
          </section>
        </template>

        <template v-else-if="screen === 'lesson' && activeModule && activeLesson">
          <section class="course-lesson-layout">
            <article class="course-lesson-content">
              <div class="course-crumb"><button @click="openModule(activeModule.id)">MÓDULO {{ activeModule.number }}</button> / {{ levels.find((level) => level.id === activeLesson.level)?.name.toUpperCase() }}</div>
              <span class="course-tag" :class="activeLesson.level">{{ levels.find((level) => level.id === activeLesson.level)?.name }} · {{ activeLesson.minutes }} min</span>
              <h1>{{ activeLesson.title }}</h1>
              <p class="course-lead">{{ activeLesson.summary }}</p>
              <div class="course-objectives">
                <strong>Objetivos de aprendizagem</strong>
                <ul><li v-for="objective in activeLesson.objectives" :key="objective">{{ objective }}</li></ul>
              </div>
              <section v-for="(section, index) in activeLesson.sections" :id="`course-section-${index}`" :key="section.title" class="course-content-block">
                <h2>{{ section.title }}</h2>
                <p>{{ section.text }}</p>
                <div v-if="section.example" class="course-example-box"><span class="course-eyebrow">Exemplo fictício</span><blockquote>{{ section.example }}</blockquote></div>
                <div v-if="section.attention" class="course-attention"><strong>Quadro de atenção</strong><p>{{ section.attention }}</p></div>
                <div v-if="section.valid" class="course-compare-grid">
                  <div class="course-compare"><strong>Argumento mais bem sustentado</strong><p>{{ section.valid }}</p></div>
                  <div class="course-compare problem"><strong>Argumento problemático</strong><p>{{ section.problem }}</p></div>
                </div>
              </section>
              <div class="course-content-block"><div class="course-paper course-trick"><span class="course-eyebrow">Macete para lembrar</span><p>“{{ activeLesson.trick }}”</p></div></div>
              <div id="course-takeaways" class="course-content-block"><div class="course-takeaways"><span class="course-eyebrow">Em síntese</span><ul><li v-for="item in activeLesson.takeaways" :key="item">{{ item }}</li></ul></div></div>
              <div class="course-lesson-footer">
                <button class="course-button-outline" @click="openModule(activeModule.id)">← Voltar ao módulo</button>
                <button class="course-button" @click="completeLesson">{{ hasCompletedLesson(activeLesson.id) ? 'Aula concluída ✓' : 'Concluir e continuar →' }}</button>
              </div>
            </article>
            <aside class="course-paper course-lesson-sidebar">
              <span class="course-eyebrow">Nesta aula</span><h2>Conteúdo</h2>
              <a v-for="(section, index) in activeLesson.sections" :key="section.title" :href="`#course-section-${index}`">{{ section.title }}</a>
              <a href="#course-takeaways">Macete e síntese</a>
              <p>Seu progresso é salvo neste navegador. O material pode ser impresso ou salvo como PDF.</p>
            </aside>
          </section>
        </template>

        <template v-else-if="screen === 'quiz' && activeModule && quizSession">
          <section class="course-module-hero">
            <div class="course-crumb"><button @click="openModule(activeModule.id)">MÓDULO {{ activeModule.number }}</button> / EXERCÍCIOS</div>
            <span class="course-eyebrow">Prática comentada · questão {{ quizSession.index + 1 }} de {{ activeModule.questions.length }}</span>
            <h1>{{ activeModule.title }}</h1>
            <p>Responda pelo raciocínio, não apenas pelo nome do conceito. Leia o comentário antes de avançar.</p>
          </section>
          <section class="course-paper course-quiz-card">
            <div class="course-level-heading"><span class="course-tag" :class="activeModule.questions[quizSession.index].level">{{ levels.find((level) => level.id === activeModule.questions[quizSession.index].level)?.name }}</span><span class="course-eyebrow">{{ activeModule.questions[quizSession.index].type }}</span></div>
            <div class="course-quiz-progress"><i :style="{ width: `${(quizSession.index / activeModule.questions.length) * 100}%` }"></i></div>
            <h2>{{ activeModule.questions[quizSession.index].stem }}</h2>
            <div class="course-quiz-options">
              <button v-for="(option, index) in activeModule.questions[quizSession.index].options" :key="option" class="course-quiz-option" :class="{ correct: quizSession.selected !== null && index === activeModule.questions[quizSession.index].correct, wrong: quizSession.selected === index && index !== activeModule.questions[quizSession.index].correct }" :disabled="quizSession.selected !== null" @click="answerQuestion(index)">
                <span>{{ String.fromCharCode(65 + index) }}</span><span>{{ option }}</span>
              </button>
            </div>
            <div v-if="quizSession.selected !== null" class="course-feedback" :class="{ wrong: quizSession.selected !== activeModule.questions[quizSession.index].correct }" role="status">
              <strong>{{ quizSession.selected === activeModule.questions[quizSession.index].correct ? 'Boa análise.' : 'Revise o raciocínio.' }}</strong>
              {{ activeModule.questions[quizSession.index].explanation }}
            </div>
            <button v-if="quizSession.selected !== null" class="course-button course-next-question" @click="nextQuestion">{{ quizSession.index + 1 < activeModule.questions.length ? 'Próxima questão →' : 'Conferir resultado →' }}</button>
            <p class="course-eyebrow course-score-line">{{ quizSession.correct }} acerto{{ quizSession.correct === 1 ? '' : 's' }} até aqui</p>
          </section>
        </template>

        <template v-else-if="screen === 'result' && activeModule && quizResult">
          <section class="course-module-hero">
            <span class="course-eyebrow">Resultado do módulo {{ activeModule.number }}</span>
            <h1>{{ quizResult.passed ? 'Você está pronta para avançar.' : quizResult.score >= 70 ? 'Boa pontuação! Conclua as aulas para avançar.' : 'Mais uma rodada de estudo fortalece a aprendizagem.' }}</h1>
            <p>{{ quizResult.passed ? 'Você atingiu o critério mínimo e concluiu as aulas. Releia qualquer questão respondida por eliminação e siga para o próximo módulo.' : quizResult.score >= 70 ? 'Você atingiu 70% na avaliação. Para liberar o próximo módulo, conclua também todas as aulas.' : 'A aprovação exige 70%. Releia as aulas relacionadas aos itens que geraram dúvida e refaça a avaliação quando quiser.' }}</p>
          </section>
          <section class="course-paper course-result">
            <div class="course-result-number">{{ quizResult.score }}%</div>
            <p>{{ quizResult.correct }} de {{ quizResult.total }} respostas corretas</p>
            <p class="course-eyebrow">{{ quizResult.passed ? 'Módulo aprovado · próximo módulo liberado' : quizResult.score >= 70 ? 'Avaliação aprovada · aulas pendentes' : 'Abaixo do critério de avanço: 70%' }}</p>
            <div class="course-result-actions">
              <button class="course-button-outline" @click="startQuiz(activeModule.id)">Refazer exercício</button>
              <button class="course-button" @click="openModule(activeModule.id)">Voltar às aulas</button>
              <button v-if="quizResult.passed && modules[modules.indexOf(activeModule) + 1]" class="course-text-link" @click="openModule(modules[modules.indexOf(activeModule) + 1].id)">Próximo módulo →</button>
            </div>
          </section>
          <section class="course-section">
            <div class="course-section-heading"><div><span class="course-eyebrow">Responda por escrito</span><h2>Explique, não só nomeie</h2><p>Compare sua resposta com o roteiro e revise se identificou evidência, limite e pergunta de verificação.</p></div></div>
            <div class="course-reflection">
              <h3>{{ activeModule.reflection.prompt }}</h3>
              <textarea v-model="reflectionAnswer" placeholder="Organize sua análise..."></textarea>
              <button class="course-button-outline" @click="showModelAnswer = !showModelAnswer">{{ showModelAnswer ? 'Ocultar roteiro' : 'Ver roteiro comentado' }}</button>
              <div v-if="showModelAnswer" class="course-model-answer">{{ activeModule.reflection.model }}</div>
            </div>
          </section>
        </template>
      </template>

      <template v-else>
        <section class="course-module-hero">
          <span class="course-eyebrow">Consulta rápida</span>
          <h1>Macetes para ler com atenção.</h1>
          <p>Heurísticas curtas ajudam a notar sinais; não são veredictos automáticos. Confirme a leitura no contexto e explique a inferência problemática.</p>
          <div class="course-filter-row">
            <button v-for="item in [['todos', 'Todos'], ['falacia', 'Falácias'], ['retorica', 'Estratégias retóricas'], ['checagem', 'Checagem']]" :key="item[0]" class="course-filter-chip" :class="{ active: tipCategory === item[0] }" :aria-pressed="tipCategory === item[0]" @click="tipCategory = item[0]">{{ item[1] }}</button>
          </div>
          <label class="course-tip-search"><span class="course-eyebrow">Buscar um conceito</span><input v-model="tipQuery" type="search" placeholder="Ex.: falso dilema, estatística, autoridade" autocomplete="off"><span aria-live="polite">{{ visibleTips.length }} itens</span></label>
        </section>
        <div class="course-cards-grid">
          <article v-for="tip in visibleTips" :key="tip.name" class="course-paper course-tip-card">
            <div class="course-tip-title"><h2>{{ tip.name }}</h2><span class="course-tag" :class="tip.category">{{ categoryName(tip.category) }}</span></div>
            <p class="course-tip-hint">“{{ tip.hint }}”</p>
            <p>{{ tip.definition }}</p>
            <div class="course-example-box"><span class="course-eyebrow">Exemplo</span><p>{{ tip.example }}</p></div>
            <button class="course-text-link" @click="openTipModule(tip.module)">Estudar no módulo {{ tip.module.slice(1) }} →</button>
          </article>
          <p v-if="!visibleTips.length" class="course-empty">Nenhum conceito corresponde à busca. Tente outra palavra ou categoria.</p>
        </div>
        <div class="course-notice">Atalho útil não é prova de falácia. Pergunte primeiro se há um salto identificável, uma evidência ausente ou um contexto que muda a interpretação.</div>
      </template>
    </main>

    <footer class="course-footer course-shell">
      <span>ARGUMENTA · Pensamento crítico, não torcida.</span>
      <span>Exemplos fictícios, sem vínculo partidário. O curso analisa razões e evidências, não identidades.</span>
    </footer>
  </div>
</template>

<style scoped>
.course-page {
  --paper: #f5f2ea;
  --card: #fcfbf7;
  --ink: #20272b;
  --muted: #737873;
  --line: #dedbd2;
  --brick: #a74736;
  --sage: #577968;
  --ochre: #a87931;
  min-height: 100vh;
  background: var(--paper);
  color: var(--ink);
  font-family: "DM Sans", Inter, Arial, sans-serif;
  font-size: 15px;
}
.course-page * { box-sizing: border-box; }
.course-page :focus-visible { outline: 3px solid var(--ochre); outline-offset: 3px; }
.course-shell { width: min(1120px, calc(100% - 48px)); margin-inline: auto; }
.course-topbar { position: sticky; z-index: 10; top: 0; border-bottom: 1px solid var(--line); background: rgb(245 242 234 / 95%); backdrop-filter: blur(12px); }
.course-topbar-inner { display: flex; min-height: 72px; max-width: 1180px; align-items: center; gap: 25px; margin-inline: auto; padding: 0 24px; }
.course-brand { display: flex; flex: 0 0 auto; align-items: center; gap: 11px; color: var(--ink); font-size: 13px; font-weight: 700; letter-spacing: .14em; text-decoration: none; }
.course-brand-mark { display: grid; width: 34px; height: 34px; place-items: center; background: var(--ink); color: var(--paper); font: 20px Georgia, serif; }
.course-brand small { display: block; margin-top: 3px; color: var(--muted); font: 8px "DM Mono", Consolas, monospace; letter-spacing: .1em; }
.course-main-nav { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.course-nav-link { padding: 10px 11px; border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: 12px; text-decoration: none; }
.course-nav-link:hover, .course-nav-link.active { color: var(--ink); }
.course-nav-link.active { box-shadow: inset 0 -2px var(--brick); }
.course-user { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 10px; white-space: nowrap; }
.course-user-link { padding: 3px; border: 0; background: none; color: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.course-top-progress { display: grid; min-width: 112px; gap: 6px; color: var(--muted); font: 9px "DM Mono", Consolas, monospace; text-align: right; }
.course-progress-line, .course-mini-bar { display: block; height: 3px; background: var(--line); }
.course-progress-line i, .course-mini-bar i { display: block; height: 100%; background: var(--sage); transition: width .3s; }
.course-eyebrow, .course-label { color: var(--muted); font: 10px "DM Mono", Consolas, monospace; letter-spacing: .16em; text-transform: uppercase; }
.course-paper { border: 1px solid var(--line); background: var(--card); }
.course-hero { display: grid; grid-template-columns: 1.04fr .96fr; gap: 52px; align-items: center; padding: 66px 0 56px; border-bottom: 1px solid var(--line); }
.course-hero h1, .course-module-hero h1 { max-width: 720px; margin: 17px 0; font: 400 clamp(38px, 5vw, 61px)/1.07 "Playfair Display", Georgia, serif; letter-spacing: -.025em; }
.course-hero-copy { max-width: 590px; color: #555d5e; font-size: 15px; line-height: 1.8; }
.course-hero-actions, .course-module-tools, .course-result-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 24px; }
.course-button, .course-button-outline, .course-text-link { display: inline-flex; min-height: 42px; align-items: center; justify-content: center; gap: 9px; padding: 0 17px; border: 1px solid var(--ink); cursor: pointer; font-size: 12px; font-weight: 600; text-decoration: none; transition: .18s; }
.course-button { background: var(--ink); color: var(--paper); }
.course-button:hover { border-color: var(--brick); background: var(--brick); }
.course-button-outline { background: transparent; color: var(--ink); }
.course-button-outline:hover { background: #eae6dc; }
.course-text-link { min-height: 34px; padding: 0; border-color: transparent; background: transparent; color: var(--muted); }
.course-text-link:hover { color: var(--brick); }
.course-button:disabled, .course-button-outline:disabled { cursor: not-allowed; opacity: .5; }
.course-hero-stats { display: flex; flex-wrap: wrap; gap: 22px; margin-top: 28px; color: var(--muted); font: 9px "DM Mono", Consolas, monospace; letter-spacing: .1em; text-transform: uppercase; }
.course-hero-note { padding: 26px; box-shadow: 0 18px 50px -35px #141a2180; }
.course-note-top { display: flex; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.course-hero-note blockquote { margin: 23px 0; font: 22px/1.45 "Playfair Display", Georgia, serif; }
.course-analysis-list { display: grid; gap: 13px; padding-top: 17px; border-top: 1px solid var(--line); }
.course-analysis-list div { display: grid; grid-template-columns: 88px 1fr; gap: 12px; font-size: 12px; line-height: 1.55; }
.course-analysis-list b { color: var(--muted); font: 9px "DM Mono", Consolas, monospace; letter-spacing: .13em; text-transform: uppercase; }
.course-signal { margin-top: 20px; padding: 12px 0 0 14px; border-left: 2px solid var(--brick); font-size: 12px; line-height: 1.65; }
.course-signal strong { display: block; margin-bottom: 4px; color: var(--brick); font: 9px "DM Mono", Consolas, monospace; letter-spacing: .14em; text-transform: uppercase; }
.course-section { padding: 54px 0; }
.course-section-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
.course-section-heading h2 { margin: 7px 0 0; font: 400 clamp(27px, 3vw, 36px)/1.2 "Playfair Display", Georgia, serif; }
.course-section-heading p { max-width: 580px; margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.7; }
.course-module-list { border-top: 1px solid var(--line); }
.course-module-row { display: grid; width: 100%; grid-template-columns: 45px minmax(0, 1fr) auto; gap: 18px; padding: 23px 10px; border: 0; border-bottom: 1px solid var(--line); background: transparent; color: inherit; cursor: pointer; text-align: left; transition: background .18s; }
.course-module-row:hover:not(:disabled) { background: #ffffff70; }
.course-module-row:disabled { cursor: not-allowed; opacity: .5; }
.course-module-number { padding-top: 2px; color: var(--brick); font: 12px "DM Mono", Consolas, monospace; }
.course-module-main, .course-module-status { display: grid; }
.course-module-title { font: 22px/1.25 "Playfair Display", Georgia, serif; }
.course-module-sub { max-width: 760px; margin: 6px 0 12px; color: var(--muted); font-size: 13px; line-height: 1.6; }
.course-module-meta { display: flex; flex-wrap: wrap; gap: 16px; color: var(--muted); font: 9px "DM Mono", Consolas, monospace; letter-spacing: .08em; text-transform: uppercase; }
.course-module-status { min-width: 84px; justify-items: end; gap: 7px; color: var(--muted); font: 10px "DM Mono", Consolas, monospace; text-align: right; }
.course-module-status strong { color: var(--ink); font-size: 11px; font-weight: 500; }
.course-mini-bar { width: 75px; margin-top: 2px; }
.course-steps-band { border-block: 1px solid var(--line); background: #fcfbf7a6; }
.course-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
.course-steps article { padding-top: 14px; border-top: 1px solid var(--ink); }
.course-steps article > span { color: var(--brick); font: 10px "DM Mono", Consolas, monospace; }
.course-steps h3 { margin: 10px 0 8px; font: 20px "Playfair Display", Georgia, serif; }
.course-steps p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.8; }
.course-criteria { padding-bottom: 28px; }
.course-notice { margin: 18px 0; padding: 14px 16px; border: 1px solid #a8793140; background: #a879310b; color: #625744; font-size: 12px; line-height: 1.7; }
.course-local-note { color: var(--muted); font-size: 10px; }
.course-module-hero { padding: 43px 0 27px; border-bottom: 1px solid var(--line); }
.course-crumb { margin-bottom: 20px; color: var(--muted); font: 10px "DM Mono", Consolas, monospace; letter-spacing: .1em; }
.course-crumb button { padding: 0; border: 0; background: none; color: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.course-module-hero h1 { max-width: 800px; margin: 10px 0; font-size: clamp(34px, 4.2vw, 51px); line-height: 1.12; }
.course-module-hero > p { max-width: 800px; color: var(--muted); font-size: 14px; line-height: 1.75; }
.course-module-tools { margin-top: 18px; }
.course-learning-sequence { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 26px; border: 1px solid var(--line); background: var(--card); }
.course-learning-sequence div { padding: 14px; border-right: 1px solid var(--line); font-size: 11px; }
.course-learning-sequence div:last-child { border: 0; }
.course-learning-sequence div.locked { opacity: .55; }
.course-learning-sequence span { display: block; margin-bottom: 5px; color: var(--muted); font: 9px "DM Mono", Consolas, monospace; letter-spacing: .12em; text-transform: uppercase; }
.course-level-section { padding: 30px 0; border-bottom: 1px solid var(--line); }
.course-level-heading { display: flex; align-items: end; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
.course-level-heading h2 { margin: 5px 0 0; font: 25px "Playfair Display", Georgia, serif; }
.course-level-heading p { margin: 5px 0 0; color: var(--muted); font-size: 12px; }
.course-level-count { color: var(--muted); font: 10px "DM Mono", Consolas, monospace; }
.course-lesson-row { display: grid; width: 100%; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 13px; align-items: start; padding: 15px 10px; border: 0; border-top: 1px solid var(--line); background: transparent; color: inherit; cursor: pointer; text-align: left; }
.course-lesson-row:hover:not(:disabled) { background: #ffffff70; }
.course-lesson-row:disabled { cursor: not-allowed; opacity: .46; }
.course-lesson-icon { color: var(--sage); font-size: 16px; }
.course-lesson-row strong { display: block; font: 17px "Playfair Display", Georgia, serif; }
.course-lesson-row small { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; line-height: 1.5; }
.course-tag { display: inline-block; padding: 4px 7px; border: 1px solid var(--line); color: var(--muted); font: 8px "DM Mono", Consolas, monospace; letter-spacing: .1em; text-transform: uppercase; }
.course-tag.basico { border-color: #57796855; color: var(--sage); }
.course-tag.intermediario { border-color: #a8793155; color: var(--ochre); }
.course-tag.avancado { border-color: #a7473655; color: var(--brick); }
.course-lesson-layout { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 42px; padding: 38px 0; }
.course-lesson-content h1 { margin: 10px 0 14px; font: 400 clamp(31px, 4vw, 44px)/1.15 "Playfair Display", Georgia, serif; }
.course-lead { max-width: 760px; color: var(--muted); font-size: 15px; line-height: 1.8; }
.course-objectives { margin: 22px 0; padding: 17px 20px; border: 1px solid var(--line); background: var(--card); }
.course-objectives strong, .course-content-block h2 { font: 9px "DM Mono", Consolas, monospace; letter-spacing: .14em; text-transform: uppercase; }
.course-objectives ul { margin: 11px 0 0; padding-left: 17px; color: #51595a; font-size: 13px; line-height: 1.8; }
.course-content-block { margin: 28px 0; scroll-margin-top: 96px; }
.course-content-block h2 { margin-bottom: 12px; color: var(--muted); }
.course-content-block > p { color: #454d4e; font-size: 14px; line-height: 1.85; white-space: pre-line; }
.course-example-box { margin: 16px 0; padding: 18px 20px; border-left: 2px solid var(--brick); background: var(--card); }
.course-example-box blockquote { margin: 8px 0 0; font: 18px/1.5 "Playfair Display", Georgia, serif; white-space: pre-line; }
.course-example-box > p { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.7; white-space: pre-line; }
.course-attention { margin: 18px 0; padding: 17px; border: 1px solid #a8793140; background: #a879310b; }
.course-attention strong { display: block; margin-bottom: 7px; color: var(--ochre); font: 9px "DM Mono", Consolas, monospace; letter-spacing: .15em; text-transform: uppercase; }
.course-attention p { margin: 0; font-size: 13px; line-height: 1.75; white-space: pre-line; }
.course-compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
.course-compare { padding: 16px; border-top: 2px solid var(--sage); background: var(--card); }
.course-compare.problem { border-color: var(--brick); }
.course-compare strong { display: block; margin-bottom: 8px; color: var(--sage); font: 9px "DM Mono", Consolas, monospace; letter-spacing: .12em; text-transform: uppercase; }
.course-compare.problem strong { color: var(--brick); }
.course-compare p { margin: 0; font-size: 12px; line-height: 1.7; white-space: pre-line; }
.course-trick { padding: 18px; }
.course-trick p { margin: 9px 0 0; font: 19px/1.5 "Playfair Display", Georgia, serif; }
.course-takeaways { padding: 20px; background: var(--ink); color: var(--paper); }
.course-takeaways .course-eyebrow { color: #ffffff90; }
.course-takeaways ul { margin-bottom: 0; padding-left: 20px; }
.course-takeaways li { margin-top: 8px; font-size: 13px; line-height: 1.7; }
.course-lesson-sidebar { position: sticky; top: 96px; align-self: start; padding: 19px; }
.course-lesson-sidebar h2 { font: 18px "Playfair Display", Georgia, serif; }
.course-lesson-sidebar a { display: block; padding: 9px 0; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; text-decoration: none; }
.course-lesson-sidebar a:hover { color: var(--brick); }
.course-lesson-sidebar p { margin: 15px 0 0; color: var(--muted); font-size: 10px; line-height: 1.6; }
.course-lesson-footer { display: flex; justify-content: space-between; gap: 14px; margin-top: 34px; padding-top: 18px; border-top: 1px solid var(--line); }
.course-quiz-card { max-width: 800px; margin: 24px 0; padding: 25px; }
.course-quiz-card .course-level-heading { align-items: center; }
.course-quiz-progress { height: 3px; margin: 18px 0; background: var(--line); }
.course-quiz-progress i { display: block; height: 100%; background: var(--brick); }
.course-quiz-card > h2 { font: 22px/1.45 "Playfair Display", Georgia, serif; }
.course-quiz-options { display: grid; gap: 8px; margin-top: 14px; }
.course-quiz-option { display: flex; gap: 10px; align-items: flex-start; padding: 11px 13px; border: 1px solid var(--line); background: transparent; cursor: pointer; font-size: 12px; line-height: 1.6; text-align: left; }
.course-quiz-option:hover:not(:disabled) { border-color: var(--ink); }
.course-quiz-option > span:first-child { color: var(--muted); font: 10px "DM Mono", Consolas, monospace; }
.course-quiz-option.correct { border-color: var(--sage); background: #5779680c; }
.course-quiz-option.wrong { border-color: var(--brick); background: #a747360a; }
.course-feedback { margin-top: 12px; padding: 12px 14px; border-left: 2px solid var(--sage); background: #5779680b; font-size: 12px; line-height: 1.7; }
.course-feedback.wrong { border-color: var(--brick); background: #a7473608; }
.course-next-question { margin-top: 18px; }
.course-score-line { margin: 17px 0 0; }
.course-result { padding: 26px; text-align: center; }
.course-result-number { margin: 12px 0; font: 52px "Playfair Display", Georgia, serif; }
.course-result-actions { justify-content: center; }
.course-reflection { padding: 18px 0; border-bottom: 1px solid var(--line); }
.course-reflection h3 { font: 20px "Playfair Display", Georgia, serif; }
.course-reflection textarea { width: 100%; min-height: 86px; margin: 12px 0; padding: 12px; border: 1px solid var(--line); background: var(--card); font: 13px/1.6 "DM Sans", Inter, Arial, sans-serif; resize: vertical; }
.course-model-answer { margin-top: 12px; padding: 14px; background: #5779680b; font-size: 12px; line-height: 1.75; white-space: pre-line; }
.course-filter-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 15px 0 22px; }
.course-filter-chip { padding: 7px 11px; border: 1px solid var(--line); background: transparent; color: var(--muted); cursor: pointer; font-size: 10px; }
.course-filter-chip.active { border-color: var(--ink); background: var(--ink); color: var(--paper); }
.course-tip-search { display: grid; max-width: 620px; grid-template-columns: minmax(0, 1fr) auto; gap: 7px 14px; margin-top: 18px; }
.course-tip-search .course-eyebrow { grid-column: 1 / -1; }
.course-tip-search input { min-height: 44px; padding: 10px 12px; border: 1px solid var(--line); background: var(--card); color: var(--ink); font: 13px "DM Sans", Inter, Arial, sans-serif; }
.course-tip-search > span:last-child { align-self: center; color: var(--muted); font: 10px "DM Mono", Consolas, monospace; }
.course-cards-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.course-tip-card { padding: 19px; }
.course-tip-title { display: flex; align-items: start; justify-content: space-between; gap: 8px; }
.course-tip-title h2 { margin: 0; font: 20px "Playfair Display", Georgia, serif; }
.course-tip-hint { margin: 13px 0; padding-left: 12px; border-left: 2px solid var(--ink); font: 16px/1.45 "Playfair Display", Georgia, serif; white-space: pre-line; }
.course-tip-card > p { color: var(--muted); font-size: 12px; line-height: 1.7; white-space: pre-line; }
.course-tip-card .course-example-box { margin: 13px 0; padding: 13px; }
.course-empty { grid-column: 1 / -1; padding: 22px; border: 1px dashed var(--line); color: var(--muted); font-size: 12px; }
.course-footer { display: flex; justify-content: space-between; gap: 20px; padding: 24px 0; border-top: 1px solid var(--line); color: var(--muted); font-size: 10px; line-height: 1.6; }
@media (max-width: 1000px) {
  .course-topbar-inner { flex-wrap: wrap; gap: 10px 18px; padding-block: 10px; }
  .course-main-nav { margin-left: auto; }
  .course-user { order: 2; }
  .course-top-progress { order: 2; margin-left: auto; }
}
@media (max-width: 850px) {
  .course-hero { grid-template-columns: 1fr; gap: 28px; padding-top: 46px; }
  .course-lesson-layout { grid-template-columns: 1fr; }
  .course-lesson-sidebar { position: static; order: -1; }
  .course-cards-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .course-shell { width: calc(100% - 32px); }
  .course-topbar-inner { gap: 5px 12px; padding-inline: 16px; }
  .course-brand { margin-right: auto; }
  .course-main-nav { order: 3; width: 100%; justify-content: space-between; }
  .course-nav-link { padding: 10px 5px; font-size: 11px; }
  .course-user { margin-left: auto; font-size: 9px; }
  .course-user > span { display: none; }
  .course-top-progress { display: none; }
  .course-hero { padding-top: 34px; }
  .course-hero-note { padding: 20px; }
  .course-section { padding: 38px 0; }
  .course-section-heading { align-items: start; flex-direction: column; gap: 10px; }
  .course-module-row { grid-template-columns: 30px minmax(0, 1fr); gap: 10px; padding: 18px 2px; }
  .course-module-title { font-size: 19px; }
  .course-module-meta { gap: 9px; font-size: 8px; }
  .course-module-status { grid-column: 2; grid-template-columns: auto auto; justify-items: start; align-items: center; gap: 8px; text-align: left; }
  .course-mini-bar { grid-column: 1 / -1; width: 100%; }
  .course-steps { grid-template-columns: 1fr; gap: 20px; }
  .course-learning-sequence { grid-template-columns: 1fr; }
  .course-learning-sequence div { border-right: 0; border-bottom: 1px solid var(--line); }
  .course-level-heading { align-items: start; flex-direction: column; }
  .course-lesson-row { grid-template-columns: 23px minmax(0, 1fr); }
  .course-lesson-row > .course-tag { grid-column: 2; justify-self: start; }
  .course-compare-grid, .course-cards-grid { grid-template-columns: 1fr; }
  .course-lesson-footer, .course-footer { flex-direction: column; }
  .course-module-tools { gap: 7px; }
  .course-module-tools .course-button, .course-module-tools .course-button-outline { padding-inline: 10px; font-size: 10px; }
  .course-quiz-card { padding: 18px; }
}
@media print {
  .course-topbar, .course-footer, .course-hero-actions, .course-module-tools, .course-lesson-sidebar, .course-button, .course-button-outline, .course-text-link { display: none !important; }
  .course-page { background: white; color: #111; font-size: 11pt; }
  .course-shell { width: 100%; max-width: none; }
  .course-hero, .course-section, .course-module-hero, .course-lesson-layout { display: block; padding: 10px 0; border: 0; }
  .course-paper, .course-compare, .course-attention, .course-example-box { break-inside: avoid; border-color: #aaa; background: white; }
  .course-hero h1, .course-module-hero h1 { font-size: 26pt; }
}
</style>
