import express from 'express';
import { Kafka } from 'kafkajs';
import axios from 'axios';
import { nanoid } from 'nanoid';
import cors from 'cors';
import { randomUUID } from 'node:crypto'; 

process.on('unhandledRejection', (reason) => { // Rebuster
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const PORT = process.env.PORT || 3000;
const LEDGER_URL = process.env.LEDGER_URL || 'http://localhost:3001';
const kafka = new Kafka({
clientId: process.env.KAFKA_CLIENT_ID || 'api',
brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',')
});
const admin = kafka.admin();
const producer = kafka.producer();


const TOPIC_CMD = 'transfers.commands';
const TOPIC_EVT = 'transfers.events';


async function ensureTopics() {
await admin.connect();
await admin.createTopics({
topics: [
{ topic: TOPIC_CMD, numPartitions: 1, replicationFactor: 1 },
{ topic: TOPIC_EVT, numPartitions: 1, replicationFactor: 1 }
],
waitForLeaders: true
}).catch(() => {});
await admin.disconnect();
}


const app = express();
app.use(cors()); //CORS Aktivieren
app.use(express.json());


// Health
app.get('/health', (_, res) => res.json({ ok: true }));


// Benutzer anlegen (delegiert an Ledger REST)
app.post('/users', async (req, res) => {
  try {   
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    const r = await axios.post(`${LEDGER_URL}/users`, { name }, { timeout: 5000 });
    res.status(201).json(r.data);
  } catch (e) {   
    console.error('Error creating user:', e.message);
    res.status(e.response?.status || 500).json(e.response?.data || { error: 'creation failed' });
  }
});

// Konto anlegen (mit Startguthaben) – delegiert an Ledger REST
app.post('/accounts', async (req, res) => {
  try {   
    const { userId, initialBalance } = req.body || {};
    if (!userId || initialBalance == null) return res.status(400).json({ error: 'userId & initialBalance required' });
    const r = await axios.post(`${LEDGER_URL}/accounts`, { userId, initialBalance }, { timeout: 5000 });
    res.status(201).json(r.data);
  } catch (e) {   
    console.error('Error creating account:', e.message);
    res.status(e.response?.status || 500).json(e.response?.data || { error: 'creation failed' });
  }
});


// Kontostand abfragen – delegiert an Ledger REST
app.get('/accounts/:id', async (req, res) => {
  try {   
    const r = await axios.get(`${LEDGER_URL}/accounts/${req.params.id}`);
    res.json(r.data);
  } catch (e) {   
    console.error('Error fetching account:', e.message);
    res.status(e.response?.status || 500).json(e.response?.data || { error: 'lookup failed' });
  }
});


// Transfer einleiten – publiziert Command auf Kafka
app.post('/transfers', async (req, res) => {
  try {   
    const { fromAccountId, toAccountId, amount, idempotencyKey } = req.body || {};
    if (!fromAccountId || !toAccountId || amount == null) {
      return res.status(400).json({ error: 'fromAccountId, toAccountId, amount required' });
    }
    const transferId = idempotencyKey || randomUUID();
    await producer.send({
      topic: TOPIC_CMD,
      messages: [{ key: transferId, value: JSON.stringify({ transferId, fromAccountId, toAccountId, amount }) }]
    });
    res.status(202).json({ transferId, statusUrl: `/transfers/${transferId}` });
  } catch (e) {   
    console.error('Error sending transfer command:', e.message);
    res.status(500).json({ error: 'transfer failed' });
  }
});


// Transferstatus – fragt Ledger REST ab
app.get('/transfers/:id', async (req, res) => {
try {
const r = await axios.get(`${LEDGER_URL}/transfers/${req.params.id}`);
res.json(r.data);
} catch (e) {
res.status(e.response?.status || 500).json(e.response?.data || { error: 'lookup failed' });
}
});

// --- Alle Nutzer abfragen (delegiert an Ledger REST) ---
app.get('/users', async (req, res) => {
  try {
    const r = await axios.get(`${LEDGER_URL}/users`);
    res.json(r.data);
  } catch (e) {
    res.status(e.response?.status || 500).json(e.response?.data || { error: 'lookup failed' });
  }
});

// Bootstrap
(async () => {
  try {
    await ensureTopics();
    try {
      await producer.connect(); // <<< absichern
    } catch (err) {
      console.error('Kafka producer connect failed:', err.message);
      process.exit(1); // ohne Producer bringt Transfers nichts
    }

    app.listen(PORT, '0.0.0.0', () => console.log(`api-svc listening on :${PORT}`));
  } catch (err) {
    console.error('Startup error', err);
    process.exit(1);
  }
})();
