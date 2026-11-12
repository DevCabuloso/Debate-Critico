<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../lib/api';

const accessToken = ref('');
const password = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const inviteValid = ref(false);
const message = ref('');
const messageType = ref('info');
const completedRole = ref('');

onMounted(() => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const token = params.get('access_token') || '';
  const inviteType = params.get('type') || '';
  const emailError = params.get('error_description');

  window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
  if (emailError) {
    message.value = 'O link do convite expirou ou não é válido. Peça a um administrador que envie um novo convite.';
    messageType.value = 'error';
    return;
  }
  if (!token || inviteType !== 'invite') {
    message.value = 'Para criar seu perfil, abra o link de convite enviado ao seu e-mail.';
    messageType.value = 'info';
    return;
  }

  accessToken.value = token;
  inviteValid.value = true;
});

async function completeProfile() {
  if (password.value.length < 8) {
    message.value = 'A senha deve ter pelo menos 8 caracteres.';
    messageType.value = 'error';
    return;
  }
  if (password.value !== confirmPassword.value) {
    message.value = 'As senhas não conferem.';
    messageType.value = 'error';
    return;
  }

  loading.value = true;
  message.value = '';
  try {
    const result = await api('/auth/admin-invitation/complete', {
      method: 'POST',
      accessToken: accessToken.value,
      body: { accessToken: accessToken.value, password: password.value },
    });
    inviteValid.value = false;
    completedRole.value = result.role;
    accessToken.value = '';
    password.value = '';
    confirmPassword.value = '';
    message.value = result.message;
    messageType.value = 'success';
  } catch (error) {
    message.value = error.message;
    messageType.value = 'error';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#f5f7f5]">
    <header class="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
      <RouterLink to="/admin/login" class="flex items-center gap-3 text-lg font-bold tracking-tight text-[#17241f]">
        <span class="grid size-10 place-items-center rounded-xl bg-[#235d46] font-serif text-xl text-white">D</span>
        <span>Debate<span class="font-normal text-[#668074]">.crítico</span></span>
      </RouterLink>
    </header>
    <main class="mx-auto grid min-h-[calc(100vh-84px)] max-w-7xl items-center gap-12 px-5 pb-12 md:grid-cols-[1fr_480px] md:px-8">
      <section class="max-w-2xl py-8">
        <p class="mb-5 text-xs font-bold tracking-[.2em] text-[#34745b]">CONVITE DA PLATAFORMA</p>
        <h1 class="max-w-xl font-serif text-5xl leading-[1.08] tracking-tight text-[#17241f] md:text-6xl">Finalize seu perfil.</h1>
        <p class="mt-6 max-w-lg text-lg leading-8 text-[#64756c]">Esta página conclui um cadastro criado por convite e acessado pelo link enviado ao seu e-mail.</p>
      </section>

      <section class="surface p-7 sm:p-9">
        <p class="text-xs font-bold tracking-[.18em] text-[#34745b]">CRIAR PERFIL</p>
        <h2 class="mt-3 font-serif text-3xl text-[#17241f]">Defina sua senha</h2>
        <p class="mt-2 text-sm text-[#64756c]">Use uma senha com pelo menos 8 caracteres para ativar seu acesso.</p>
        <form v-if="inviteValid" class="mt-7 grid gap-5" @submit.prevent="completeProfile">
          <label class="field-label">Nova senha
            <input v-model="password" class="field" type="password" minlength="8" autocomplete="new-password" required />
          </label>
          <label class="field-label">Confirme a senha
            <input v-model="confirmPassword" class="field" type="password" minlength="8" autocomplete="new-password" required />
          </label>
          <p v-if="message" class="notice" :class="messageType" role="alert">{{ message }}</p>
          <button class="primary-button w-full" type="submit" :disabled="loading">{{ loading ? 'Finalizando perfil...' : 'Criar perfil' }}</button>
        </form>
        <p v-else-if="message" class="notice mt-6" :class="messageType" role="status">{{ message }}</p>
        <p v-if="messageType === 'success'" class="mt-5 text-center text-sm text-[#64756c]">
          <RouterLink class="font-semibold text-[#235d46] underline-offset-4 hover:underline" :to="completedRole === 'ADMIN' ? '/admin/login' : '/'">Ir para o login</RouterLink>
        </p>
        <p v-else class="mt-6 text-center text-sm text-[#64756c]">
          <RouterLink class="font-semibold text-[#235d46] underline-offset-4 hover:underline" to="/admin/login">Voltar ao login de administrador</RouterLink>
        </p>
      </section>
    </main>
  </div>
</template>
