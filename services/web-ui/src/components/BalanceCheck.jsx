// web-ui/src/components/BalanceCheck.jsx
import { useState } from 'react';
import { axiosInstance } from '../axios';

export default function BalanceCheck() {
  const [accountId, setAccountId] = useState('');
  const [balance, setBalance] = useState('');

  const handleCheck = async () => {
    if (!accountId) return setBalance('Bitte Account-ID eingeben');
    try {
      const res = await axiosInstance.get(`/accounts/${accountId}`);
      setBalance(`Balance: ${res.data.balance}`);
    } catch (e) {
      console.error('getBalance error:', e);
      const msg = e.response?.data?.error || 'Fehler beim Abrufen';
      setBalance(msg);
    }
  };

  return (
    <div>
      <h2>Kontostand abfragen</h2>
      <input placeholder="Account ID" value={accountId} onChange={e => setAccountId(e.target.value)} />
      <button onClick={handleCheck}>Abfragen</button>
      <div>{balance}</div>
    </div>
  );
}
