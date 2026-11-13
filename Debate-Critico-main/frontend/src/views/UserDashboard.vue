<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import { clearSession, session } from '../lib/session';
import AppHeader from '../components/AppHeader.vue';

const router = useRouter();
const tab = ref('debates');
const loading = ref(false);
const error = ref('');
const notice = ref('');
const videos = ref([]);
const quizzes = ref([]);
const reports = ref([]);
const cycle = ref(null);
const attempt = ref(null);
const resultMessage = ref('');
const selectedAnswers = ref({});

const currentVideo = computed(() => videos.value.find((video) => video.id === cycle.value?.videoId));
const submittedReports = computed(() => reports.value.filter((report) => report.status === 'SUBMITTED' && report.score != null));
const averageScore = computed(() => submittedReports.value.length
  ? Math.round(submittedReports.value.reduce((sum, item) => sum + Number(item.score), 0) / submittedReports.value.length)
  : null);
const completedCycles = computed(() => new Set(reports.value
  .filter((report) => report.attemptType === 'FINAL' && report.status === 'SUBMITTED')
  .map((report) => report.cycleId)).size);

function message(errorText = '', successText = '') {
  error.value = errorText;
  notice.value = successText;
}

async function loadDashboard() {
  loading.value = true;
  message();
  try {
    const [videoResult, quizResult, reportResult] = await Promise.all([
      api('/videos'),
      api('/quizzes'),
      api('/reports/me'),
    ]);
    videos.value = videoResult.items || [];
    quizzes.value = quizResult.items || [];
    reports.value = reportResult.items || [];
  } catch (requestError) {
    message(requestError.message);
  } finally {
    loading.value = false;
  }
}

async function startCycle(video) {
  message();
  try {
    const { item } = await api('/cycles', { method: 'POST', body: { videoId: video.id } });
    cycle.value = item;
    attempt.value = null;
    selectedAnswers.value = {};
    tab.value = 'debates';
    notice.value = `Ciclo ${item.cycleNumber} iniciado para “${video.title}”.`;
  } catch (requestError) {
    message(requestError.message);
  }
}

async function refreshCycle() {
  if (!cycle.value) return;
  const { item } = await api(`/cycles/${cycle.value.id}`);
  cycle.value = item;
}

async function registerPlaybackEvent() {
  if (!cycle.value) return;
  message();
  try {
    const { cycle: updated } = await api(`/cycles/${cycle.value.id}/video-events`, {
      method: 'POST',
      body: { events: [{ type: 'PLAY', position: 0 }, { type: 'HEARTBEAT', position: 20 }] },
    });
    cycle.value = updated;
    notice.value = 'Evento de visualização registrado.';
  } catch (requestError) {
    message(requestError.message);
  }
}

async function beginAttempt() {
  if (!cycle.value) return;
  const attemptType = cycle.value.state.startsWith('FINAL_') ? 'final' : 'initial';
  message();
  try {
    const { item } = await api(`/cycles/${cycle.value.id}/attempts`, {
      method: 'POST',
      body: { attemptType },
    });
    attempt.value = item;
    selectedAnswers.value = {};
    resultMessage.value = '';
  } catch (requestError) {
    message(requestError.message);
  }
}

async function submitAttempt() {
  if (!attempt.value) return;
  const answers = attempt.value.questions
    .map((question) => ({
      questionId: question.id,
      selectedOptionId: selectedAnswers.value[question.id],
    }))
    .filter((answer) => answer.selectedOptionId);
  if (answers.length !== attempt.value.questions.length) {
    message('Responda a todas as questões antes de enviar.');
    return;
  }
  try {
    const result = await api(`/attempts/${attempt.value.id}/submit`, { method: 'POST', body: { answers } });
    resultMessage.value = `Resultado: ${result.score}% (${result.correct} de ${result.total}).`;
    attempt.value = null;
    await Promise.all([refreshCycle(), loadReports()]);
  } catch (requestError) {
    message(requestError.message);
  }
}

async function loadReports() {
  const { items } = await api('/reports/me');
  reports.value = items || [];
}

function logout() {
  clearSession();
  router.replace('/');
}

onMounted(loadDashboard);
</script>

