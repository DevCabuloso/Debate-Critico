import { createRouter, createWebHistory } from 'vue-router';
import { session } from './lib/session';
import { api } from './lib/api';
import LoginView from './views/LoginView.vue';
import AdminInviteView from './views/AdminInviteView.vue';
import RegisterView from './views/RegisterView.vue';
import UserDashboard from './views/UserDashboard.vue';
import AdminDashboard from './views/AdminDashboard.vue';
import ContentManagement from './views/ContentManagement.vue';
import ProfileManagement from './views/ProfileManagement.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'login', component: LoginView },
    { path: '/admin/login', name: 'admin-login', component: LoginView, props: { adminOnly: true } },
    { path: '/admin/accept-invite', name: 'admin-accept-invite', component: AdminInviteView },
    { path: '/register', name: 'register', component: RegisterView },
    { path: '/app', name: 'app', component: UserDashboard, meta: { auth: true } },
    { path: '/admin', name: 'admin', component: AdminDashboard, meta: { auth: true, admin: true } },
    { path: '/admin/content', name: 'admin-content', component: ContentManagement, meta: { auth: true, admin: true } },
    { path: '/admin/profiles', name: 'admin-profiles', component: ProfileManagement, meta: { auth: true, admin: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  if (to.meta.auth && !session.accessToken) return { name: 'login' };
  if (to.meta.auth && !session.user) {
    try {
      const { user } = await api('/auth/me');
      session.user = user;
    } catch {
      return { name: 'login' };
    }
  }
  if (to.meta.admin && session.user?.role !== 'ADMIN') return { name: 'app' };
  if ((to.name === 'login' || to.name === 'admin-login' || to.name === 'register') && session.accessToken) {
    return { name: session.user?.role === 'ADMIN' ? 'admin' : 'app' };
  }
  return true;
});

export default router;
