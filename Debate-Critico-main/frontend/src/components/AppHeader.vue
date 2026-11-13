<script setup>
defineProps({
  area: {
    type: String,
    default: 'user',
  },
  brandTo: {
    type: String,
    default: '/',
  },
  userName: {
    type: String,
    default: '',
  },
  userRole: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['logout']);
</script>

<template>
  <header class="app-topbar">
    <div class="app-topbar-inner">
      <RouterLink class="app-brand" :to="brandTo" aria-label="Argumenta, laboratório de pensamento crítico">
        <span class="app-brand-mark">A</span>
        <span class="app-brand-name">ARGUMENTA<small>LABORATÓRIO DE PENSAMENTO CRÍTICO</small></span>
      </RouterLink>

      <nav v-if="area === 'user' || area === 'admin'" class="app-main-nav" aria-label="Navegação principal">
        <template v-if="area === 'user'">
          <RouterLink to="/app" active-class="active" exact-active-class="active">Debates</RouterLink>
          <RouterLink to="/app/curso" active-class="active" exact-active-class="active">Minicurso</RouterLink>
          <RouterLink v-if="userRole === 'ADMIN'" to="/admin" active-class="active" exact-active-class="active">Administração</RouterLink>
        </template>
        <template v-else>
          <RouterLink to="/admin" active-class="active" exact-active-class="active">Painel</RouterLink>
          <RouterLink to="/admin/profiles" active-class="active" exact-active-class="active">Perfis</RouterLink>
          <RouterLink to="/admin/content" active-class="active" exact-active-class="active">Debates</RouterLink>
        </template>
      </nav>

      <div v-if="area === 'user' || area === 'admin'" class="app-user">
        <span>{{ userName || 'Conta' }}</span>
        <RouterLink v-if="area === 'admin'" to="/app">Área do usuário</RouterLink>
        <button type="button" @click="emit('logout')">Sair</button>
      </div>
    </div>
  </header>
</template>
