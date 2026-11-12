<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import { clearSession, session } from '../lib/session';

const router = useRouter();
const tab = ref('overview');
const loading = ref(false);
const error = ref('');
const notice = ref('');
const overview = ref(null);
const videos = ref([]);
const quizzes = ref([]);
const jobs = ref([]);
const users = ref([]);
const auditLogs = ref([]);
const quizFilter = ref('PENDING_REVIEW');
const selectedQuiz = ref(null);
const rejectionReason = ref('');
const invite = ref({ name: '', email: '' });
const sendingInvite = ref(false);

const navItems = [
  ['overview', 'Painel'],
  ['videos', 'Debates'],
  ['quizzes', 'Questionários'],
  ['jobs', 'Processamento'],
  ['users', 'Usuários'],
  ['audit', 'Auditoria'],
];

const labels = {
  DRAFT: 'Rascunho', PUBLISHED: 'Publicado', ARCHIVED: 'Arquivado',
  PENDING_REVIEW: 'Em revisão', APPROVED: 'Aprovado', REJECTED: 'Reprovado',
  QUEUED: 'Na fila', RUNNING: 'Em execução', COMPLETED: 'Concluído', FAILED: 'Falhou', CANCELLED: 'Cancelado',
  ACTIVE: 'Ativo', SUSPENDED: 'Suspenso', USER: 'Usuário', ADMIN: 'Administrador',
  INITIAL_VIDEO: 'Vídeo inicial', INITIAL_QUIZ: 'Avaliação inicial', LEARNING: 'Aulas',
  FINAL_VIDEO: 'Vídeo final', FINAL_QUIZ: 'Avaliação final', ABANDONED: 'Abandonado',
  ANALYSIS: 'Análise', QUIZ_GENERATION: 'Geração de questionário',
};

