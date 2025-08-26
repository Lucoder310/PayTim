import { useState } from 'react';
import { login, register } from '../api';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLogin, setIsLogin] = useState(true); // toggle zwischen Login und Register

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isLogin) {
        const data = await login(username, password);
        onLogin(data.token, data.userId);
      } else {
        const data = await register(name, username, password);
        alert('Registrierung erfolgreich! Bitte einloggen.');
        setIsLogin(true);
        setUsername('');
        setPassword('');
        setName('');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler');
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '2rem auto' }}>
      <h2>{isLogin ? 'Login' : 'Registrieren'}</h2>
      <form onSubmit={handleSubmit}>
        {!isLogin && (
          <div>
            <label>Name:</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        )}
        <div>
          <label>Username:</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <label>Password:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit">{isLogin ? 'Login' : 'Registrieren'}</button>
      </form>
      <p style={{ marginTop: '1rem' }}>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setIsLogin(!isLogin);
            setError('');
          }}
        >
          {isLogin ? 'Neuen Account registrieren' : 'Zurück zum Login'}
        </a>
      </p>
    </div>
  );
}
