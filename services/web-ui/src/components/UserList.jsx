// web-ui/src/components/UserList.jsx
import { useState, useEffect } from 'react';
import { axiosInstance } from '../axios';

export default function UserList({ refresh }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await axiosInstance.get('/users');
        setUsers(res.data);
      } catch (e) {
        console.error('listUsers error:', e);
        setUsers([]);
      }
    };
    fetchUsers();
  }, [refresh]);

  return (
    <div>
      <h3>Alle Nutzer</h3>
      {users.length === 0 && <div>Keine Nutzer gefunden</div>}
      {users.map(u => (
        <div key={u.id}>
          {u.name} (ID: {u.id}) | Konten: {(u.accounts || []).map(a => `${a.id}: ${a.balance}`).join(', ') || 'keine Konten'}
        </div>
      ))}
    </div>
  );
}
