// API-URL je nach Umgebung
const API = (() => {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'http://api-svc:3000';
})();

// Axios mit Standard-Timeout
const axiosInstance = axios.create({ timeout: 5000 });

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
    const uRes = await axiosInstance.post(`${API}/users`, { name, id });
    const userId = uRes.data.id;

    const aRes = await axiosInstance.post(`${API}/accounts`, { userId, initialBalance: balance });

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
  if (!id) return resultEl.innerText = 'Bitte Account-ID eingeben';

  try {
    const res = await axiosInstance.get(`${API}/accounts/${id}`);
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
    const res = await axiosInstance.get(`${API}/users`);
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
    return alert('Bitte alle Felder ausfüllen');
  }

  try {
    const res = await axiosInstance.post(`${API}/transfers`, { fromAccountId, toAccountId, amount });
    resultEl.innerText = `Transfer gestartet: ${res.data.transferId}`;
  } catch (e) {
    console.error('transfer error:', e);
    const msg = e.response?.data?.error || 'Fehler beim Transfer';
    resultEl.innerText = msg;
  }
}

// --- Initial ---
document.addEventListener('DOMContentLoaded', listUsers);
