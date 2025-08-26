// web-ui/src/components/UserForm.jsx
import { useState } from 'react';
import { axiosInstance } from '../axios';
import UserList from './UserList';

export default function UserForm() {
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [balance, setBalance] = useState(0);
  const [refresh, setRefresh] = useState(false);

  const handleCreate = async () => {
    if (!name) return alert('Name ist erforderlich');
    try {
      const uRes = await axiosInstance.post('/users', { name, id: id || undefined });
      const userId = uRes.data.id;
      const aRes = await axiosInstance.post('/accounts', { userId, initialBalance: balance });
      alert(`User angelegt: ${userId} | Konto: ${aRes.data.id} | Balance: ${aRes.data.balance}`);
      setRefresh(prev => !prev);
      setName(''); setId(''); setBalance(0);
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Fehler beim Anlegen';
      alert(msg);
    }
  };

  return (
    <div>
      <h2>Neuen Nutzer erstellen</h2>
      <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
      <input placeholder="User ID (optional)" value={id} onChange={e => setId(e.target.value)} />
      <input type="number" placeholder="Startbalance" value={balance} onChange={e => setBalance(parseFloat(e.target.value))} />
      <button onClick={handleCreate}>User erstellen</button>
      <UserList refresh={refresh} />
    </div>
  );
}
