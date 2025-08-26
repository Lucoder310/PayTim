import { axiosInstance } from './axios';

export async function login(username, password) {
  const resp = await axiosInstance.post('/login', { username, password });
  return resp.data;
}

export async function register(name, username, password, initialBalance) {
  const resp = await axiosInstance.post('/register', {
    name,
    username,
    password,
    initialBalance,
  });
  return resp.data;
}

export async function getMyAccount(token) {
  const resp = await axiosInstance.get('/my-account', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return resp.data;
}

// Optional: Test-User anlegen (funktioniert nur, wenn Node Vite top-level await erlaubt)
async function createTestUser() {
  try {
    const data = await register('Max Mustermann', 'max', 'geheim123', 0);
    console.log('User registriert:', data);
  } catch (err) {
    console.error('Fehler beim Test-User:', err.response?.data || err.message);
  }
}

//createTestUser();
