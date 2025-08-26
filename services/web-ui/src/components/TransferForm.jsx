// web-ui/src/components/TransferForm.jsx
import { useState } from 'react';
import { axiosInstance } from '../axios';

export default function TransferForm({ fromAccountId, onTransferSuccess }) {
  const [toAccount, setToAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState('');

  const handleTransfer = async () => {
    if (!fromAccountId || !toAccount || !amount)
      return alert('Bitte alle Felder ausfüllen');
    try {
      await axiosInstance.post('/transfers', {
        fromAccountId,
        toAccountId: toAccount,
        amount: parseFloat(amount),
      });

      let recipientName = 'Unbekannt';
      try {
        const usersResp = await axiosInstance.get('/users');
        const recipient = usersResp.data.find(u =>
          u.accounts.some(a => a.id === toAccount)
        );
        if (recipient?.name) recipientName = recipient.name;
      } catch (lookupErr) {
        console.error('recipient lookup failed:', lookupErr);
      }

      setResult(`${amount} gesendet an ${recipientName} |${toAccount}`);
      setToAccount('');
      setAmount('');
      onTransferSuccess && onTransferSuccess();
    } catch (e) {
      console.error('transfer error:', e);
      const msg = e.response?.data?.error || 'Fehler beim Transfer';
      setResult(msg);
    }
  };

  return (
    <div>
      <h2>Transfer</h2>
      <div>AccountID: {fromAccountId}</div>
      <input
        placeholder="Empfänger-ID"
        value={toAccount}
        onChange={e => setToAccount(e.target.value)}
      />
      <input
        type="number"
        placeholder="Betrag"
        value={amount}
        onChange={e => setAmount(e.target.value)}
      />
      <button onClick={handleTransfer}>Senden</button>
      <div>{result}</div>
    </div>
  );
}
