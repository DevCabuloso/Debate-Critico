<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import { clearSession, session } from '../lib/session';
import AppHeader from '../components/AppHeader.vue';

const router = useRouter();
const tab = ref('debate');
const loading = ref(false);
const error = ref('');
const notice = ref('');
const videos = ref([]);
const debate = reactive({ title: '', youtubeUrl: '', duration: 1200, categories: '', description: '', rightsBasis: '' });

function fail(message) { error.value = message; notice.value = ''; }
function succeed(message) { notice.value = message; error.value = ''; }

async function loadAll() {
  loading.value = true;
  try {
    const videoResult = await api('/admin/videos');
    videos.value = videoResult.items || [];
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
  <div class="app-page">
    <AppHeader area="admin" :user-name="session.user?.name" @logout="logout" />
    <main class="app-content">
      <p class="text-xs font-bold tracking-[.18em] text-[#34745b]">GESTÃO DE DEBATES</p>
      <h1 class="mt-2 font-serif text-4xl">Debates</h1>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-[#64756c]">Cadastre e organize os vídeos de debate. Eles ficam como rascunho até serem publicados.</p>
      <div v-if="error" class="notice error mt-5">{{ error }}</div>
      <div v-if="notice" class="notice success mt-5">{{ notice }}</div>

      <div class="mt-6 flex flex-wrap gap-2 border-b border-[#dfe7e1] pb-3">
        <button v-for="item in [['debate', 'Cadastrar debate'], ['library', 'Debates cadastrados']]" :key="item[0]"
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
        </section>
      </template>
    </main>
  </div>
</template>
