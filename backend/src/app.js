const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const { query } = require('./config/db');
const ml = require('./services/mlClient');
const { notFoundHandler, errorHandler } = require('./middleware/error');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.corsOrigin.split(',').map((s) => s.trim()), credentials: true }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', async (req, res) => {
  let db = false;
  try { await query('SELECT 1'); db = true; } catch { /* reported below */ }
  const mlUp = await ml.health();
  res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', db, ml_service: mlUp });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/chat', require('./routes/chat'));

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
