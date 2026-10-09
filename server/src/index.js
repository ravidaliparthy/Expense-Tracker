'use strict';
const cluster = require('cluster');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { getDb } = require('./db');

const PORT = Number(process.env.PORT) || 3001; // 3001: 3000 often occupied by other local apps
const WORKERS = Number(process.env.WORKERS) || 1; // set >1 to fork one process per core

/* ------------------------------------------------------------------ */
/* Per-IP fixed-window rate limiter (fairness under load, zero deps).  */
/* ------------------------------------------------------------------ */
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN) || 5000;
const rateBuckets = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  // Don't throttle localhost development requests
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost') {
    return next();
  }
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 60000 };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_PER_MIN));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, RATE_LIMIT_PER_MIN - bucket.count)));
  if (bucket.count > RATE_LIMIT_PER_MIN) {
    return res.status(429).json({ error: 'Too many requests — please slow down.' });
  }
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of rateBuckets) if (now >= b.resetAt) rateBuckets.delete(ip);
}, 60000).unref();

/* ------------------------------------------------------------------ */
/* Multi-process mode: WAL SQLite + Node cluster = scales across cores.*/
/* ------------------------------------------------------------------ */
if (require.main === module) {
  if (WORKERS > 1 && cluster.isPrimary) {
    console.log(`✔ Forking ${WORKERS} API workers`);
    for (let i = 0; i < WORKERS; i++) cluster.fork();
    cluster.on('exit', (worker, code) => {
      console.error(`worker ${worker.process.pid} exited (${code}) — respawning`);
      cluster.fork();
    });
  } else {
    startServer();
  }
}

function createApp() {
  const app = express();
  app.set('trust proxy', 1);                          // real client IPs behind nginx/LB
  app.use(helmet());
  const DEFAULT_ALLOWED_ORIGINS = [
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    'https://expense-tracker-ochre-eight-80.vercel.app',
  ];
  const corsOrigin = process.env.CORS_ORIGIN;
  const allowedOrigins = corsOrigin && corsOrigin !== '*'
    ? corsOrigin.split(',').map((s) => s.trim())
    : DEFAULT_ALLOWED_ORIGINS;

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || corsOrigin === '*' || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));

  // Correlation ID & Structured Logging Middleware
  app.use((req, res, next) => {
    const start = Date.now();
    const reqId = req.headers['x-request-id'] || require('crypto').randomUUID();
    req.id = reqId;
    res.setHeader('X-Request-Id', reqId);
    res.on('finish', () => {
      const ms = Date.now() - start;
      if (req.path !== '/api/health') {
        console.log(`[${new Date().toISOString()}] [${reqId.slice(0, 8)}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
      }
    });
    next();
  });

  app.use('/api', rateLimit);

  app.get('/api/health', (_req, res) => res.json({ ok: true, db: 'sqlite', ts: Date.now() }));

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/categories', require('./routes/categories'));
  app.use('/api/expenses', require('./routes/expenses').router);
  app.use('/api/budgets', require('./routes/budgets'));
  app.use('/api/analytics', require('./routes/analytics'));
  app.use('/api/export', require('./routes/export'));
  app.use('/api/sync', require('./routes/sync'));

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) {
      console.error(`[ERROR] [${req.id ? req.id.slice(0, 8) : 'sys'}]`, err.stack || err.message);
    }
    res.status(status).json({
      error: err.message || 'Server error',
      details: err.details,
      requestId: req.id,
    });
  });

  getDb();                                 // create/open DB at boot (runs migrations + indexes)
  return app;
}

async function startServer(port = PORT) {
  const { initDbAsync } = require('./db');
  await initDbAsync();                     // gate incoming requests until cloud sync completes
  const app = createApp();
  const server = app.listen(port, () => {
    console.log(`✔ Expense Tracker API listening on http://localhost:${port} (workers=${WORKERS})`);
  });

  const gracefulShutdown = (signal) => {
    console.log(`✔ Received ${signal}, closing server and SQLite cleanly...`);
    server.close(() => {
      try {
        const { closeDb } = require('./db');
        closeDb();
      } catch (_) {}
      process.exit(0);
    });
    setTimeout(() => {
      try {
        const { closeDb } = require('./db');
        closeDb();
      } catch (_) {}
      process.exit(0);
    }, 1500).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return server;
}

module.exports = { createApp, startServer, PORT };