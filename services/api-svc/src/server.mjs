import express from 'express';
import { Kafka } from 'kafkajs';
import axios from 'axios';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const PORT = process.env.PORT || 3000;
const LEDGER_URL = process.env.LEDGER_URL || 'http://localhost:3001';

// Wichtig: Origin des Web-Frontends (eigener Container/Port)
const WEB_UI_ORIGIN = process.env.WEB_UI_ORIGIN || 'http://localhost:8080';

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'api',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',')
});
const admin = kafka.admin();
const producer = kafka.producer();

const TOPIC_CMD = 'transfers.commands';
const TOPIC_EVT = 'transfers.events';

const AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'dev-secret';

// --- Express App & Middleware ---
const app = express();

// CORS so konfigurieren, dass Cookies zwischen Origins funktionieren
app.use(cors({
  origin: WEB_UI_ORIGIN,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Health
app.get('/health', (_, res) => res.json({ ok: true }));

// --------- Auth Helpers ----------
function getUserFromCookie(req) {
  const token = req.cookies?.auth;
  if (!token) return null;
  try {
    return jwt.verify(token, AUTH_JWT_SECRET);
  } catch {
    return null;
  }
}

// --------- Auth Endpoints (für externes Web-UI) ----------

// Login: prüft beim ledger-svc, setzt HttpOnly-Cookie, liefert JSON (Frontend redirectet selbst)
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username & password required' });
  try {
    const r = await axios.post(`${LEDGER_URL}/auth/verify`, { username, password });
    const { ok, userId, name } = r.data;
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    const token = jwt.sign({ sub: userId, name }, AUTH_JWT_SECRET, { expiresIn: '1d' });
    res.cookie('auth', token, {
      httpOnly: true,
      sameSite: 'lax',   // für localhost ausreichend
      maxAge: 24 * 3600 * 1000,
      path: '/',
    });
    return res.json({ ok: true });
  } catch (e) {
    const status = e.response?.status || 500;
    return res.status(status).json(e.response?.data || { error: 'login failed' });
  }
});

// Wer bin ich?  -> vom Frontend beim Laden abfragen (Guard)
app.get('/auth/me', (req, res) => {
  const user = getUserFromCookie(req);
  if (!user) return res.status(401).json({ ok: false });
  res.json({ ok: true, user: { id: user.sub, name: user.name } });
});

// Logout: Cookie löschen, JSON zurückgeben
app.post('/auth/logout', (_req, res) => {
  res.clearCookie('auth', { path: '/' });
  res.json({ ok: true });
});

// --------- Business Endpoints ----------

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

// Konto anlegen (delegiert an Ledger REST)
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

// Alle Nutzer – delegiert an Ledger REST
app.get('/users', async (_req, res) => {
  try {
    const r = await axios.get(`${LEDGER_URL}/users`);
    res.json(r.data);
  } catch (e) {
    res.status(e.response?.status || 500).json(e.response?.data || { error: 'lookup failed' });
  }
});

// --------- Kafka Bootstrap ----------
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

// --------- Start ----------
(async () => {
  try {
    await ensureTopics();
    try {
      await producer.connect();
    } catch (err) {
      console.error('Kafka producer connect failed:', err.message);
      process.exit(1);
    }
    app.listen(PORT, '0.0.0.0', () => console.log(`api-svc listening on :${PORT}`));
  } catch (err) {
    console.error('Startup error', err);
    process.exit(1);
  }
})();
