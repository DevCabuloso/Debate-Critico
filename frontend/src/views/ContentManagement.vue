<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import { clearSession, session } from '../lib/session';

const router = useRouter();
const tab = ref('debate');
const loading = ref(false);
const error = ref('');
const notice = ref('');
const videos = ref([]);
const modules = ref([]);
const lessons = ref([]);
const debate = reactive({ title: '', youtubeUrl: '', duration: 1200, categories: '', description: '', rightsBasis: '' });
const moduleForm = reactive({ title: '', description: '' });
const lesson = reactive({ title: '', videoUrl: '', category: '', description: '', content: '', moduleId: '' });

function fail(message) { error.value = message; notice.value = ''; }
function succeed(message) { notice.value = message; error.value = ''; }

async function loadAll() {
  loading.value = true;
  try {
    const [videoResult, moduleResult, lessonResult] = await Promise.all([
      api('/admin/videos'),
      api('/admin/lesson-modules'),
      api('/admin/lessons'),
    ]);
    videos.value = videoResult.items || [];
    modules.value = moduleResult.items || [];
    lessons.value = lessonResult.items || [];
    if (!lesson.moduleId && modules.value.length) lesson.moduleId = modules.value[0].id;
  } catch (requestError) {
    fail(requestError.message);
  } finally {
    loading.value = false;
  }
}

async function saveDebate() {
  try {
    await api('/admin/videos', {
      method: 'POST',
      body: {
        title: debate.title.trim(),
        youtubeUrl: debate.youtubeUrl.trim(),
        duration: Number(debate.duration),
        categories: debate.categories.split(',').map((category) => category.trim()).filter(Boolean),
        description: debate.description.trim(),
        rightsBasis: debate.rightsBasis.trim(),
        language: 'pt-BR',
      },
    });
    Object.assign(debate, { title: '', youtubeUrl: '', duration: 1200, categories: '', description: '', rightsBasis: '' });
    succeed('Debate salvo como rascunho. Publique após preparar o questionário aprovado.');
    await loadAll();
  } catch (requestError) { fail(requestError.message); }
}

async function saveModule() {
  try {
    await api('/admin/lesson-modules', {
      method: 'POST',
      body: { title: moduleForm.title.trim(), description: moduleForm.description.trim() },
    });
    Object.assign(moduleForm, { title: '', description: '' });
    succeed('Módulo criado como rascunho. Publique-o quando estiver pronto.');
    await loadAll();
  } catch (requestError) { fail(requestError.message); }
}

async function saveLesson() {
  try {
    await api('/admin/lessons', {
      method: 'POST',
      body: {
        title: lesson.title.trim(),
        videoUrl: lesson.videoUrl.trim(),
        category: lesson.category.trim(),
        description: lesson.description.trim(),
        content: lesson.content.trim(),
        moduleId: lesson.moduleId,
      },
    });
    Object.assign(lesson, { title: '', videoUrl: '', category: '', description: '', content: '', moduleId: modules.value[0]?.id || '' });
    succeed('Aula salva como rascunho. Publique a aula e o módulo para exibi-los na área do usuário.');
    await loadAll();
  } catch (requestError) { fail(requestError.message); }
}

async function changeStatus(path, title, status) {
  try {
    await api(path, { method: 'PATCH', body: { status } });
    succeed(`${title}: ${status === 'PUBLISHED' ? 'publicado' : 'arquivado'}.`);
    await loadAll();
  } catch (requestError) { fail(requestError.message); }
}

function logout() {
  clearSession();
  router.replace('/');
}

onMounted(loadAll);
</script>

