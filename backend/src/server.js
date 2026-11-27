require('dotenv').config();
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createRequestLimiters } = require('./utils/requestLimits');
const { sequelize } = require('./models');
const routes = require('./routes');
const { autoCompleteDueSessions } = require('./services/appointmentLifecycle');
const { isTrustedDevelopmentLanOrigin } = require('./utils/lanOrigin');
const { serverHost } = require('./utils/serverHost');

const app = express();
const PORT = Number(process.env.PORT || 5000);

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('REPLACE_') || process.env.JWT_SECRET.length < 32) {
  console.error('Missing/placeholder JWT_SECRET. Run START-POSE-AND-PICS.cmd to create a private one, or set a random secret (32+ characters) in backend/.env.');
  process.exit(1);
}

const production = process.env.NODE_ENV === 'production';
const allowedOrigins = [process.env.FRONTEND_URL || (production ? '' : 'http://localhost:5173'), process.env.RENDER_EXTERNAL_URL || ''].join(',')
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
app.use('/api/auth/register', authLimiter);
// Separate budgets: automatic GET polling must not exhaust the write budget.
app.use('/api', readLimiter);
app.use('/api', writeLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV || 'development', commit: process.env.RENDER_GIT_COMMIT || null }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV || 'development', commit: process.env.RENDER_GIT_COMMIT || null }));
app.use('/api', routes);
app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));

// Same-origin production hosting. Never serve private uploads as static files.
if (production) {
  const dist = path.resolve(__dirname, '../../frontend/dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    throw new Error('Frontend build missing. Run npm run build before starting production.');
  }
  const pageSecurity = helmet({
    crossOriginResourcePolicy: { policy: 'same-origin' },
    contentSecurityPolicy: { directives: {
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      frameSrc: ['https://www.google.com'],
    } },
  });
  app.use(pageSecurity);
  app.use(express.static(dist, { index: false, dotfiles: 'deny' }));
  app.get('*', (req, res, next) => {
    if (path.extname(req.path) || !req.accepts('html')) return next();
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
}


app.use((err, req, res, next) => {
  const status = err.status || (err.message === 'Origin not allowed by CORS' ? 403 : 500);
  if (status >= 500) console.error(err);
  else if (process.env.NODE_ENV !== 'production') console.warn(`HTTP ${status}: ${err.message}`);
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
    // Local phones use Vite's proxy; Render accepts connections through its managed proxy.
    const host = serverHost();
    const httpServer = app.listen(PORT, host, () => console.log(`Pose and Pics Photography Studio API → http://${host}:${PORT}`));
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
