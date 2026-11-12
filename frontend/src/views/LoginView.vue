<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import { setSession } from '../lib/session';

const props = defineProps({
  adminOnly: {
    type: Boolean,
    default: false,
  },
});

const router = useRouter();
const email = ref('');
const password = ref('');
const loading = ref(false);
const message = ref('');
const messageType = ref('error');

async function login() {
  loading.value = true;
  message.value = '';
  try {
    const result = await api('/auth/login', {
      method: 'POST',
      body: { email: email.value.trim(), password: password.value },
    });
    if (props.adminOnly && result.user.role !== 'ADMIN') {
      message.value = 'Esta conta não tem acesso ao painel administrativo.';
      return;
    }
    setSession(result.accessToken, result.user);
    await router.replace(result.user.role === 'ADMIN' ? '/admin' : '/app');
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
    <header class="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
      <a href="/" class="flex items-center gap-3 text-lg font-bold tracking-tight text-[#17241f]">
        <span class="grid size-10 place-items-center rounded-xl bg-[#235d46] font-serif text-xl text-white">D</span>
        <span>Debate<span class="font-normal text-[#668074]">.crítico</span></span>
      </a>
    </header>
    <main class="mx-auto grid min-h-[calc(100vh-84px)] max-w-7xl items-center gap-12 px-5 pb-12 md:grid-cols-[1fr_440px] md:px-8">
      <section class="max-w-2xl py-8">
        <p class="mb-5 text-xs font-bold tracking-[.2em] text-[#34745b]">{{ props.adminOnly ? 'ACESSO RESTRITO · ADMINISTRAÇÃO' : 'PENSAMENTO CRÍTICO · APRENDIZAGEM' }}</p>
        <h1 class="max-w-xl font-serif text-5xl leading-[1.08] tracking-tight text-[#17241f] md:text-6xl">{{ props.adminOnly ? 'Administre a plataforma com segurança.' : 'Debates melhores começam com uma análise melhor.' }}</h1>
        <p class="mt-6 max-w-lg text-lg leading-8 text-[#64756c]">{{ props.adminOnly ? 'Entre com uma conta de administrador para gerenciar debates, aulas, usuários e avaliações.' : 'Aprenda a examinar argumentos, comparar evidências e formar suas próprias conclusões com mais clareza.' }}</p>
        <div class="mt-8 h-0.5 w-14 bg-[#34745b]"></div>
        <p class="mt-5 max-w-md text-sm leading-6 text-[#78877f]">Uma plataforma educacional para ouvir com atenção, avaliar com critério e pensar por conta própria.</p>
      </section>

      <section class="surface p-7 sm:p-9">
        <p class="text-xs font-bold tracking-[.18em] text-[#34745b]">{{ props.adminOnly ? 'PAINEL ADMINISTRATIVO' : 'BEM-VINDO DE VOLTA' }}</p>
        <h2 class="mt-3 font-serif text-3xl text-[#17241f]">{{ props.adminOnly ? 'Acesso de administrador' : 'Acesse sua conta' }}</h2>
        <p class="mt-2 text-sm text-[#64756c]">{{ props.adminOnly ? 'Use sua conta administrativa para entrar.' : 'Entre para continuar sua jornada de aprendizagem.' }}</p>
        <form class="mt-7 grid gap-5" @submit.prevent="login">
          <label class="field-label">E-mail
            <input v-model="email" class="field" type="email" autocomplete="email" required />
          </label>
          <label class="field-label">Senha
            <input v-model="password" class="field" type="password" autocomplete="current-password" required />
          </label>
          <p v-if="message" class="notice" :class="messageType" role="alert">{{ message }}</p>
          <button class="primary-button w-full" type="submit" :disabled="loading">{{ loading ? 'Entrando...' : 'Entrar' }}</button>
        </form>
        <div v-if="props.adminOnly" class="mt-6 grid gap-3 text-center text-sm text-[#64756c]">
          <RouterLink class="font-semibold text-[#235d46] underline-offset-4 hover:underline" to="/admin/accept-invite">Recebeu um convite? Criar seu perfil</RouterLink>
          <RouterLink class="text-xs underline-offset-4 hover:underline" to="/">Voltar ao login de usuário</RouterLink>
        </div>
        <p v-else class="mt-6 text-center text-sm text-[#64756c]">Ainda não tem uma conta?
          <RouterLink class="font-semibold text-[#235d46] underline-offset-4 hover:underline" to="/register">Criar cadastro</RouterLink>
        </p>
      </section>
    </main>
  </div>
</template>
