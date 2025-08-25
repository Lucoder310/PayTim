import express from 'express';
import { Kafka } from 'kafkajs';
import { pool, migrate, withTx } from './db.mjs';
import { nanoid } from 'nanoid';
import { randomUUID } from 'node:crypto'; // NEU

process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));

const PORT = process.env.PORT || 3001;

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'ledger',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',')
});
const admin = kafka.admin();
const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ID || 'ledger-consumer' });
const producer = kafka.producer();

const TOPIC_CMD = 'transfers.commands';
const TOPIC_EVT = 'transfers.events';

const app = express();
app.use(express.json());

// ---- REST: Users & Accounts ----
app.post('/users', async (req, res) => {
  try {
    const { id, name } = req.body || {};
    if (!name) {
      res.status(400).json({ error: 'name required' });
      return;
    }
    const userId = id || cryptoRandomUuid();
    await pool.query('insert into users(id, name) values ($1,$2)', [userId, name]);
    res.status(201).json({ id: userId, name });
  } catch (e) {
    console.error('Error creating user:', e.message);
    res.status(500).json({ error: 'creation failed' });
  }
});

// /accounts
app.post('/accounts', async (req, res) => {
  try {  // <<< NEU
    const { id, userId, initialBalance } = req.body || {};
    if (!userId || initialBalance == null) return res.status(400).json({ error: 'userId & initialBalance required' });
    const accountId = id || cryptoRandomUuid();
    await pool.query('insert into accounts(id, user_id, balance) values ($1,$2,$3)', [accountId, userId, initialBalance]);
    res.status(201).json({ id: accountId, userId, balance: Number(initialBalance) });
  } catch (e) {  // <<< NEU
    console.error('Error creating account:', e.message);
    res.status(500).json({ error: 'creation failed' });
  }
});

// /accounts/:id
app.get('/accounts/:id', async (req, res) => {
  try {  // <<< NEU
    const r = await pool.query('select id, user_id as "userId", balance from accounts where id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  } catch (e) {  // <<< NEU
    console.error('Error fetching account:', e.message);
    res.status(500).json({ error: 'lookup failed' });
  }
});

// alle Nutzer + deren Konten
app.get('/users', async (req, res) => {
  try {
    const users = await pool.query('select id, name from users');
    const accounts = await pool.query('select id, user_id as "userId", balance from accounts');
    const result = users.rows.map(u => ({
      id: u.id,
      name: u.name,
      accounts: accounts.rows.filter(a => a.userId === u.id)
    }));
    res.json(result);
  } catch (e) {
    console.error('Error fetching users:', e.message);
    res.status(500).json({ error: 'lookup failed' });
  }
});



app.get('/transfers/:id', async (req, res) => {
  const r = await pool.query(
    'select id, from_account as "fromAccountId", to_account as "toAccountId", amount, status, reason from transfers where id=$1',
    [req.params.id]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(r.rows[0]);
});

// ---- Kafka Consumer: process transfer commands ----
async function handleTransfer({ transferId, fromAccountId, toAccountId, amount }) {
  // Idempotenz: wenn Transfer existiert, zurück
  const existing = await pool.query('select status from transfers where id=$1', [transferId]);
  if (existing.rows[0]) return existing.rows[0].status;

  try {
    await withTx(async (c) => {
      // Sperren in definierter Reihenfolge, um Deadlocks zu vermeiden
      const ids = [fromAccountId, toAccountId].sort();
      const acc = await c.query('select id, balance from accounts where id = any($1) for update', [ids]);
      if (acc.rowCount !== 2) throw new Error('account not found');

      const from = acc.rows.find(r => r.id === fromAccountId);
      const to = acc.rows.find(r => r.id === toAccountId);
      if (!from || !to) throw new Error('account not found');

      const amt = Number(amount);
      if (from.balance < amt) throw new Error('insufficient funds');

      // Upfront Transfer-Row (PENDING)
      await c.query(
        'insert into transfers(id, from_account, to_account, amount, status) values ($1,$2,$3,$4,$5)',
        [transferId, fromAccountId, toAccountId, amt, 'PENDING']
      );

      // Abbuchung
      const newFrom = Number(from.balance) - amt;
      await c.query('update accounts set balance=$1 where id=$2', [newFrom, fromAccountId]);
      await c.query(
        'insert into ledger_entries(transfer_id, account_id, delta, balance_after) values ($1,$2,$3,$4)',
        [transferId, fromAccountId, -amt, newFrom]
      );



      // Gutschrift
      const newTo = Number(to.balance) + amt;
      await c.query('update accounts set balance=$1 where id=$2', [newTo, toAccountId]);
      await c.query(
        'insert into ledger_entries(transfer_id, account_id, delta, balance_after) values ($1,$2,$3,$4)',
        [transferId, toAccountId, amt, newTo]
      );

      // Finalisieren
      await c.query('update transfers set status=$1 where id=$2', ['COMPLETED', transferId]);
    });

    await producer.send({
      topic: TOPIC_EVT,
      messages: [{ key: transferId, value: JSON.stringify({ transferId, status: 'COMPLETED' }) }]
    });
    return 'COMPLETED';
  } catch (e) {
    await pool.query(
      'insert into transfers(id, from_account, to_account, amount, status, reason) values ($1,$2,$3,$4,$5,$6) on conflict (id) do update set status=excluded.status, reason=excluded.reason',
      [transferId, fromAccountId, toAccountId, amount, 'FAILED', e.message]
    );
    await producer.send({
      topic: TOPIC_EVT,
      messages: [{ key: transferId, value: JSON.stringify({ transferId, status: 'FAILED', reason: e.message }) }]
    });
    return 'FAILED';
  }
}

//function cryptoRandomUuid() {
  // Node 20+ hat crypto.randomUUID(); fallback: nanoid
//  return (globalThis.crypto?.randomUUID?.() ?? nanoid());
//}
function cryptoRandomUuid() {
  return randomUUID(); // immer gültige UUIDv4
}

// =====================
// Bootstrap
// =====================
(async () => {
  try {
    // 1) DB-Migration
    await migrate();

    // 2) Kafka: Topics sicherstellen
    await admin.connect();
    await admin.createTopics({
      topics: [{ topic: TOPIC_CMD }, { topic: TOPIC_EVT }],
      waitForLeaders: true
    }).catch(() => {});
    await admin.disconnect();

    // 3) Producer/Consumer verbinden & Topic abonnieren
    await producer.connect();
    await consumer.connect();
    await consumer.subscribe({ topic: TOPIC_CMD, fromBeginning: false });

    // 4) HTTP-Server starten (Express wird benutzt → keine „unused“-Warnung)
    app.listen(PORT, () => console.log(`ledger-svc listening on :${PORT}`));

    // 5) Consumer-Loop im Hintergrund starten (NICHT awaiten!)
    void consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const payload = JSON.parse(message.value.toString());
          await handleTransfer(payload);
        } catch (e) {
          console.error('process error', e);
        }
      }
    }).catch(err => {
      console.error('consumer.run error', err);
      process.exit(1);
    });

    // 6) Graceful Shutdown
    const shutdown = async () => {
      try {
        await consumer.stop().catch(() => {});
        await consumer.disconnect().catch(() => {});
        await producer.disconnect().catch(() => {});
        await pool.end().catch(() => {});
        process.exit(0);
      } catch {
        process.exit(1);
      }
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (err) {
    console.error('bootstrap error', err);
    process.exit(1);
  }
})();
