// ===== API Base je nach Umgebung =====
const API = (() => {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'http://api-svc:3000';
})();

// ===== Axios-Client (mit Cookies) =====
const axiosInstance = axios.create({
  baseURL: API,
  timeout: 5000,
  withCredentials: true, // <-- wichtig für auth-cookie
});

// ===== Page detection =====
const isLoginPage = () => /(^|\/)login\.html(\?|#|$)/i.test(location.pathname);

// ===== Auth Guard (nur auf Nicht-Login-Seiten) =====
async function guard() {
  if (isLoginPage()) return; // Login-Seite selbst nicht guarden
  try {
    const r = await fetch(`${API}/auth/me`, { credentials: 'include' });
    if (!r.ok) {
      // nicht eingeloggt -> zur Login-Seite
      location.href = 'login.html';
      return;
    }
    // eingeloggt -> optional user in window.currentUser
    const data = await r.json().catch(() => ({}));
    if (data?.ok && data.user) {
      window.currentUser = data.user;
    }
  } catch {
    location.href = 'login.html';
  }
}

// ===== Login-Handler (nur auf Login-Seite) =====
function initLoginForm() {
  if (!isLoginPage()) return;
  const form = document.getElementById('loginForm');
  const errEl = document.getElementById('err');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = {
      username: String(fd.get('username') || '').trim(),
      password: String(fd.get('password') || ''),
    };
    if (!body.username || !body.password) {
      if (errEl) errEl.textContent = 'Bitte Benutzername und Passwort ausfüllen';
      return;
    }
    try {
      const resp = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include', // <-- Cookie setzen lassen
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const msg = await resp.json().catch(() => ({}));
        if (errEl) errEl.textContent = msg.error || 'Login fehlgeschlagen';
        return;
      }
      // Login ok -> zur App
      location.href = 'index.html';
    } catch {
      if (errEl) errEl.textContent = 'Netzwerkfehler';
    }
  });
}

// ===== Logout (optional Button mit id="logoutBtn") =====
function initLogout() {
  const btn = document.getElementById('logoutBtn');
  if (!btn) return;
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await fetch(`${API}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      location.href = 'login.html';
    }
  });
}

// ===== Deine bestehenden Funktionen (leicht angepasst auf axiosInstance.baseURL) =====

// --- User erstellen ---
async function createUser() {
  const nameEl = document.getElementById('userName');
  const idEl = document.getElementById('userId');
  const balanceEl = document.getElementById('startBalance');

  if (!nameEl || !balanceEl) return alert('Formular nicht vollständig');
  const name = nameEl.value.trim();
  const id = idEl?.value.trim() || undefined;
  const balance = parseFloat(balanceEl.value) || 0;

  if (!name) return alert('Name ist erforderlich');

  try {
    const uRes = await axiosInstance.post(`/users`, { name, id });
    const userId = uRes.data.id;

    const aRes = await axiosInstance.post(`/accounts`, { userId, initialBalance: balance });

    alert(`User angelegt: ${userId} | Konto: ${aRes.data.id} | Balance: ${aRes.data.balance}`);
    listUsers();
  } catch (e) {
    console.error('createUser error:', e);
    const msg = e.response?.data?.error || e.message || 'Unbekannter Fehler';
    alert(`Fehler beim Anlegen des Users: ${msg}`);
  }
}

// --- Kontostand abfragen ---
async function getBalance() {
  const idEl = document.getElementById('accountId');
  const resultEl = document.getElementById('balanceResult');
  if (!idEl || !resultEl) return;

  const id = idEl.value.trim();
  if (!id) {
    resultEl.innerText = 'Bitte Account-ID eingeben';
    return;
  }

  try {
    const res = await axiosInstance.get(`/accounts/${id}`);
    resultEl.innerText = `Balance: ${res.data.balance}`;
  } catch (e) {
    console.error('getBalance error:', e);
    const msg = e.response?.data?.error || 'Fehler beim Abrufen';
    resultEl.innerText = msg;
  }
}

// --- Alle Nutzer auflisten ---
async function listUsers() {
  const container = document.getElementById('userList');
  if (!container) return;

  container.innerHTML = '';
  try {
    const res = await axiosInstance.get(`/users`);
    res.data.forEach(u => {
      const div = document.createElement('div');
      const accounts = (u.accounts || []).map(a => `${a.id}: ${a.balance}`).join(', ') || 'keine Konten';
      div.innerText = `${u.name} (ID: ${u.id}) | Konten: ${accounts}`;
      container.appendChild(div);
    });
  } catch (e) {
    console.error('listUsers error:', e);
    const div = document.createElement('div');
    div.innerText = 'Fehler beim Laden der Nutzer';
    container.appendChild(div);
  }
}

// --- Transfer starten ---
async function transfer() {
  const fromEl = document.getElementById('fromAccount');
  const toEl = document.getElementById('toAccount');
  const amountEl = document.getElementById('amount');
  const resultEl = document.getElementById('transferResult');
  if (!fromEl || !toEl || !amountEl || !resultEl) return;

  const fromAccountId = fromEl.value.trim();
  const toAccountId = toEl.value.trim();
  const amount = parseFloat(amountEl.value);

  if (!fromAccountId || !toAccountId || isNaN(amount)) {
    alert('Bitte alle Felder ausfüllen');
    return;
  }

  try {
    const res = await axiosInstance.post(`/transfers`, { fromAccountId, toAccountId, amount });
    resultEl.innerText = `Transfer gestartet: ${res.data.transferId}`;
  } catch (e) {
    console.error('transfer error:', e);
    const msg = e.response?.data?.error || 'Fehler beim Transfer';
    resultEl.innerText = msg;
  }
}

// ===== Boot =====
document.addEventListener('DOMContentLoaded', async () => {
  // Guard nur, wenn wir nicht auf der Login-Seite sind
  await guard();

  // Login-Form initialisieren (nur auf login.html)
  initLoginForm();

  // Logout optional
  initLogout();

  // Wenn wir auf der App/Index sind, initial users laden
  if (!isLoginPage()) {
    listUsers();
  }
});

// ===== optional: export in global scope für onclick-Handler in HTML =====
window.createUser = createUser;
window.getBalance = getBalance;
window.listUsers = listUsers;
window.transfer = transfer;
