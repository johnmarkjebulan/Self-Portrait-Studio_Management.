const router = require('express').Router();
const { authenticate, requireStaffOrAdmin } = require('../middleware/auth');
const { getDateAvailability, getMonthAvailability } = require('../utils/availability');

// Availability contains aggregate counts only; authentication prevents anonymous scraping.
// ADMIN/STAFF-ONLY API. Client-specific routes are reserved for Ryan Joy.

router.get('/', authenticate, requireStaffOrAdmin, async (req, res, next) => {
  try {
    if (req.query.date) {
      const excludeAppointmentId = req.user.role === 'admin' ? (req.query.exclude_appointment_id || null) : null;
      return res.json({ availability: await getDateAvailability(req.query.date, { excludeAppointmentId }) });
    }
    if (req.query.month) {
      return res.json({ availability: await getMonthAvailability(req.query.month) });
    }
    return res.status(400).json({ error: 'Provide date=YYYY-MM-DD or month=YYYY-MM' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