<template>
  <div class="min-h-screen bg-[#f5f7f5]">
    <header class="sticky top-0 z-10 border-b border-[#e3e9e5] bg-white/95 backdrop-blur">
      <div class="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 md:px-8">
        <RouterLink to="/admin" class="flex items-center gap-3 font-bold tracking-tight">
          <span class="grid size-9 place-items-center rounded-xl bg-[#235d46] font-serif text-lg text-white">D</span>
          <span>Debate<span class="font-normal text-[#668074]">.crítico</span><span class="ml-2 text-xs font-medium text-[#78877f]">/ conteúdo</span></span>
        </RouterLink>
        <div class="flex items-center gap-2"><span class="hidden text-sm text-[#52645a] sm:inline">{{ session.user?.name }}</span><RouterLink class="secondary-button text-sm" to="/admin">Painel</RouterLink><button class="secondary-button text-sm" @click="logout">Sair</button></div>
      </div>
    </header>
    <main class="mx-auto max-w-[1100px] px-4 py-7 md:px-8 md:py-10">
      <p class="text-xs font-bold tracking-[.18em] text-[#34745b]">GESTÃO DE CONTEÚDO</p>
      <h1 class="mt-2 font-serif text-4xl">Vídeos e aulas</h1>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-[#64756c]">Cadastre links de vídeos hospedados. Os debates do YouTube e as aulas ficam como rascunho até serem publicados por um administrador.</p>
      <div v-if="error" class="notice error mt-5">{{ error }}</div>
      <div v-if="notice" class="notice success mt-5">{{ notice }}</div>

      <div class="mt-6 flex flex-wrap gap-2 border-b border-[#dfe7e1] pb-3">
        <button v-for="item in [['debate', 'Cadastrar debate'], ['module', 'Criar módulo'], ['lesson', 'Cadastrar aula'], ['library', 'Conteúdo cadastrado']]" :key="item[0]"
          class="rounded-lg px-4 py-2 text-sm font-semibold"
          :class="tab === item[0] ? 'bg-[#235d46] text-white' : 'text-[#53645a] hover:bg-white'"
          @click="tab = item[0]">{{ item[1] }}</button>
      </div>

      <div v-if="loading" class="surface mt-5 p-7 text-sm text-[#64756c]">Carregando conteúdo…</div>
      <template v-else>
        <form v-if="tab === 'debate'" class="surface mt-5 grid gap-5 p-5 sm:p-7" @submit.prevent="saveDebate">
          <div><h2 class="font-serif text-2xl">Novo debate</h2><p class="mt-1 text-sm text-[#64756c]">O vídeo precisa estar hospedado no YouTube. A plataforma guarda o link e os metadados.</p></div>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="field-label">Título<input v-model="debate.title" class="field" maxlength="200" required /></label>
            <label class="field-label">URL do YouTube<input v-model="debate.youtubeUrl" class="field" type="url" placeholder="https://www.youtube.com/watch?v=…" required /></label>
            <label class="field-label">Duração em segundos<input v-model.number="debate.duration" class="field" type="number" min="1" required /></label>
            <label class="field-label">Categorias <span class="font-normal text-[#78877f]">Separadas por vírgula</span><input v-model="debate.categories" class="field" placeholder="política, economia" /></label>
            <label class="field-label sm:col-span-2">Descrição<textarea v-model="debate.description" class="field" rows="3"></textarea></label>
            <label class="field-label sm:col-span-2">Base de direitos / autorização<input v-model="debate.rightsBasis" class="field" maxlength="1000" placeholder="Ex.: licença ou autorização do titular" required /></label>
          </div>
          <div><button class="primary-button" type="submit">Salvar como rascunho</button></div>
        </form>

        <form v-else-if="tab === 'module'" class="surface mt-5 grid gap-5 p-5 sm:p-7" @submit.prevent="saveModule">
          <div><h2 class="font-serif text-2xl">Criar módulo de videoaulas</h2><p class="mt-1 text-sm text-[#64756c]">Organize aulas em módulos pedagógicos.</p></div>
          <label class="field-label">Nome do módulo<input v-model="moduleForm.title" class="field" minlength="2" maxlength="150" required /></label>
          <label class="field-label">Descrição<textarea v-model="moduleForm.description" class="field" rows="3"></textarea></label>
          <button class="primary-button justify-self-start" type="submit">Criar módulo</button>
        </form>

        <form v-else-if="tab === 'lesson'" class="surface mt-5 grid gap-5 p-5 sm:p-7" @submit.prevent="saveLesson">
          <div><h2 class="font-serif text-2xl">Nova videoaula</h2><p class="mt-1 text-sm text-[#64756c]">Informe um link público de vídeo (YouTube, Vimeo ou outro host permitido).</p></div>
          <p v-if="!modules.length" class="notice info">Crie um módulo antes de cadastrar uma aula.</p>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="field-label">Título<input v-model="lesson.title" class="field" minlength="2" maxlength="200" required /></label>
            <label class="field-label">Módulo<select v-model="lesson.moduleId" class="field" required><option disabled value="">Selecione um módulo</option><option v-for="module in modules" :key="module.id" :value="module.id">{{ module.title }} ({{ module.status === 'PUBLISHED' ? 'publicado' : 'rascunho' }})</option></select></label>
            <label class="field-label sm:col-span-2">Link do vídeo<input v-model="lesson.videoUrl" class="field" type="url" placeholder="https://…" /></label>
            <label class="field-label">Categoria<input v-model="lesson.category" class="field" maxlength="100" placeholder="Ex.: identificação de falácias" /></label>
            <label class="field-label">Descrição curta<input v-model="lesson.description" class="field" maxlength="1000" /></label>
            <label class="field-label sm:col-span-2">Conteúdo e objetivo da aula<textarea v-model="lesson.content" class="field" rows="5" maxlength="20000" required></textarea></label>
          </div>
          <div><button class="primary-button" type="submit" :disabled="!modules.length">Salvar aula como rascunho</button></div>
        </form>

        <section v-else class="mt-5 grid gap-7">
          <div class="surface p-5 sm:p-7">
            <div class="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 class="font-serif text-2xl">Debates</h2><p class="mt-1 text-sm text-[#64756c]">Vídeos vinculados ao YouTube.</p></div><button class="secondary-button text-sm" @click="loadAll">Atualizar</button></div>
            <div class="grid gap-3">
              <article v-for="video in videos" :key="video.id" class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f7f9f7] p-4">
                <div><h3 class="font-semibold">{{ video.title }}</h3><p class="mt-1 text-xs text-[#64756c]">{{ video.categories?.join(', ') || 'Sem categoria' }} · {{ video.status }}</p></div>
                <div class="flex gap-2"><button v-if="video.status !== 'PUBLISHED'" class="secondary-button text-xs" @click="changeStatus(`/admin/videos/${video.id}`, video.title, 'PUBLISHED')">Publicar</button><button v-if="video.status !== 'ARCHIVED'" class="secondary-button text-xs" @click="changeStatus(`/admin/videos/${video.id}`, video.title, 'ARCHIVED')">Arquivar</button></div>
              </article>
              <p v-if="!videos.length" class="text-sm text-[#64756c]">Nenhum debate cadastrado.</p>
            </div>
          </div>
          <div class="surface p-5 sm:p-7">
            <h2 class="font-serif text-2xl">Módulos</h2>
            <div class="mt-4 grid gap-3">
              <article v-for="module in modules" :key="module.id" class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f7f9f7] p-4">
                <div><h3 class="font-semibold">{{ module.title }}</h3><p class="mt-1 text-xs text-[#64756c]">{{ module.lessonsCount }} aulas · {{ module.status }}</p></div>
                <div class="flex gap-2"><button v-if="module.status !== 'PUBLISHED'" class="secondary-button text-xs" @click="changeStatus(`/admin/lesson-modules/${module.id}`, module.title, 'PUBLISHED')">Publicar</button><button v-if="module.status !== 'ARCHIVED'" class="secondary-button text-xs" @click="changeStatus(`/admin/lesson-modules/${module.id}`, module.title, 'ARCHIVED')">Arquivar</button></div>
              </article>
              <p v-if="!modules.length" class="text-sm text-[#64756c]">Nenhum módulo cadastrado.</p>
            </div>
          </div>
          <div class="surface p-5 sm:p-7">
            <h2 class="font-serif text-2xl">Videoaulas</h2>
            <div class="mt-4 grid gap-3">
              <article v-for="item in lessons" :key="item.id" class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f7f9f7] p-4">
                <div><h3 class="font-semibold">{{ item.title }}</h3><p class="mt-1 text-xs text-[#64756c]">{{ item.modules.map((entry) => entry.title).join(', ') || 'Sem módulo' }} · {{ item.status }}</p><a v-if="item.videoUrl" class="mt-1 block max-w-lg truncate text-xs text-[#235d46] underline" :href="item.videoUrl" target="_blank" rel="noopener noreferrer">{{ item.videoUrl }}</a></div>
                <div class="flex gap-2"><button v-if="item.status !== 'PUBLISHED'" class="secondary-button text-xs" @click="changeStatus(`/admin/lessons/${item.id}`, item.title, 'PUBLISHED')">Publicar</button><button v-if="item.status !== 'ARCHIVED'" class="secondary-button text-xs" @click="changeStatus(`/admin/lessons/${item.id}`, item.title, 'ARCHIVED')">Arquivar</button></div>
              </article>
              <p v-if="!lessons.length" class="text-sm text-[#64756c]">Nenhuma aula cadastrada.</p>
            </div>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
