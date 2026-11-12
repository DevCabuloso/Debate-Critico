import { reactive } from 'vue';

const session = reactive({
  accessToken: sessionStorage.getItem('accessToken') || '',
  user: null,
});

function setSession(accessToken, user) {
  session.accessToken = accessToken;
  session.user = user;
  sessionStorage.setItem('accessToken', accessToken);
}

function clearSession() {
  session.accessToken = '';
  session.user = null;
  sessionStorage.removeItem('accessToken');
}

export { session, setSession, clearSession };
