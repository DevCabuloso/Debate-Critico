<script setup>
import { ref } from 'vue';
import { api } from '../lib/api';

const form = ref({
  name: '',
  email: '',
  password: '',
  ageConfirmed: false,
  termsAccepted: false,
  privacyAccepted: false,
});
const loading = ref(false);
const message = ref('');
const messageType = ref('success');

async function register() {
  loading.value = true;
  message.value = '';
  try {
    const result = await api('/auth/register', { method: 'POST', body: form.value });
    messageType.value = 'success';
    message.value = result.confirmationRequired
      ? 'Cadastro iniciado. Verifique sua caixa de entrada e confirme o e-mail antes de entrar.'
      : 'Conta criada. A confirmação por e-mail está desativada; você já pode entrar com seu e-mail e senha.';
    form.value = { name: '', email: '', password: '', ageConfirmed: false, termsAccepted: false, privacyAccepted: false };
  } catch (error) {
    messageType.value = 'error';
    message.value = error.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#f5f7f5]">
    <header class="mx-auto flex max-w-7xl items-center px-5 py-5 md:px-8">
      <RouterLink to="/" class="flex items-center gap-3 text-lg font-bold tracking-tight">
        <span class="grid size-10 place-items-center rounded-xl bg-[#235d46] font-serif text-xl text-white">D</span>
        <span>Debate<span class="font-normal text-[#668074]">.crítico</span></span>
      </RouterLink>
    </header>
    <main class="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-12 pt-5 md:grid-cols-[1fr_520px] md:px-8">
      <section class="max-w-xl py-6">
        <p class="mb-5 text-xs font-bold tracking-[.2em] text-[#34745b]">PENSAMENTO CRÍTICO · APRENDIZAGEM</p>
        <h1 class="font-serif text-5xl leading-tight tracking-tight">Comece sua jornada de aprendizagem.</h1>
        <p class="mt-5 max-w-lg text-lg leading-8 text-[#64756c]">Crie sua conta para acompanhar debates, videoaulas e seu progresso.</p>
      </section>
      <section class="surface p-7 sm:p-9">
        <p class="text-xs font-bold tracking-[.18em] text-[#34745b]">NOVO CADASTRO</p>
        <h2 class="mt-3 font-serif text-3xl">Crie sua conta</h2>
        <p class="mt-2 text-sm text-[#64756c]">Preencha seus dados para criar sua conta.</p>
        <form class="mt-6 grid gap-4" @submit.prevent="register">
          <label class="field-label">Nome
            <input v-model="form.name" class="field" type="text" minlength="2" maxlength="100" autocomplete="name" required />
          </label>
          <label class="field-label">E-mail
            <input v-model="form.email" class="field" type="email" autocomplete="email" required />
          </label>
          <label class="field-label">Senha <span class="font-normal text-[#78877f]">Mínimo de 8 caracteres</span>
            <input v-model="form.password" class="field" type="password" minlength="8" autocomplete="new-password" required />
          </label>
          <fieldset class="grid gap-3 rounded-xl bg-[#f6f8f6] p-4 text-sm text-[#46564d]">
            <label class="flex items-start gap-3"><input v-model="form.ageConfirmed" class="mt-1 accent-[#235d46]" type="checkbox" required /><span>Confirmo que atendo à idade mínima indicada nos termos de uso.</span></label>
            <label class="flex items-start gap-3"><input v-model="form.termsAccepted" class="mt-1 accent-[#235d46]" type="checkbox" required /><span>Li e aceito os termos de uso.</span></label>
            <label class="flex items-start gap-3"><input v-model="form.privacyAccepted" class="mt-1 accent-[#235d46]" type="checkbox" required /><span>Li e estou ciente da política de privacidade.</span></label>
          </fieldset>
          <p v-if="message" class="notice" :class="messageType" role="status">{{ message }}</p>
          <button class="primary-button w-full" type="submit" :disabled="loading">{{ loading ? 'Criando conta...' : 'Criar conta' }}</button>
        </form>
        <p class="mt-6 text-center text-sm text-[#64756c]">Já tem cadastro?
          <RouterLink class="font-semibold text-[#235d46] underline-offset-4 hover:underline" to="/">Ir para login</RouterLink>
        </p>
      </section>
    </main>
  </div>
</template>
