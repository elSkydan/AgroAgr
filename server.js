'use strict';

const path = require('path');

const originalResolve = path.resolve;

path.resolve = function (...args) {
  if (args.includes(null) || args.includes(undefined)) {
    console.error('💥 NULL PATH DETECTED:', args);
  }
  return originalResolve.apply(this, args);
};

require('dotenv').config();

const express    = require('express');
const app        = express();
const pool       = require('./db/pool');

const leadsRoute    = require('./server/routes/leads');
const workersRoute  = require('./server/routes/workers');
const citiesRoute   = require('./server/routes/cities');
const telegramRoute = require('./server/routes/telegram');
const { startTimeoutCron } = require('./server/services/timeoutService');

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (CORS_ORIGIN === '*' || origin === CORS_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(express.json());

// Раздаем все файлы из корня (index.html, стили, скрипты)
//app.use(express.static(path.join(__dirname, '/')));
//app.use(express.static(path.resolve(__dirname)));
app.use(express.static(__dirname));
// Маршрут для главной страницы
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/api/leads',    leadsRoute);
app.use('/api/workers',  workersRoute);
app.use('/api/cities',   citiesRoute);
app.use('/api/telegram', telegramRoute);

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

// ---------------------------------------------------------------------------
// Error handlers
// ---------------------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(err.statusCode ?? 500).json({
    error: err.message ?? 'Internal server error',
  });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('[db] Connected');
  } catch (err) {
    console.error('[db] Connection failed:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}`);
  });

  startTimeoutCron();
}

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});

start();
