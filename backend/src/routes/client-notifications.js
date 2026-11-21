// WBS 3.4.1 - Client-specific notifications. No Admin/Staff route changes.
const router = require('express').Router();
const { Notification } = require('../models');
const { authenticate } = require('../middleware/auth');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeNotification = (row) => {
  const n = typeof row.toJSON === 'function' ? row.toJSON() : row;
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    read: Boolean(n.read),
    related_id: n.related_id || null,
    related_type: n.related_type || null,
    created_at: n.created_at,
  };
};

router.use(authenticate, (req, res, next) => {
  if (req.user?.role !== 'client') {
    return res.status(403).json({ error: 'Client account required.' });
  }
  res.set('Cache-Control', 'private, no-store');
  return next();
});

router.get('/', async (req, res, next) => {
  try {
    const raw = req.query?.limit;
    if (raw !== undefined && !/^\d+$/.test(String(raw))) {
      return res.status(400).json({ error: 'Invalid notification limit.' });
    }
    const limit = Math.max(1, Math.min(Number(raw || 60), 100));
    const rows = await Notification.findAll({
      where: { user_id: req.user.id },
      attributes: ['id', 'title', 'message', 'type', 'read', 'related_id', 'related_type', 'created_at'],
      order: [['created_at', 'DESC']],
      limit,
    });
    return res.json({ notifications: rows.map(safeNotification) });
  } catch (err) { return next(err); }
});

router.get('/unread-count', async (req, res, next) => {
  try {
    const count = await Notification.count({ where: { user_id: req.user.id, read: false } });
    return res.json({ count: Number(count) || 0 });
  } catch (err) { return next(err); }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Notification not found.' });
    const [changed] = await Notification.update(
      { read: true },
      { where: { id: req.params.id, user_id: req.user.id } },
    );
    if (!changed) return res.status(404).json({ error: 'Notification not found.' });
    return res.json({ success: true });
  } catch (err) { return next(err); }
});

router.post('/mark-all-read', async (req, res, next) => {
  try {
    const [updated] = await Notification.update(
      { read: true },
      { where: { user_id: req.user.id, read: false } },
    );
    return res.json({ success: true, updated: Number(updated) || 0 });
  } catch (err) { return next(err); }
});

module.exports = router;
