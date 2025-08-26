// web-ui/src/components/TransferForm.jsx
import { useState } from 'react';
import { axiosInstance } from '../axios';

export default function TransferForm() {
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState('');

  const handleTransfer = async () => {
    if (!fromAccount || !toAccount || !amount) return alert('Bitte alle Felder ausfüllen');
    try {
      const res = await axiosInstance.post('/transfers', {
        fromAccountId: fromAccount,
        toAccountId: toAccount,
        amount: parseFloat(amount)
      });
      setResult(`Transfer gestartet: ${res.data.transferId}`);
      setFromAccount(''); setToAccount(''); setAmount('');
    } catch (e) {
      console.error('transfer error:', e);
      const msg = e.response?.data?.error || 'Fehler beim Transfer';
      setResult(msg);
    }
  };

  return (
    <div>
      <h2>Transfer</h2>
      <input placeholder="Von Account ID" value={fromAccount} onChange={e => setFromAccount(e.target.value)} />
      <input placeholder="Zu Account ID" value={toAccount} onChange={e => setToAccount(e.target.value)} />
      <input type="number" placeholder="Betrag" value={amount} onChange={e => setAmount(e.target.value)} />
      <button onClick={handleTransfer}>Senden</button>
      <div>{result}</div>
    </div>
  );
}
