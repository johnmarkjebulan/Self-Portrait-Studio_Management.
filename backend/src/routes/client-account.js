// WBS 3.1.2 — Client-only dashboard and account operations.
// Do not broaden the Admin/Staff routes: every lookup is scoped to req.user.id.
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { User, Appointment, Package, Payment, Notification } = require('../models');
const { authenticate } = require('../middleware/auth');
const { dateKeyInTimeZone } = require('../utils/dateTime');

router.use(authenticate, (req, res, next) => {
  if (req.user?.role !== 'client') {
    return res.status(403).json({ error: 'Client account access required.' });
  }
  return next();
});

const UPCOMING = new Set(['pending', 'confirmed', 'reschedule_requested', 'rescheduled']);
const IN_QUEUE = new Set(['checked_in', 'waiting', 'now_serving']);
const PENDING_PAYMENT = new Set(['payment_required', 'payment_submitted', 'under_verification']);
const INACTIVE = new Set(['cancelled', 'rejected', 'no_show']);

const publicUser = (user) => {
  const data = user.toJSON();
  const { password_hash: _passwordHash, ...safe } = data;
  return safe;
};

function sortedBySession(a, b) {
  return String(a.date || '').localeCompare(String(b.date || '')) ||
    String(a.time || '').localeCompare(String(b.time || ''));
}

router.get('/overview', async (req, res, next) => {
  try {
    const clientId = req.user.id;
    const user = await User.findOne({
      where: { id: clientId, role: 'client', is_active: true },
      attributes: { exclude: ['password_hash'] },
    });
    if (!user) return res.status(401).json({ error: 'Client account is no longer available.' });

    // Only fields used by the Client Dashboard/Profile are selected; Admin-only
    // client details and internal workflow records are never included.
    const [records, spent, unreadNotifications, notifications] = await Promise.all([
      Appointment.findAll({
        where: { client_id: clientId },
        attributes: [
          'id', 'tracking_number', 'date', 'time', 'status', 'payment_status',
          'total_price', 'amount_paid', 'remaining_balance', 'queue_number', 'created_at',
        ],
        include: [{ model: Package, as: 'package', attributes: ['id', 'name'] }],
        order: [['created_at', 'DESC']],
      }),
      Payment.sum('amount', { where: { client_id: clientId, status: 'verified' } }),
      Notification.count({ where: { user_id: clientId, read: false } }),
      Notification.findAll({
        where: { user_id: clientId },
        attributes: ['id', 'title', 'message', 'type', 'read', 'created_at'],
        order: [['created_at', 'DESC']],
        limit: 3,
      }),
    ]);

    const appointments = records.map(record => record.toJSON());
    const today = dateKeyInTimeZone();
    const upcoming = appointments
      .filter(a => UPCOMING.has(a.status) && String(a.date) >= today)
      .sort(sortedBySession);
    const inQueue = appointments.find(a => a.date === today && IN_QUEUE.has(a.status)) || null;
    const paymentReminder = appointments.find(a =>
      a.payment_status === 'payment_required' && !INACTIVE.has(a.status)
    ) || null;

    return res.json({
      user: publicUser(user),
      summary: {
        totalBookings: appointments.length,
        upcomingBookings: upcoming.length,
        pendingPayments: appointments.filter(a =>
          PENDING_PAYMENT.has(a.payment_status) && !INACTIVE.has(a.status)
        ).length,
        completed: appointments.filter(a => a.status === 'completed').length,
        cancelled: appointments.filter(a => a.status === 'cancelled').length,
        totalSpent: Number(spent || 0),
        unreadNotifications: Number(unreadNotifications || 0),
      },
      nextSession: upcoming[0] || null,
      queueSession: inQueue,
      paymentReminder,
      recentBookings: appointments.slice(0, 4),
      recentNotifications: notifications.map(n => n.toJSON()),
    });
  } catch (err) { return next(err); }
});

router.patch('/profile', async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Valid profile data is required.' });
    }
    if (Object.keys(body).some(key => !['name', 'mobile'].includes(key))) {
      return res.status(400).json({ error: 'Only name and mobile number can be updated.' });
    }

    const changes = {};
    if (body.name !== undefined) {
      if (typeof body.name !== 'string') return res.status(400).json({ error: 'Full name must be text.' });
      const normalized = body.name.trim().replace(/\s+/g, ' ');
      if (!normalized || normalized.length > 150) {
        return res.status(400).json({ error: 'Full name is required (maximum 150 characters).' });
      }
      changes.name = normalized;
    }
    if (body.mobile !== undefined) {
      if (typeof body.mobile !== 'string') return res.status(400).json({ error: 'Mobile number must be text.' });
      const mobile = body.mobile.replace(/\s/g, '');
      if (mobile && !/^09\d{9}$/.test(mobile)) {
        return res.status(400).json({ error: 'Enter a valid Philippine mobile number (09XXXXXXXXX).' });
      }
      changes.mobile = mobile || null;
    }
    if (!Object.keys(changes).length) {
      return res.status(400).json({ error: 'No profile changes supplied.' });
    }

    const user = await User.findOne({ where: { id: req.user.id, role: 'client', is_active: true } });
    if (!user) return res.status(401).json({ error: 'Client account is no longer available.' });
    await user.update(changes);
    return res.json({ user: publicUser(user) });
  } catch (err) { return next(err); }
});

router.patch('/password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'Current and new passwords are required.' });
    }
    if (newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) {
      return res.status(400).json({ error: 'New password must be at least 8 characters and at most 72 UTF-8 bytes.' });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ error: 'New password must differ from the current password.' });
    }
    const user = await User.findOne({ where: { id: req.user.id, role: 'client', is_active: true } });
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    await user.update({ password_hash: await bcrypt.hash(newPassword, 12) });
    return res.json({ success: true });
  } catch (err) { return next(err); }
});

module.exports = router;
