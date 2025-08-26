// web-ui/src/App.jsx
import { useState } from 'react';
import Login from './components/Login';
import TransferForm from './components/TransferForm';
import { getMyAccount } from './api';

export default function App() {
  const [token, setToken] = useState(null);
  const [userData, setUserData] = useState(null);

  const refreshAccount = async (tkn) => {
    const data = await getMyAccount(tkn);
    setUserData(data);
  };

  const handleLogin = async (token, userId) => {
    setToken(token);
    await refreshAccount(token);
  };

  const handleLogout = () => {
    setToken(null);
    setUserData(null);
  };

  if (!token) return <Login onLogin={handleLogin} />;

  const account = userData?.accounts?.[0];

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>🚀 PayTim Web-UI</h1>
      <p>
        Welcome, user {userData?.userId} | Balance: {account?.balance}{' '}
        <button onClick={handleLogout}>Logout</button>
      </p>
      <TransferForm
        fromAccountId={account?.id}
        onTransferSuccess={() => refreshAccount(token)}
      />
    </div>
  );
}
