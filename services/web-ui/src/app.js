// API-URL je nach Umgebung
const API = (() => {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'http://api-svc:3000';
})();

// Axios mit Standard-Timeout
const axiosInstance = axios.create({ timeout: 5000 });

let currentAccountId = null;

async function createAccount() {
  const nameEl = document.getElementById('newUserName');
  const balanceEl = document.getElementById('newUserBalance');
  const infoEl = document.getElementById('newAccountInfo');
  if (!nameEl || !balanceEl || !infoEl) return;
  const name = nameEl.value.trim();
  const initialBalance = parseFloat(balanceEl.value);
  if (!name || isNaN(initialBalance)) {
    return alert('Bitte Name und Startguthaben eingeben');
  }
  infoEl.innerText = 'Erstelle Account...';
  try {
    const user = await axiosInstance.post(`${API}/users`, { name });
    const account = await axiosInstance.post(`${API}/accounts`, {
      userId: user.data.id,
      initialBalance
    });
    infoEl.innerText = `Account erstellt. ID: ${account.data.id}`;
    const loginInput = document.getElementById('loginAccountId');
    if (loginInput) loginInput.value = account.data.id;
    await login();
  } catch (e) {
    console.error('createAccount error:', e);
    const msg = e.response?.data?.error || 'Fehler beim Erstellen';
    infoEl.innerText = msg;
  }
}

async function login() {
  const idEl = document.getElementById('loginAccountId');
  if (!idEl) return;
  const id = idEl.value.trim();
  if (!id) return alert('Bitte Account-ID eingeben');

  try {
    const res = await axiosInstance.get(`${API}/accounts/${id}`);
    currentAccountId = res.data.id;
    document.getElementById('welcome').innerText = `Willkommen, ${res.data.name}!`;
    document.getElementById('fromAccount').value = currentAccountId;
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    updateBalance(res.data.balance);
  } catch (e) {
    const msg = e.response?.data?.error || 'Account nicht gefunden';
    alert(msg);
  }
}

function updateBalance(balance) {
  document.getElementById('balance').innerText = balance;
}

async function refreshBalance() {
  if (!currentAccountId) return;
  try {
    const res = await axiosInstance.get(`${API}/accounts/${currentAccountId}`);
    updateBalance(res.data.balance);
  } catch (e) {
    console.error('refreshBalance error:', e);
  }
}

async function transfer() {
  const toEl = document.getElementById('toAccount');
  const amountEl = document.getElementById('amount');
  const resultEl = document.getElementById('transferResult');
  if (!toEl || !amountEl || !resultEl) return;

  const toAccountId = toEl.value.trim();
  const amount = parseFloat(amountEl.value);
  if (!toAccountId || isNaN(amount)) {
    return alert('Bitte Empfänger und Betrag eingeben');
  }

  try {
    const res = await axiosInstance.post(`${API}/transfers`, {
      fromAccountId: currentAccountId,
      toAccountId,
      amount
    });
    resultEl.innerText = 'Transfer gesendet, warte auf Bestätigung...';
    await pollStatus(res.data.statusUrl);
    resultEl.innerText = 'Transfer abgeschlossen';
    toEl.value = '';
    amountEl.value = '';
    await refreshBalance();
  } catch (e) {
    console.error('transfer error:', e);
    const msg = e.response?.data?.error || 'Fehler beim Transfer';
    resultEl.innerText = msg;
  }
}

async function pollStatus(statusUrl) {
  for (;;) {
    try {
      const r = await axiosInstance.get(`${API}${statusUrl}`);
      if (r.data.status && r.data.status !== 'PENDING') return r.data.status;
    } catch (e) {
      console.error('pollStatus error:', e);
      return;
    }
    await new Promise(res => setTimeout(res, 500));
  }
}

