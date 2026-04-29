'use strict';

require('dotenv').config();

const express    = require('express');
const app        = express();
const pool       = require('./db/pool');
const leadsRoute = require('./server/routes/leads');
const { startTimeoutCron } = require('./server/services/timeoutService');

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(express.json());

// Basic security headers (no extra package required)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/api/leads', leadsRoute);

// Health check — useful for Docker / reverse-proxy readiness probes
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(err.statusCode ?? 500).json({
    error: err.message ?? 'Internal server error',
    code:  err.code,
  });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function start() {
  // Verify DB connection before accepting traffic
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[server] SIGTERM received — closing DB pool');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});

start();
