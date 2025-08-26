(async () => {
  const API = (window.API_BASE || 'http://localhost:3000');
  try {
    const resp = await fetch(`${API}/auth/me`, {
      credentials: 'include', // <-- Cookie mitsenden
    });
    if (!resp.ok) {
      window.location.href = 'login.html';
      return;
    }
    const data = await resp.json();
    if (!data.ok) {
      window.location.href = 'login.html';
    }
    // optional: user info anzeigen
    window.currentUser = data.user;
  } catch {
    window.location.href = 'login.html';
  }
})();
