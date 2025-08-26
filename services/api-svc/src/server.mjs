import express from 'express';
import { Kafka } from 'kafkajs';
import axios from 'axios';
import { nanoid } from 'nanoid';
import cors from 'cors';
import { randomUUID } from 'node:crypto'; 
import bcrypt from 'bcrypt';
import { pool } from './db.mjs'; 
import jwt from 'jsonwebtoken';


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

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret'; // für token

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

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"
  if (!token) return res.status(401).json({ error: 'Token missing' });

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.userId = payload.userId;
    next();
  });
}



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

// My Account – geschützter Endpunkt
app.get('/my-account', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    // 1. Alle Konten des Users abfragen
    const accountsResp = await axios.get(`${LEDGER_URL}/users/${userId}/accounts`, { timeout: 5000 });
    const accounts = accountsResp.data;

    // 2. Alle Transfers der Konten abrufen (robust)
    const transfersResults = await Promise.allSettled(
      accounts.map(acc => axios.get(`${LEDGER_URL}/accounts/${acc.id}/transfers`, { timeout: 5000 }))
    );

    const transfers = transfersResults
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value.data)
      .flat();

    res.json({ userId, accounts, transfers });
  } catch (err) {
    console.error('My Account error:', err);
    res.status(500).json({ error: 'fetch failed' });
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

// Registrierung mit Passwort + Startkonto
app.post('/register', async (req, res) => {
  try {
    const { name, username, password } = req.body;
    if (!name || !username || !password)
      return res.status(400).json({ error: 'name, username & password required' });

    // Prüfen, ob Username schon existiert
    const exists = await pool.query(`SELECT 1 FROM auth_users WHERE username = $1`, [username]);
    if (exists.rowCount > 0)
      return res.status(400).json({ error: 'username already taken' });

    // User erstellen
    const userId = randomUUID();
    await pool.query(`INSERT INTO users (id, name) VALUES ($1, $2)`, [userId, name]);

    // Passwort hashen
    const passwordHash = await bcrypt.hash(password, 12);

    // Auth User anlegen
    await pool.query(
      `INSERT INTO auth_users (id, user_id, username, password_hash) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), userId, username, passwordHash]
    );

    // Startkonto erstellen
    const initialBalance = 0;
    const accountResp = await axios.post(`${LEDGER_URL}/accounts`, { userId, initialBalance }, { timeout: 5000 });

    res.status(201).json({ 
      message: 'User registered', 
      userId, 
      account: accountResp.data 
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'registration failed' });
  }
});



// Login
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username & password required' });

    const result = await pool.query(`SELECT * FROM auth_users WHERE username = $1`, [username]);
    if (result.rowCount === 0) return res.status(400).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.user_id }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: 'Login successful', token, userId: user.user_id });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'login failed' });
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
