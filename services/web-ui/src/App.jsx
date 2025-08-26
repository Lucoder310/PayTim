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

  const handleLogin = async (token) => {
    setToken(token);
    await refreshAccount(token);
  };

  const handleLogout = () => {
    setToken(null);
    setUserData(null);
  };

  if (!token) return <Login onLogin={handleLogin} />;

  const account = userData?.accounts?.[0];
  let runningBalance = account?.balance;

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>🚀 PayTim Web-UI</h1>
      <p>
        Welcome, {userData?.name} | Balance: {account?.balance}{' '}
        <button onClick={handleLogout}>Logout</button>
      </p>
      <TransferForm
        fromAccountId={account?.id}
        onTransferSuccess={() => refreshAccount(token)}
      />
      <h2>Transactions</h2>
      <ul>
        {userData?.transfers
          ?.filter(t => t.fromAccountId === account?.id || t.toAccountId === account?.id)
          .map(t => {
            const isOut = t.fromAccountId === account?.id;
            const name = isOut ? t.toName : t.fromName;
            const color = isOut ? 'red' : 'green';
            const balanceAfter = runningBalance;
            runningBalance += isOut ? t.amount : -t.amount;
            return (
              <li key={t.id} style={{ color }}>
                {name}: {t.amount} (Kontostand: {balanceAfter})
              </li>
            );
          })}
      </ul>
    </div>
  );
}
