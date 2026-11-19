import { clearSession, session } from './session';

async function api(path, { method = 'GET', body, accessToken } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = accessToken || session.accessToken;
  if (token) headers.Authorization = `Bearer ${token}`;

  const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 401 && !accessToken && session.accessToken) clearSession();
  if (!response.ok) throw new Error(result.message || 'Não foi possível concluir a operação.');
  return result;
}

export { api };
