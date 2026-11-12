<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import { clearSession, session } from '../lib/session';

const router = useRouter();
const profiles = ref([]);
const registration = reactive({ publicRegistrationEnabled: true, requireEmailConfirmation: true });
const search = ref('');
const inviteForm = ref({ name: '', email: '' });
const editingProfile = ref(null);
const editName = ref('');
const loading = ref(true);
const saving = ref(false);
const savingSettings = ref(false);
const error = ref('');
const notice = ref('');

const filteredProfiles = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('pt-BR');
  if (!term) return profiles.value;
  return profiles.value.filter((profile) =>
    `${profile.name} ${profile.email}`.toLocaleLowerCase('pt-BR').includes(term));
});

function showError(message) {
  error.value = message;
  notice.value = '';
}

function showNotice(message) {
  notice.value = message;
  error.value = '';
}

async function loadData() {
  loading.value = true;
  error.value = '';
  try {
    const [profileResult, settingsResult] = await Promise.all([
      api('/admin/profiles'),
      api('/admin/settings/registration'),
    ]);
    profiles.value = profileResult.items || [];
    Object.assign(registration, settingsResult);
  } catch (requestError) {
    showError(requestError.message);
  } finally {
    loading.value = false;
  }
}

async function createProfile() {
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    const result = await api('/admin/profiles', {
      method: 'POST',
      body: { name: inviteForm.value.name.trim(), email: inviteForm.value.email.trim() },
    });
    inviteForm.value = { name: '', email: '' };
    showNotice(result.message);
    await loadData();
  } catch (requestError) {
    showError(requestError.message);
  } finally {
    saving.value = false;
  }
}

function startEditing(profile) {
  editingProfile.value = profile;
  editName.value = profile.name || '';
  error.value = '';
  notice.value = '';
}

async function saveProfile() {
  if (!editingProfile.value) return;
  saving.value = true;
  try {
    await api(`/admin/profiles/${editingProfile.value.id}`, {
      method: 'PATCH',
      body: { name: editName.value.trim() },
    });
    editingProfile.value = null;
    showNotice('Perfil atualizado.');
    await loadData();
  } catch (requestError) {
    showError(requestError.message);
  } finally {
    saving.value = false;
  }
}

async function changeStatus(profile, status) {
  const action = status === 'DELETED'
    ? `Excluir o perfil de ${profile.name || profile.email}? O acesso será bloqueado e o histórico será preservado.`
    : `${status === 'SUSPENDED' ? 'Suspender' : 'Reativar'} o acesso de ${profile.name || profile.email}?`;
  if (!window.confirm(action)) return;
  saving.value = true;
  try {
    await api(`/admin/profiles/${profile.id}`, { method: 'PATCH', body: { status } });
    showNotice(status === 'DELETED' ? 'Perfil excluído e acesso bloqueado.' : status === 'SUSPENDED' ? 'Perfil suspenso.' : 'Perfil reativado.');
    await loadData();
  } catch (requestError) {
    showError(requestError.message);
  } finally {
    saving.value = false;
  }
}

async function setPublicRegistration(enabled) {
  savingSettings.value = true;
  try {
    const result = await api('/admin/settings/registration', {
      method: 'PATCH',
      body: { publicRegistrationEnabled: enabled },
    });
    Object.assign(registration, result);
    showNotice(enabled ? 'Cadastro público habilitado.' : 'Cadastro público desabilitado. Convites administrativos continuam disponíveis.');
  } catch (requestError) {
    showError(requestError.message);
  } finally {
    savingSettings.value = false;
  }
}

async function setEmailConfirmation(required) {
  if (!required && !window.confirm('Desativar a confirmação por e-mail? Novas contas serão confirmadas automaticamente e poderão entrar imediatamente.')) return;
  savingSettings.value = true;
  try {
    const result = await api('/admin/settings/registration', {
      method: 'PATCH',
      body: { requireEmailConfirmation: required },
    });
    Object.assign(registration, result);
    showNotice(required
      ? 'A confirmação por e-mail será exigida nos próximos cadastros.'
      : 'A confirmação por e-mail foi desativada. Novas contas poderão entrar imediatamente.');
  } catch (requestError) {
    showError(requestError.message);
  } finally {
    savingSettings.value = false;
  }
}

function label(status) {
  return { ACTIVE: 'Ativo', SUSPENDED: 'Suspenso', DELETED: 'Excluído', USER: 'Usuário', ADMIN: 'Administrador' }[status] || status;
}

function date(value) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '—';
}

function logout() {
  clearSession();
  router.replace('/');
}