<template>
  <div class="app-page">
    <AppHeader area="user" :user-name="session.user?.name" :user-role="session.user?.role" @logout="logout" />

    <div class="app-workspace">
      <aside class="surface h-fit p-3">
        <p class="px-3 py-2 text-[11px] font-bold tracking-[.16em] text-[#78877f]">ÁREA DO USUÁRIO</p>
        <nav class="grid gap-1">
          <button v-for="item in [['debates', 'Debates'], ['quizzes', 'Questionários'], ['performance', 'Desempenho'], ['minicourse', 'Minicurso']]" :key="item[0]"
            class="rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition"
            :class="tab === item[0] ? 'bg-[#eaf2ed] text-[#235d46]' : 'text-[#53645a] hover:bg-[#f4f7f4]'"
            @click="tab = item[0]">{{ item[1] }}</button>
        </nav>
        <div class="mt-5 border-t border-[#e8ede9] px-3 pt-4 text-xs leading-5 text-[#78877f]">Aprender a ouvir, analisar evidências e formar conclusões próprias.</div>
      </aside>

      <main class="min-w-0">
        <div v-if="error" class="notice error mb-5" role="alert">{{ error }}</div>
        <div v-if="notice" class="notice success mb-5" role="status">{{ notice }}</div>
        <div v-if="loading" class="surface p-8 text-sm text-[#64756c]">Carregando sua área de aprendizagem…</div>

        <template v-else>
          <section v-if="tab === 'debates'">
            <div class="mb-6">
              <p class="text-xs font-bold tracking-[.18em] text-[#34745b]">APRENDIZAGEM</p>
              <h1 class="mt-2 font-serif text-4xl">Debates</h1>
              <p class="mt-2 text-[#64756c]">Explore os debates publicados e acompanhe seu ciclo de análise.</p>
            </div>
            <div v-if="!videos.length" class="surface p-7 text-sm text-[#64756c]">Ainda não há debates publicados.</div>
            <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <article v-for="video in videos" :key="video.id" class="surface flex flex-col p-5">
                <p class="text-xs font-semibold uppercase tracking-wide text-[#34745b]">{{ video.categories?.join(' · ') || 'Debate' }}</p>
                <h2 class="mt-2 text-lg font-bold">{{ video.title }}</h2>
                <p class="mt-2 flex-1 text-sm leading-6 text-[#64756c]">{{ video.description || 'Sem descrição disponível.' }}</p>
                <button class="primary-button mt-5 w-full" @click="startCycle(video)">Iniciar ou continuar ciclo</button>
              </article>
            </div>

            <section class="surface mt-7 p-5 sm:p-7">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div><p class="text-xs font-bold tracking-[.16em] text-[#34745b]">ACOMPANHAMENTO</p><h2 class="mt-1 font-serif text-2xl">Meu ciclo</h2></div>
                <span v-if="cycle" class="rounded-full bg-[#edf4ef] px-3 py-1 text-xs font-semibold text-[#235d46]">{{ cycle.status }} · {{ cycle.state }}</span>
              </div>
              <p v-if="!cycle" class="mt-4 text-sm text-[#64756c]">Selecione um debate para iniciar um ciclo.</p>
              <div v-else class="mt-4 grid gap-4">
                <div class="rounded-xl bg-[#f7f9f7] p-4">
                  <p class="font-semibold">{{ currentVideo?.title || 'Debate selecionado' }} · Ciclo {{ cycle.cycleNumber }}</p>
                  <p class="mt-1 text-sm text-[#64756c]">Etapa atual: {{ cycle.state }}</p>
                  <div class="mt-4 flex flex-wrap gap-2">
                    <button class="secondary-button text-sm" @click="registerPlaybackEvent">Registrar visualização</button>
                    <button class="secondary-button text-sm" @click="refreshCycle">Atualizar etapa</button>
                    <button v-if="cycle.state.endsWith('_QUIZ')" class="primary-button text-sm" @click="beginAttempt">
                      Iniciar avaliação {{ cycle.state.startsWith('FINAL_') ? 'final' : 'inicial' }}
                    </button>
                  </div>
                </div>
                <iframe v-if="currentVideo?.youtubeId"
                  class="aspect-video w-full rounded-xl bg-black"
                  :src="`https://www.youtube-nocookie.com/embed/${currentVideo.youtubeId}`"
                  :title="currentVideo.title" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
                <p v-if="cycle.state === 'LEARNING'" class="text-sm text-[#64756c]">A etapa antiga foi desativada. Atualize o ciclo para continuar sem videoaulas; o minicurso continua opcional.</p>
                <p v-if="resultMessage" class="notice success">{{ resultMessage }}</p>
                <form v-if="attempt" class="grid gap-4" @submit.prevent="submitAttempt">
                  <fieldset v-for="(question, index) in attempt.questions" :key="question.id" class="surface bg-[#fbfcfb] p-4">
                    <legend class="px-1 text-xs font-semibold text-[#78877f]">Questão {{ index + 1 }}</legend>
                    <p class="mb-3 font-semibold">{{ question.statement }}</p>
                    <label v-for="option in question.options" :key="option.id" class="mb-2 flex cursor-pointer items-start gap-3 text-sm text-[#46564d]">
                      <input v-model="selectedAnswers[question.id]" class="mt-1 accent-[#235d46]" type="radio" :name="`question-${question.id}`" :value="option.id" />
                      <span>{{ option.text }}</span>
                    </label>
                  </fieldset>
                  <button class="primary-button justify-self-start" type="submit">Enviar respostas</button>
                </form>
              </div>
            </section>
          </section>

          <section v-else-if="tab === 'quizzes'">
            <div class="mb-6"><p class="text-xs font-bold tracking-[.18em] text-[#34745b]">AVALIAÇÃO</p><h1 class="mt-2 font-serif text-4xl">Questionários</h1><p class="mt-2 text-[#64756c]">Questionários aprovados disponíveis para os debates.</p></div>
            <div v-if="!quizzes.length" class="surface p-7 text-sm text-[#64756c]">Ainda não há questionários aprovados disponíveis.</div>
            <div class="grid gap-4 sm:grid-cols-2">
              <article v-for="quiz in quizzes" :key="quiz.id" class="surface p-5">
                <p class="text-xs font-semibold text-[#34745b]">{{ quiz.categories?.join(' · ') || 'Categorias diversas' }}</p>
                <h2 class="mt-2 text-lg font-bold">{{ quiz.videoTitle }}</h2>
                <p class="mt-1 text-sm text-[#64756c]">{{ quiz.questionCount }} questões · Versão {{ quiz.version }}</p>
                <button class="secondary-button mt-4 text-sm" @click="tab = 'debates'">Ver debate</button>
              </article>
            </div>
          </section>

          <section v-else-if="tab === 'performance'">
            <div class="mb-6"><p class="text-xs font-bold tracking-[.18em] text-[#34745b]">ACOMPANHAMENTO</p><h1 class="mt-2 font-serif text-4xl">Desempenho</h1><p class="mt-2 text-[#64756c]">Histórico das avaliações realizadas.</p></div>
            <div class="grid gap-3 sm:grid-cols-3">
              <article class="surface p-5"><p class="text-sm text-[#64756c]">Avaliações concluídas</p><strong class="mt-2 block text-3xl">{{ submittedReports.length }}</strong></article>
              <article class="surface p-5"><p class="text-sm text-[#64756c]">Média geral</p><strong class="mt-2 block text-3xl">{{ averageScore == null ? '—' : `${averageScore}%` }}</strong></article>
              <article class="surface p-5"><p class="text-sm text-[#64756c]">Ciclos concluídos</p><strong class="mt-2 block text-3xl">{{ completedCycles }}</strong></article>
            </div>
            <div class="mt-5 grid gap-3">
              <article v-for="report in reports" :key="report.id" class="surface flex flex-wrap items-center justify-between gap-2 p-4">
                <div><h2 class="font-semibold">{{ report.videoTitle || 'Debate' }}</h2><p class="mt-1 text-sm text-[#64756c]">Avaliação {{ report.attemptType === 'FINAL' ? 'final' : 'inicial' }} · Ciclo {{ report.cycleNumber }}</p></div>
                <span class="rounded-full bg-[#edf4ef] px-3 py-1 text-sm font-semibold text-[#235d46]">{{ report.status === 'SUBMITTED' ? `${report.score}%` : 'Em andamento' }}</span>
              </article>
              <p v-if="!reports.length" class="surface p-6 text-sm text-[#64756c]">Seus resultados aparecerão aqui após as avaliações.</p>
            </div>
          </section>

          <section v-else>
            <header class="mb-6">
              <p class="text-xs font-bold tracking-[.18em] text-[#34745b]">TRILHA DE APRENDIZAGEM</p>
              <h1 class="mt-2 font-serif text-4xl">Minicurso</h1>
              <p class="mt-2 max-w-2xl text-[#64756c]">Aprenda a identificar falácias, analisar estratégias de persuasão e verificar informações com cuidado.</p>
            </header>
            <article class="app-course-promo">
              <div class="app-course-promo-main">
                <p class="app-course-promo-label">ARGUMENTA · PENSAMENTO CRÍTICO</p>
                <h2>Leia os argumentos além das palavras.</h2>
                <p>Uma trilha interativa, com exemplos e exercícios para praticar no seu ritmo. Sem videoaulas: o aprendizado acontece no próprio minicurso.</p>
                <RouterLink to="/app/curso" class="app-course-cta">Acessar minicurso <span aria-hidden="true">→</span></RouterLink>
              </div>
              <div class="app-course-promo-points">
                <div><span>01</span><p><strong>Entenda</strong> a estrutura dos argumentos e o papel das evidências.</p></div>
                <div><span>02</span><p><strong>Pratique</strong> com exercícios comentados e exemplos fictícios.</p></div>
                <div><span>03</span><p><strong>Aplique</strong> seus critérios na análise de debates.</p></div>
              </div>
            </article>
            <p class="mt-4 text-xs leading-5 text-[#78877f]">O minicurso é opcional e não bloqueia a avaliação final dos ciclos de debate.</p>
          </section>
        </template>
      </main>
    </div>
  </div>
</template>
