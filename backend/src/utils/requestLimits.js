// Split automated/dashboard reads from sensitive writes and authentication.
// A single 400-request/IP bucket used to lock out all pages when several tabs
// were polling behind the same Vite reverse proxy.
const WINDOW_MS = 15 * 60 * 1000;
const AUTH_FAILED_LIMIT = 30;
const READ_LIMIT = 6000;
const WRITE_LIMIT = 300;

function isReadMethod(method) {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

function createRequestLimiters(rateLimit, environment = process.env.NODE_ENV) {
  const shared = { windowMs: WINDOW_MS, standardHeaders: 'draft-7', legacyHeaders: false };
  const authLimiter = rateLimit({
    ...shared,
    limit: AUTH_FAILED_LIMIT,
    skipSuccessfulRequests: true,
    message: { error: 'Too many unsuccessful login or registration attempts. Please try again later.' },
  });
  const readLimiter = rateLimit({
    ...shared,
    limit: READ_LIMIT,
    // Local development's repeated dashboard refresh should never lock out the
    // client. Production is still rate-limited (at a sustainable read budget).
    skip: (req) => environment !== 'production' || !isReadMethod(req.method),
    message: { error: 'Too many requests. Please wait briefly and retry.' },
  });
  const writeLimiter = rateLimit({
    ...shared,
    limit: WRITE_LIMIT,
    skip: (req) => isReadMethod(req.method),
    message: { error: 'Too many updates in a short period. Please wait and retry.' },
  });
  return { authLimiter, readLimiter, writeLimiter };
}

module.exports = { WINDOW_MS, AUTH_FAILED_LIMIT, READ_LIMIT, WRITE_LIMIT, isReadMethod, createRequestLimiters };