onMounted(loadData);
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
          <RouterLink to="/admin" class="secondary-button text-sm">Painel</RouterLink>
          <button class="secondary-button text-sm" @click="logout">Sair</button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-[1200px] px-4 py-7 md:px-8 md:py-10">
      <header class="mb-7">
        <p class="text-xs font-bold tracking-[.18em] text-[#34745b]">ADMINISTRAÇÃO</p>
        <h1 class="mt-2 font-serif text-4xl">Perfis</h1>
        <p class="mt-2 text-[#64756c]">Crie convites, edite perfis e controle o acesso e o cadastro público.</p>
      </header>

      <div v-if="error" class="notice error mb-5" role="alert">{{ error }}</div>
      <div v-if="notice" class="notice success mb-5" role="status">{{ notice }}</div>
      <div v-if="loading" class="surface p-8 text-sm text-[#64756c]">Carregando perfis e configurações…</div>

      <template v-else>
        <section class="surface mb-5 p-5 sm:p-6">
          <div class="flex flex-wrap items-start justify-between gap-5">
            <div class="max-w-2xl">
              <p class="text-xs font-bold tracking-[.16em] text-[#34745b]">CADASTRO E AUTENTICAÇÃO</p>
              <h2 class="mt-2 font-serif text-2xl">Cadastro público</h2>
              <p class="mt-2 text-sm leading-6 text-[#64756c]">
                {{ registration.publicRegistrationEnabled
                  ? 'Qualquer pessoa pode criar uma conta. A confirmação do e-mail é controlada separadamente abaixo.'
                  : 'Novos cadastros públicos estão bloqueados. Convites enviados por administradores continuam funcionando.' }}
              </p>
            </div>
            <button
              type="button"
              class="secondary-button min-w-44"
              :aria-pressed="registration.publicRegistrationEnabled"
              :disabled="savingSettings"
              @click="setPublicRegistration(!registration.publicRegistrationEnabled)"
            >
              {{ savingSettings ? 'Salvando…' : registration.publicRegistrationEnabled ? 'Desabilitar cadastro' : 'Habilitar cadastro' }}
            </button>
          </div>
          <div class="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-[#e8ede9] pt-4">
            <div class="max-w-2xl">
              <h3 class="font-semibold text-[#25352d]">Confirmação do e-mail no cadastro</h3>
              <p class="mt-1 text-sm text-[#64756c]">
                {{ registration.requireEmailConfirmation
                  ? 'Ativada: novos usuários precisam confirmar pelo link enviado antes de entrar.'
                  : 'Desativada: novas contas são confirmadas automaticamente e podem entrar sem abrir um link.' }}
              </p>
            </div>
            <button
              type="button"
              class="secondary-button min-w-52"
              :aria-pressed="!registration.requireEmailConfirmation"
              :disabled="savingSettings"
              @click="setEmailConfirmation(!registration.requireEmailConfirmation)"
            >
              {{ savingSettings ? 'Salvando…' : registration.requireEmailConfirmation ? 'Desativar confirmação' : 'Exigir confirmação' }}
            </button>
          </div>
        </section>

        <section class="surface mb-5 p-5 sm:p-6">
          <p class="text-xs font-bold tracking-[.16em] text-[#34745b]">NOVO PERFIL</p>
          <h2 class="mt-2 font-serif text-2xl">Convidar usuário</h2>
          <p class="mt-2 text-sm text-[#64756c]">Um convite será enviado ao e-mail para confirmar a conta e definir uma senha.</p>
          <form class="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" @submit.prevent="createProfile">
            <label class="field-label">Nome
              <input v-model="inviteForm.name" class="field" minlength="2" maxlength="100" autocomplete="name" required />
            </label>
            <label class="field-label">E-mail
              <input v-model="inviteForm.email" class="field" type="email" autocomplete="email" required />
            </label>
            <button class="primary-button" type="submit" :disabled="saving">{{ saving ? 'Enviando…' : 'Enviar convite' }}</button>
          </form>
        </section>

        <section>
          <header class="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 class="font-serif text-2xl">Usuários cadastrados</h2>
              <p class="mt-1 text-sm text-[#64756c]">Até 200 perfis mais recentes.</p>
            </div>
            <label class="field-label w-full sm:max-w-xs">Buscar por nome ou e-mail
              <input v-model="search" class="field" type="search" autocomplete="off" />
            </label>
          </header>

          <div class="grid gap-3">
            <article v-for="profile in filteredProfiles" :key="profile.id" class="surface p-4 sm:p-5">
              <div v-if="editingProfile?.id === profile.id" class="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <label class="field-label">Nome
                  <input v-model="editName" class="field" minlength="2" maxlength="100" required />
                </label>
                <button class="primary-button" :disabled="saving" @click="saveProfile">{{ saving ? 'Salvando…' : 'Salvar' }}</button>
                <button class="secondary-button" :disabled="saving" @click="editingProfile = null">Cancelar</button>
              </div>
              <div v-else class="flex flex-wrap items-center justify-between gap-4">
                <div class="min-w-[220px] flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="font-semibold">{{ profile.name || 'Sem nome' }}</h3>
                    <span class="rounded-full bg-[#f0f3f1] px-2.5 py-1 text-xs">{{ label(profile.role) }}</span>
                    <span class="rounded-full px-2.5 py-1 text-xs" :class="profile.status === 'ACTIVE' ? 'bg-[#eaf2ed] text-[#235d46]' : 'bg-[#f8e9e7] text-[#9c3d35]'">{{ label(profile.status) }}</span>
                  </div>
                  <p class="mt-1 text-sm text-[#64756c]">{{ profile.email }} · Criado em {{ date(profile.createdAt) }}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button class="secondary-button text-sm" :disabled="saving" @click="startEditing(profile)">Editar nome</button>
                  <button
                    v-if="profile.status !== 'DELETED' && profile.id !== session.user?.id"
                    class="secondary-button text-sm"
                    :disabled="saving"
                    @click="changeStatus(profile, profile.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED')"
                  >{{ profile.status === 'SUSPENDED' ? 'Reativar' : 'Suspender' }}</button>
                  <button
                    v-if="profile.status !== 'DELETED' && profile.id !== session.user?.id"
                    class="rounded-lg border border-[#f0c4bd] px-3 py-2 text-sm font-semibold text-[#9c3d35] hover:bg-[#fff3f1] disabled:opacity-50"
                    :disabled="saving"
                    @click="changeStatus(profile, 'DELETED')"
                  >Excluir</button>
                </div>
              </div>
            </article>
            <p v-if="!filteredProfiles.length" class="surface p-6 text-sm text-[#64756c]">
              {{ profiles.length ? 'Nenhum perfil corresponde à busca.' : 'Nenhum perfil encontrado.' }}
            </p>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
