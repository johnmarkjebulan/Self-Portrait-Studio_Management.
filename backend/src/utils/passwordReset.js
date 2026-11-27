const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const key = (purpose, secret = process.env.JWT_SECRET) => crypto.createHmac('sha256', secret).update(purpose).digest();
const sessionVersion = (hash, secret) => crypto.createHmac('sha256', key('pose-session-v1', secret)).update(hash).digest('base64url');
function issueReset(user, secret) {
  return jwt.sign({ sub: String(user.id), purpose: 'password-reset', version: sessionVersion(user.password_hash, secret) }, key('pose-password-reset-v1', secret), { algorithm: 'HS256', expiresIn: '15m', jwtid: crypto.randomUUID() });
}
function verifyReset(token, secret) {
  const data = jwt.verify(token, key('pose-password-reset-v1', secret), { algorithms: ['HS256'] });
  if (data.purpose !== 'password-reset' || typeof data.sub !== 'string') throw new Error('Invalid reset token');
  return data;
}
function matchesVersion(data, user, secret) {
  return data.version === sessionVersion(user.password_hash, secret);
}
module.exports = { sessionVersion, issueReset, verifyReset, matchesVersion };
