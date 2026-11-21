require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createRequestLimiters } = require('./utils/requestLimits');
const { sequelize } = require('./models');
const routes = require('./routes');
const { autoCompleteDueSessions } = require('./services/appointmentLifecycle');
const { isTrustedDevelopmentLanOrigin } = require('./utils/lanOrigin');

const app = express();
const PORT = Number(process.env.PORT || 5000);

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('REPLACE_') || process.env.JWT_SECRET.length < 32) {
  console.error('Missing/placeholder JWT_SECRET. Run START-POSE-AND-PICS.cmd to create a private one, or set a random secret (32+ characters) in backend/.env.');
  process.exit(1);
}

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

// Do not trust unverified X-Forwarded-For headers from local/LAN clients.
// Set TRUST_PROXY=true only behind a reverse proxy you control.
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || isTrustedDevelopmentLanOrigin(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const { authLimiter, readLimiter, writeLimiter } = createRequestLimiters(rateLimit);
app.use('/api/auth/login', authLimiter);
// Separate budgets: automatic GET polling must not exhaust the write budget.
app.use('/api', readLimiter);
app.use('/api', writeLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' }));
app.use('/api', routes);

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || (err.message === 'Origin not allowed by CORS' ? 403 : 500);
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : (err.message || 'Internal server error');
  res.status(status).json({ error: message });
});

sequelize.authenticate()
  .then(async () => {
    console.log('Database connected.');
    if (process.env.DB_AUTO_SYNC === 'true') {
      await sequelize.sync();
      console.log('Database schema sync complete.');
    }
    await autoCompleteDueSessions().catch((err) => console.error('Initial session lifecycle check failed (run npm run db:init if just upgraded):', err.message));
    setInterval(() => {
      autoCompleteDueSessions().catch((err) => console.error('Session lifecycle check failed:', err.message));
    }, 30 * 1000).unref();
    // Local-only backend: phones access /api through the Wi-Fi-bound Vite proxy.
    const httpServer = app.listen(PORT, '127.0.0.1', () => console.log(`Pose and Pics Photography Studio API → http://127.0.0.1:${PORT}`));
    httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\nPort ${PORT} is already in use. Another backend may already be running.`);
        console.error(`Windows PowerShell: Get-NetTCPConnection -LocalPort ${PORT} -State Listen | Select-Object OwningProcess`);
        console.error('Use the existing server if it is this project, or stop only that old Node.js process before restarting.\n');
      } else {
        console.error('HTTP server startup failed:', err);
      }
      process.exitCode = 1;
      sequelize.close().catch(() => {}).finally(() => process.exit(1));
    });
  })
  .catch((err) => {
    console.error('DB connection failed:', err);
    process.exit(1);
  });

module.exports = app;
