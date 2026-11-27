const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, ActivityLog, sequelize } = require('../../models');
const { authenticate } = require('../../middleware/auth');

const rateLimit = require('express-rate-limit');
const { sessionVersion, issueReset, verifyReset, matchesVersion } = require('../../utils/passwordReset');
const { resetConfig, sendResetEmail } = require('../../services/passwordResetMail');
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many password recovery requests. Try again in 15 minutes.' } });

const sign = (user) => jwt.sign(
  { id: user.id, name: user.name, email: user.email, role: user.role, version: sessionVersion(user.password_hash) },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizeName = (name) => String(name || '').trim().replace(/\s+/g, ' ').slice(0, 150);
const isGmail = (email) => /^[a-z0-9._%+-]+@gmail\.com$/i.test(email);

router.post('/register', async (req, res, next) => {
  try {
    const name = normalizeName(req.body.name);
    const email = normalizeEmail(req.body.email);
    const mobile = String(req.body.mobile || '').trim().slice(0, 20) || null;
    const password = String(req.body.password || '');
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, Gmail address, and password are required' });
    if (!isGmail(email)) return res.status(400).json({ error: 'Please use a valid Gmail address (example@gmail.com).' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (await User.findOne({ where: { email } })) return res.status(409).json({ error: 'Email already registered' });

    const user = await User.create({
      name,
      email,
      mobile,
      password_hash: await bcrypt.hash(password, 12),
      role: 'client',
    });
    await ActivityLog.create({
      user_id: user.id, user_name: user.name, action: 'CLIENT_REGISTER',
      description: `New client registration: ${email}`,
      entity_type: 'auth', entity_id: user.id, ip_address: req.ip,
    });
    // No outbound email service or inbox verification. Login remains a separate step.
    res.status(201).json({ success: true, message: 'Account created. Please log in to continue.' });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') err.status = 409;
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const user = await User.findOne({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
    if (user.is_active === false) return res.status(403).json({ error: 'This account has been disabled. Please contact the studio owner.' });
    const loginAction = user.role === 'admin' ? 'ADMIN_LOGIN' : user.role === 'staff' ? 'STAFF_LOGIN' : 'CLIENT_LOGIN';
    await ActivityLog.create({ user_id: user.id, user_name: user.name, action: loginAction, description: `${user.role} logged in`, entity_type: 'auth', entity_id: user.id, ip_address: req.ip });
    const { password_hash: _, ...safe } = user.toJSON();
    res.json({ user: safe, token: sign(user) });
  } catch (err) { next(err); }
});

// No account discovery or reset tokens are exposed to the caller.
router.post('/forgot-password', resetLimiter, async (req, res, next) => {
  try {
    const config = resetConfig();
    if (!config) return res.status(503).json({ error: 'Email password recovery is not configured. Please contact the studio.' });
    const email = normalizeEmail(req.body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return res.status(400).json({ error: 'Enter a valid email address.' });
    const user = await User.findOne({ where: { email } });
    if (user?.is_active) {
      const token = issueReset(user);
      // Do not return provider success or failure to the caller; avoid account enumeration.
      sendResetEmail(user, token, config).catch(err => console.error('Password reset delivery failed:', err.message));
    }
    res.json({ message: 'If an active account matches this email, a reset link will be sent. Check your inbox and spam folder.' });
  } catch (err) { next(err); }
});
router.post('/reset-password', resetLimiter, async (req, res, next) => {
  const token = String(req.body.token || '');
  const password = String(req.body.password || '');
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: 'Use at least 8 characters and no more than 72 bytes.' });
  let data;
  try { data = verifyReset(token); } catch { return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' }); }
  try {
    const changed = await sequelize.transaction(async transaction => {
      const user = await User.findByPk(data.sub, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user?.is_active || !matchesVersion(data, user)) return false;
      await user.update({ password_hash: await bcrypt.hash(password, 12) }, { transaction });
      return true;
    });
    if (!changed) return res.status(400).json({ error: 'This reset link has expired or was already used. Request a new one.' });
    res.json({ success: true, message: 'Password updated. Please sign in again.' });
  } catch (err) { next(err); }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: { exclude: ['password_hash'] } });
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    res.json({ user });
  } catch (err) { next(err); }
});

router.patch('/profile', authenticate, async (req, res, next) => {
  try {
    const data = {};
    if (req.body.name !== undefined) {
      data.name = normalizeName(req.body.name);
      if (!data.name) return res.status(400).json({ error: 'Name is required' });
    }
    if (req.body.mobile !== undefined) data.mobile = String(req.body.mobile || '').trim().slice(0, 20) || null;
    if (!Object.keys(data).length) return res.status(400).json({ error: 'No valid profile changes supplied' });
    await User.update(data, { where: { id: req.user.id } });
    const user = await User.findByPk(req.user.id, { attributes: { exclude: ['password_hash'] } });
    res.json({ user });
  } catch (err) { next(err); }
});

router.patch('/password', authenticate, async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    const user = await User.findByPk(req.user.id);
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) return res.status(400).json({ error: 'Current password is incorrect' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    if (currentPassword === newPassword) return res.status(400).json({ error: 'New password must be different from the current password' });
    await user.update({ password_hash: await bcrypt.hash(newPassword, 12) });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
