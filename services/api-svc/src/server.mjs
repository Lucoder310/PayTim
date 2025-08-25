import express from 'express';
import { Kafka } from 'kafkajs';
import axios from 'axios';
import { nanoid } from 'nanoid';
import { randomUUID } from 'node:crypto'; // NEU



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
app.use(express.json());


// Health
app.get('/health', (_, res) => res.json({ ok: true }));


// Benutzer anlegen (delegiert an Ledger REST)
app.post('/users', async (req, res) => {
const { name } = req.body || {};
if (!name) return res.status(400).json({ error: 'name required' });
const r = await axios.post(`${LEDGER_URL}/users`, { name });
res.status(201).json(r.data);
});


// Konto anlegen (mit Startguthaben) – delegiert an Ledger REST
app.post('/accounts', async (req, res) => {
const { userId, initialBalance } = req.body || {};
if (!userId || initialBalance == null) return res.status(400).json({ error: 'userId & initialBalance required' });
const r = await axios.post(`${LEDGER_URL}/accounts`, { userId, initialBalance });
res.status(201).json(r.data);
});


// Kontostand abfragen – delegiert an Ledger REST
app.get('/accounts/:id', async (req, res) => {
const r = await axios.get(`${LEDGER_URL}/accounts/${req.params.id}`);
res.json(r.data);
});


// Transfer einleiten – publiziert Command auf Kafka
app.post('/transfers', async (req, res) => {
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


// Start
(async () => {
await ensureTopics();
await producer.connect();
app.listen(PORT, () => console.log(`api-svc listening on :${PORT}`));
})();