function label(value) { return labels[value] || value || '—'; }
function date(value) { return value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'; }
function percentage(value) { return value == null ? '—' : `${Number(value).toFixed(1).replace('.', ',')}%`; }
function showError(message) { error.value = message; notice.value = ''; }
function showNotice(message) { notice.value = message; error.value = ''; }

async function loadTab() {
  loading.value = true;
  showError('');
  try {
    if (tab.value === 'overview') overview.value = await api('/admin/reports/overview');
    if (tab.value === 'videos') videos.value = (await api('/admin/videos')).items || [];
    if (tab.value === 'quizzes') quizzes.value = (await api(`/admin/quizzes${quizFilter.value ? `?status=${quizFilter.value}` : ''}`)).items || [];
    if (tab.value === 'jobs') jobs.value = (await api('/admin/ai-jobs')).items || [];
    if (tab.value === 'users') users.value = (await api('/admin/users')).items || [];
    if (tab.value === 'audit') auditLogs.value = (await api('/admin/audit-logs')).items || [];
  } catch (requestError) {
    showError(requestError.message);
  } finally {
    loading.value = false;
  }
}

async function selectTab(nextTab) {
  tab.value = nextTab;
  selectedQuiz.value = null;
  await loadTab();
}

async function updateVideo(video, status) {
  if (status === 'ARCHIVED' && !window.confirm(`Arquivar “${video.title}”?`)) return;
  try {
    await api(`/admin/videos/${video.id}`, { method: 'PATCH', body: { status } });
    showNotice(status === 'PUBLISHED' ? 'Debate publicado.' : 'Debate arquivado.');
    await loadTab();
  } catch (requestError) { showError(requestError.message); }
}

async function loadQuiz(quiz) {
  selectedQuiz.value = { ...quiz, detail: null };
  rejectionReason.value = '';
  try {
    selectedQuiz.value.detail = (await api(`/admin/quizzes/${quiz.id}`)).item;
  } catch (requestError) { showError(requestError.message); }
}

async function reviewQuiz(action) {
  if (!selectedQuiz.value) return;
  const reason = rejectionReason.value.trim();
  if (action === 'reject' && !reason) {
    showError('Informe o motivo da reprovação.');
    return;
  }
  try {
    await api(`/admin/quizzes/${selectedQuiz.value.id}/${action}`, {
      method: 'POST',
      body: action === 'reject' ? { reason } : {},
    });
    selectedQuiz.value = null;
    showNotice(action === 'approve' ? 'Questionário aprovado e publicado.' : 'Questionário reprovado.');
    await loadTab();
  } catch (requestError) { showError(requestError.message); }
}

async function jobAction(job, action) {
  try {
    await api(`/admin/ai-jobs/${job.id}/${action}`, { method: 'POST' });
    showNotice(action === 'retry' ? 'Processamento reenviado.' : 'Processamento cancelado.');
    await loadTab();
  } catch (requestError) { showError(requestError.message); }
}

async function changeUserStatus(user, status) {
  const action = status === 'SUSPENDED' ? 'Suspender' : 'Reativar';
  if (!window.confirm(`${action} a conta de ${user.name || user.email}?`)) return;
  try {
    await api(`/admin/users/${user.id}`, { method: 'PATCH', body: { status } });
    showNotice(status === 'SUSPENDED' ? 'Conta suspensa.' : 'Conta reativada.');
    await loadTab();
  } catch (requestError) { showError(requestError.message); }
}

async function sendInvitation() {
  sendingInvite.value = true;
  try {
    const result = await api('/admin/invitations', {
      method: 'POST',
      body: { name: invite.value.name.trim(), email: invite.value.email.trim() },
    });
    invite.value = { name: '', email: '' };
    showNotice(result.message);
  } catch (requestError) { showError(requestError.message); }
  finally { sendingInvite.value = false; }
}

function logout() {
  clearSession();
  router.replace('/');
}

onMounted(loadTab);
</script>

<template>
  <div class="min-h-screen bg-[#f5f7f5]">
    <header class="sticky top-0 z-10 border-b border-[#e3e9e5] bg-white/95 backdrop-blur">
      <div class="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3 md:px-8">
        <RouterLink to="/admin" class="flex items-center gap-3 font-bold tracking-tight">
          <span class="grid size-9 place-items-center rounded-xl bg-[#235d46] font-serif text-lg text-white">D</span>
          <span>Debate<span class="font-normal text-[#668074]">.crítico</span><span class="ml-2 text-xs font-medium text-[#78877f]">/ administração</span></span>
        </RouterLink>
        <div class="flex items-center gap-2">
          <span class="hidden text-sm text-[#52645a] md:inline">{{ session.user?.name }}</span>
          <RouterLink to="/app" class="secondary-button text-sm">Área do usuário</RouterLink>
          <button class="secondary-button text-sm" @click="logout">Sair</button>
        </div>
      </div>
    </header>
    <div class="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 md:grid-cols-[230px_minmax(0,1fr)] md:px-8 md:py-9">
      <aside class="surface h-fit p-3">
        <p class="px-3 py-2 text-[11px] font-bold tracking-[.16em] text-[#78877f]">ADMINISTRAÇÃO</p>
        <nav class="grid gap-1">
          <button v-for="item in navItems" :key="item[0]" class="rounded-lg px-3 py-2.5 text-left text-sm font-semibold"
            :class="tab === item[0] ? 'bg-[#eaf2ed] text-[#235d46]' : 'text-[#53645a] hover:bg-[#f4f7f4]'"
            @click="selectTab(item[0])">{{ item[1] }}</button>
          <RouterLink to="/admin/profiles" class="rounded-lg px-3 py-2.5 text-sm font-semibold text-[#53645a] hover:bg-[#f4f7f4]">Perfis</RouterLink>
          <RouterLink to="/admin/content" class="mt-2 rounded-lg border-t border-[#e8ede9] px-3 py-3 text-sm font-semibold text-[#235d46] hover:bg-[#f4f7f4]">Vídeos e aulas ↗</RouterLink>
        </nav>
      </aside>

      <main class="min-w-0">
        <div v-if="error" class="notice error mb-5">{{ error }}</div>
        <div v-if="notice" class="notice success mb-5">{{ notice }}</div>
        <div v-if="loading" class="surface p-8 text-sm text-[#64756c]">Carregando…</div>

        <template v-else>
          <section v-if="tab === 'overview'">
            <header class="mb-6"><p class="text-xs font-bold tracking-[.18em] text-[#34745b]">VISÃO GERAL</p><h1 class="mt-2 font-serif text-4xl">Painel</h1><p class="mt-2 text-[#64756c]">Indicadores da plataforma e do aprendizado dos usuários.</p></header>
            <div v-if="overview" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article v-for="metric in [['Usuários ativos', overview.totalUsers], ['Debates publicados', overview.publishedVideos], ['Questionários aprovados', overview.approvedQuizzes], ['Aguardando revisão', overview.pendingQuizzes], ['Ciclos iniciados', overview.totalCycles], ['Ciclos concluídos', overview.completedCycles], ['Taxa de conclusão', percentage(overview.completionRate)], ['Jobs em execução', overview.activeJobs]]" :key="metric[0]" class="surface p-5">
                <p class="text-sm text-[#64756c]">{{ metric[0] }}</p><strong class="mt-2 block text-3xl">{{ metric[1] ?? 0 }}</strong>
              </article>
            </div>
            <div v-if="overview" class="mt-5 grid gap-4 xl:grid-cols-2">
              <article class="surface p-5 sm:p-6">
                <h2 class="font-serif text-xl">Resultados dos ciclos concluídos</h2>
                <p v-if="!overview.outcomes.visible" class="mt-4 text-sm leading-6 text-[#64756c]">Amostra insuficiente (n = {{ overview.outcomes.sampleSize }}; mínimo {{ overview.minSample }}). As médias ficam ocultas até haver ciclos suficientes.</p>
                <dl v-else class="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <template v-for="item in [['Ciclos na amostra', overview.outcomes.sampleSize], ['Média inicial', percentage(overview.outcomes.avgInitial)], ['Média final', percentage(overview.outcomes.avgFinal)], ['Variação', `${overview.outcomes.avgVariation.toFixed(1)} p.p.`]]" :key="item[0]">
                    <dt class="text-[#64756c]">{{ item[0] }}</dt><dd class="text-right font-semibold">{{ item[1] }}</dd>
                  </template>
                </dl>
              </article>
              <article class="surface p-5 sm:p-6">
                <h2 class="font-serif text-xl">Ciclos por etapa</h2>
                <div class="mt-4 grid gap-3">
                  <div v-for="(count, stateName) in overview.funnel" :key="stateName" class="grid grid-cols-[125px_1fr_32px] items-center gap-3 text-xs">
                    <span class="text-[#64756c]">{{ label(stateName) }}</span>
                    <div class="h-2 overflow-hidden rounded-full bg-[#eaf2ed]"><div class="h-full bg-[#34745b]" :style="{ width: `${overview.totalCycles ? count / overview.totalCycles * 100 : 0}%` }"></div></div>
                    <strong class="text-right">{{ count }}</strong>
                  </div>
                  <p v-if="!Object.keys(overview.funnel || {}).length" class="text-sm text-[#64756c]">Nenhum ciclo iniciado ainda.</p>
                </div>
              </article>
            </div>
            <p class="mt-4 max-w-3xl text-xs leading-5 text-[#78877f]">As médias consideram somente ciclos concluídos com amostra mínima. Uma variação positiva não prova que as aulas foram a única causa.</p>
          </section>

          <section v-else-if="tab === 'videos'">
            <header class="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p class="text-xs font-bold tracking-[.18em] text-[#34745b]">CONTEÚDO</p><h1 class="mt-2 font-serif text-4xl">Debates</h1><p class="mt-2 text-[#64756c]">Gerencie publicação e arquivamento dos debates.</p></div><RouterLink to="/admin/content" class="primary-button">Cadastrar debate ou aula</RouterLink></header>
            <div class="grid gap-3">
              <article v-for="video in videos" :key="video.id" class="surface flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
                <div class="min-w-[220px] flex-1"><div class="flex flex-wrap items-center gap-2"><h2 class="font-semibold">{{ video.title }}</h2><span class="rounded-full bg-[#f0f3f1] px-2.5 py-1 text-xs">{{ label(video.status) }}</span></div><p class="mt-1 text-sm text-[#64756c]">{{ video.categories?.join(', ') || 'Sem categoria' }} · {{ Math.floor(video.duration / 60) }} min</p></div>
                <div class="flex gap-2"><button v-if="video.status !== 'PUBLISHED'" class="secondary-button text-sm" @click="updateVideo(video, 'PUBLISHED')">Publicar</button><button v-if="video.status !== 'ARCHIVED'" class="secondary-button text-sm" @click="updateVideo(video, 'ARCHIVED')">Arquivar</button></div>
              </article>
              <p v-if="!videos.length" class="surface p-6 text-sm text-[#64756c]">Nenhum debate cadastrado.</p>
            </div>
          </section>

          <section v-else-if="tab === 'quizzes'">
            <header class="mb-5"><p class="text-xs font-bold tracking-[.18em] text-[#34745b]">REVISÃO HUMANA</p><h1 class="mt-2 font-serif text-4xl">Questionários</h1><p class="mt-2 text-[#64756c]">Conteúdo gerado só é disponibilizado após aprovação explícita.</p></header>
            <label class="field-label mb-4 max-w-xs">Filtrar por estado
              <select v-model="quizFilter" class="field" @change="loadTab"><option value="PENDING_REVIEW">Em revisão</option><option value="APPROVED">Aprovados</option><option value="REJECTED">Reprovados</option><option value="DRAFT">Rascunhos</option><option value="">Todos</option></select>
            </label>
            <div v-if="selectedQuiz" class="surface mb-5 p-5 sm:p-7">
              <div class="flex items-start justify-between gap-3"><div><p class="text-xs font-bold text-[#34745b]">REVISÃO DO QUESTIONÁRIO</p><h2 class="mt-2 font-serif text-2xl">{{ selectedQuiz.videoTitle }} · v{{ selectedQuiz.version }}</h2></div><button class="secondary-button text-sm" @click="selectedQuiz = null">Fechar</button></div>
              <p v-if="!selectedQuiz.detail" class="mt-5 text-sm text-[#64756c]">Carregando questões…</p>
              <div v-else class="mt-5 grid gap-4">
                <article v-for="(question, index) in selectedQuiz.detail.questions" :key="question.id" class="rounded-xl bg-[#f7f9f7] p-4">
                  <p class="text-xs text-[#78877f]">Questão {{ index + 1 }} · {{ question.category }} · {{ question.difficulty }}</p>
                  <p class="mt-2 font-semibold">{{ question.statement }}</p>
                  <ul class="mt-3 grid gap-1 text-sm"><li v-for="option in question.options" :key="option.id" :class="option.isCorrect ? 'font-semibold text-[#27623e]' : 'text-[#64756c]'">{{ option.isCorrect ? '✓ ' : '○ ' }}{{ option.text }}</li></ul>
                  <p class="mt-3 text-sm text-[#64756c]">{{ question.explanation }}</p>
                  <p class="mt-1 text-xs text-[#78877f]">Evidência: {{ question.evidenceExcerpt }}</p>
                </article>
              </div>
              <div v-if="selectedQuiz.status === 'PENDING_REVIEW'" class="mt-5 grid gap-3 border-t border-[#e8ede9] pt-5">
                <label class="field-label">Motivo da reprovação <span class="font-normal text-[#78877f]">Obrigatório para reprovar</span><textarea v-model="rejectionReason" class="field" rows="2" maxlength="500"></textarea></label>
                <div class="flex flex-wrap gap-2"><button class="secondary-button" @click="reviewQuiz('reject')">Reprovar</button><button class="primary-button" @click="reviewQuiz('approve')">Aprovar e publicar</button></div>
              </div>
            </div>
            <div class="grid gap-3">
              <article v-for="quiz in quizzes" :key="quiz.id" class="surface flex flex-wrap items-center justify-between gap-4 p-4">
                <div><h2 class="font-semibold">{{ quiz.videoTitle }}</h2><p class="mt-1 text-sm text-[#64756c]">v{{ quiz.version }} · {{ label(quiz.status) }} · {{ quiz.questionCount }} questões · {{ date(quiz.createdAt) }}</p></div>
                <button class="secondary-button text-sm" @click="loadQuiz(quiz)">{{ quiz.status === 'PENDING_REVIEW' ? 'Revisar' : 'Ver questões' }}</button>
              </article>
              <p v-if="!quizzes.length" class="surface p-6 text-sm text-[#64756c]">Nenhum questionário neste estado.</p>
            </div>
          </section>

          <section v-else-if="tab === 'jobs'">
            <header class="mb-6"><p class="text-xs font-bold tracking-[.18em] text-[#34745b]">INTELIGÊNCIA ARTIFICIAL</p><h1 class="mt-2 font-serif text-4xl">Processamento</h1><p class="mt-2 text-[#64756c]">Acompanhe tarefas, falhas e custos estimados.</p></header>
            <div class="grid gap-3">
              <article v-for="job in jobs" :key="job.id" class="surface flex flex-wrap items-center justify-between gap-4 p-4">
                <div class="min-w-[200px] flex-1"><h2 class="font-semibold">{{ job.videoTitle || 'Debate' }} · {{ label(job.type) }}</h2><p class="mt-1 text-sm text-[#64756c]">{{ label(job.status) }} · {{ job.step }} · {{ job.attempts }} tentativas</p><p v-if="job.errorMessage" class="mt-1 text-xs text-[#9c3d35]">{{ job.errorMessage }}</p></div>
                <div class="flex gap-2"><button v-if="['FAILED', 'CANCELLED'].includes(job.status)" class="secondary-button text-sm" @click="jobAction(job, 'retry')">Reprocessar</button><button v-if="['QUEUED', 'RUNNING'].includes(job.status)" class="secondary-button text-sm" @click="jobAction(job, 'cancel')">Cancelar</button></div>
              </article>
              <p v-if="!jobs.length" class="surface p-6 text-sm text-[#64756c]">Nenhum processamento registrado.</p>
            </div>
          </section>

          <section v-else-if="tab === 'users'">
            <header class="mb-6"><p class="text-xs font-bold tracking-[.18em] text-[#34745b]">PESSOAS</p><h1 class="mt-2 font-serif text-4xl">Usuários e administradores</h1><p class="mt-2 text-[#64756c]">Convide administradores com confirmação de e-mail e gerencie o acesso.</p></header>
            <form class="surface mb-5 grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end" @submit.prevent="sendInvitation">
              <label class="field-label">Nome do administrador<input v-model="invite.name" class="field" minlength="2" maxlength="100" required /></label>
              <label class="field-label">E-mail<input v-model="invite.email" class="field" type="email" required /></label>
              <button class="primary-button" type="submit" :disabled="sendingInvite">{{ sendingInvite ? 'Enviando...' : 'Enviar convite de admin' }}</button>
            </form>
            <div class="grid gap-3">
              <article v-for="user in users" :key="user.id" class="surface flex flex-wrap items-center justify-between gap-3 p-4">
                <div><h2 class="font-semibold">{{ user.name || 'Sem nome' }}</h2><p class="mt-1 text-sm text-[#64756c]">{{ user.email }} · {{ label(user.role) }} · {{ label(user.status) }}</p></div>
                <button v-if="user.role !== 'ADMIN' && user.id !== session.user?.id && user.status !== 'DELETED'" class="secondary-button text-sm" @click="changeUserStatus(user, user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED')">{{ user.status === 'SUSPENDED' ? 'Reativar' : 'Suspender' }}</button>
              </article>
              <p v-if="!users.length" class="surface p-6 text-sm text-[#64756c]">Nenhum usuário encontrado.</p>
            </div>
          </section>

          <section v-else>
            <header class="mb-6"><p class="text-xs font-bold tracking-[.18em] text-[#34745b]">TRANSPARÊNCIA</p><h1 class="mt-2 font-serif text-4xl">Auditoria</h1><p class="mt-2 text-[#64756c]">Últimos 200 eventos administrativos.</p></header>
            <div class="grid gap-3">
              <article v-for="entry in auditLogs" :key="entry.id" class="surface flex flex-wrap items-center justify-between gap-3 p-4">
                <div><h2 class="font-semibold">{{ entry.action }} · {{ entry.entityType }}</h2><p class="mt-1 text-sm text-[#64756c]">{{ entry.actorName || 'Administrador' }} · {{ date(entry.createdAt) }}</p></div>
                <code class="max-w-full overflow-hidden text-ellipsis text-xs text-[#78877f]">{{ JSON.stringify(entry.metadata) }}</code>
              </article>
              <p v-if="!auditLogs.length" class="surface p-6 text-sm text-[#64756c]">Nenhuma ação registrada.</p>
            </div>
          </section>
        </template>
      </main>
    </div>
  </div>
</template>
