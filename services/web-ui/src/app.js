// Wenn im Browser vom Host: localhost, sonst Container-Name
const API = (() => {
  // Docker-Container-Umgebung setzt oft window.location.hostname auf localhost? prüfen
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1'
    ? 'http://localhost:3000'   // Host-Browser greift auf gemappten Port zu
    : 'http://api-svc:3000';    // Web-UI Container greift intern auf api-svc
})();

// --- User erstellen mit optionaler ID + Startbalance ---
async function createUser() {
  const name = document.getElementById('userName').value;
  const id = document.getElementById('userId').value || undefined;
  const balance = parseFloat(document.getElementById('startBalance').value) || 0;

  if (!name) return alert('Name ist erforderlich');

  try {
    const uRes = await axios.post(`${API}/users`, { name, id });
    const userId = uRes.data.id;

    const aRes = await axios.post(`${API}/accounts`, { userId, initialBalance: balance });

    alert(`User angelegt: ${userId} | Konto: ${aRes.data.id} | Balance: ${aRes.data.balance}`);
    listUsers();
  } catch (e) {
    console.error(e);
    alert('Fehler beim Anlegen des Users');
  }
}

// --- Kontostand abfragen ---
async function getBalance() {
  const id = document.getElementById('accountId').value;
  try {
    const res = await axios.get(`${API}/accounts/${id}`);
    document.getElementById('balanceResult').innerText = `Balance: ${res.data.balance}`;
  } catch (e) {
    document.getElementById('balanceResult').innerText = 'Fehler beim Abrufen';
  }
}

// --- Alle Nutzer auflisten ---
async function listUsers() {
  try {
    const res = await axios.get(`${API}/users`);
    const container = document.getElementById('userList');
    container.innerHTML = '';
    res.data.forEach(u => {
      const div = document.createElement('div');
      const accounts = (u.accounts || []).map(a => `${a.id}: ${a.balance}`).join(', ') || 'keine Konten';
      div.innerText = `${u.name} (ID: ${u.id}) | Konten: ${accounts}`;
      container.appendChild(div);
    });
  } catch (e) {
    console.error(e);
  }
}

// --- Transfer starten ---
async function transfer() {
  const fromAccountId = document.getElementById('fromAccount').value;
  const toAccountId = document.getElementById('toAccount').value;
  const amount = parseFloat(document.getElementById('amount').value);

  if (!fromAccountId || !toAccountId || isNaN(amount)) {
    return alert('Bitte alle Felder ausfüllen');
  }

  try {
    const res = await axios.post(`${API}/transfers`, { fromAccountId, toAccountId, amount });
    document.getElementById('transferResult').innerText = `Transfer gestartet: ${res.data.transferId}`;
  } catch (e) {
    console.error(e);
    document.getElementById('transferResult').innerText = 'Fehler beim Transfer';
  }
}

// --- Initial ---
listUsers();
