const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, ActivityLog } = require('../models');
const { authenticate, requireStaffOrAdmin } = require('../middleware/auth');

const sign = (user) => jwt.sign(
  { id: user.id, name: user.name, email: user.email, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizeName = (name) => String(name || '').trim().replace(/\s+/g, ' ').slice(0, 150);

// The public registration route creates CLIENT accounts only.
// Admin and Staff accounts are created through the existing authorized workflows.
router.post('/register', async (req, res, next) => {
  try {
    const { name: rawName, email: rawEmail, mobile: rawMobile, password } = req.body || {};
    if (typeof rawName !== 'string' || !rawName.trim() || rawName.trim().length > 150) {
      return res.status(400).json({ error: 'Full name is required (maximum 150 characters).' });
    }
    if (typeof rawEmail !== 'string' || rawEmail.length > 200) {
      return res.status(400).json({ error: 'A valid Gmail address is required.' });
    }
    const name = normalizeName(rawName);
    const email = normalizeEmail(rawEmail);
    if (!/^[a-z0-9._%+-]+@gmail\.com$/.test(email)) {
      return res.status(400).json({ error: 'Use a valid Gmail address (example@gmail.com).' });
    }
    const mobile = typeof rawMobile === 'string' ? rawMobile.replace(/\s/g, '') : '';
    if (!/^09\d{9}$/.test(mobile)) {
      return res.status(400).json({ error: 'Enter a valid Philippine mobile number (09XXXXXXXXX).' });
    }
    if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and at most 72 UTF-8 bytes.' });
    }
    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ error: 'This email address is already registered.' });

    // Never accept role, is_active, id, or password_hash from the public request.
    await User.create({
      name,
      email,
      mobile,
      password_hash: await bcrypt.hash(password, 12),
      role: 'client',
      is_active: true,
    });
    return res.status(201).json({ message: 'Account created! Please log in to continue.' });
  } catch (err) {
    // Also handle concurrent signups that race past the pre-insert lookup.
    if (err?.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'This email address is already registered.' });
    }
    return next(err);
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
    if (!['admin', 'staff', 'client'].includes(user.role)) return res.status(403).json({ error: 'Account role is not permitted.' });
    // Preserve the existing Admin/Staff activity-log actions. Client login does
    // not generate an unsupported ADMIN_LOGIN or STAFF_LOGIN event.
    if (user.role === 'admin' || user.role === 'staff') {
      const loginAction = user.role === 'admin' ? 'ADMIN_LOGIN' : 'STAFF_LOGIN';
      await ActivityLog.create({ user_id: user.id, user_name: user.name, action: loginAction, description: `${user.role} logged in`, entity_type: 'auth', entity_id: user.id, ip_address: req.ip });
    }
    const { password_hash: _, ...safe } = user.toJSON();
    res.json({ user: safe, token: sign(user) });
  } catch (err) { next(err); }
});
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: { exclude: ['password_hash'] } });
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    res.json({ user });
  } catch (err) { next(err); }
});
router.patch('/profile', authenticate, requireStaffOrAdmin, async (req, res, next) => {
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
router.patch('/password', authenticate, requireStaffOrAdmin, async (req, res, next) => {
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
