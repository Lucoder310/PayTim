// web-ui/src/App.jsx
import { useState } from 'react';
import Login from './components/Login';
import UserForm from './components/UserForm';
import BalanceCheck from './components/BalanceCheck';
import TransferForm from './components/TransferForm';
import { getMyAccount } from './api';

export default function App() {
  const [token, setToken] = useState(null);
  const [userData, setUserData] = useState(null);

  const handleLogin = async (token, userId) => {
    setToken(token);
    const data = await getMyAccount(token);
    setUserData(data);
  };

  const handleLogout = () => {
    setToken(null);
    setUserData(null);
  };

  if (!token) return <Login onLogin={handleLogin} />;

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>🚀 PayTim Web-UI</h1>
      <p>Welcome, user {userData?.userId} <button onClick={handleLogout}>Logout</button></p>
      <BalanceCheck token={token} />
      <hr />
      <TransferForm token={token} />
      <hr />
      <UserForm token={token} />
    </div>
  );
}
