// guard.js – nur in index.html einbinden!
(function () {
  const API = (function () {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1'
      ? 'http://localhost:3000'
      : 'http://api-svc:3000';
  })();

  // Wenn diese Datei versehentlich doch auf login.html geladen würde,
  // verhindere eine Redirect-Schleife:
  const isLogin = /(^|\/)login\.html(\?|#|$)/i.test(location.pathname);
  if (isLogin) return;

  // Prüfe Login-Status
  fetch(`${API}/auth/me`, { credentials: 'include' })
    .then(resp => {
      if (!resp.ok) {
        location.replace('login.html');
        return Promise.reject(new Error('unauthenticated'));
      }
      return resp.json();
    })
    .then(data => {
      if (!data?.ok) location.replace('login.html');
      // Optional: user info parken
      window.currentUser = data.user;
    })
    .catch(() => {
      // Netzwerk/Fehler -> sicher zur Login-Seite
      location.replace('login.html');
    });
})();
