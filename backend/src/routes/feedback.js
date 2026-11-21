const router = require('express').Router();
const { Feedback, Appointment, User } = require('../models');
const { authenticate, requireStaffOrAdmin } = require('../middleware/auth');
const { notifyAdmins } = require('../utils/notifyAdmins');
const { logActivity } = require('../utils/activityLog');
const SCORE_FIELDS = ['rating', 'booking_experience', 'staff_service', 'studio_experience', 'cleanliness', 'overall_satisfaction'];
function cleanScore(value, required = false) {
  if ((value === undefined || value === null || value === '') && !required) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : undefined;
}

// ADMIN/STAFF-ONLY API. Client-specific routes are reserved for Ryan Joy.

router.get('/', authenticate, requireStaffOrAdmin, async (req, res, next) => {
  try {
    const where = {};
    const feedback = await Feedback.findAll({
      where,
      include: [
        { model: Appointment, as: 'appointment', attributes: ['id', 'tracking_number', 'date', 'time'], required: false },
        { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
      ],
      order: [['created_at', 'DESC']],
    });
    res.json({ feedback });
  } catch (err) { next(err); }
});
router.patch('/:id/reply', authenticate, requireStaffOrAdmin, async (req, res, next) => {
  try {
    const feedback = await Feedback.findByPk(req.params.id);
    if (!feedback) return res.status(404).json({ error: 'Feedback not found' });
    const reply = String(req.body.reply || '').trim().slice(0, 4000);
    if (!reply) return res.status(400).json({ error: 'Reply cannot be empty' });
    await feedback.update({ staff_reply: reply, replied_by: req.user.id, replied_at: new Date() });
    await logActivity(req, 'REPLY_FEEDBACK', 'Replied to client feedback', 'feedback', feedback.id);
    res.json({ feedback });
  } catch (err) { next(err); }
});

module.exports = router;
