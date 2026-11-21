// WBS 3.4.2 - Client Feedback and Rating.
// Keeps Admin/Staff /api/feedback operations separate and unchanged.
const router = require('express').Router();
const { Feedback, Appointment } = require('../models');
const { authenticate } = require('../middleware/auth');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCORE_FIELDS = ['rating', 'booking_experience', 'staff_service', 'studio_experience', 'cleanliness'];
const INPUT_FIELDS = new Set([...SCORE_FIELDS, 'appointment_id', 'comment']);
const PUBLIC_FIELDS = [
  'id', 'appointment_id', ...SCORE_FIELDS, 'comment',
  'staff_reply', 'replied_at', 'created_at',
];

const ownFeedback = (row) => {
  const feedback = typeof row.toJSON === 'function' ? row.toJSON() : row;
  const a = feedback.appointment;
  return {
    id: feedback.id,
    appointment_id: feedback.appointment_id || null,
    rating: feedback.rating,
    booking_experience: feedback.booking_experience,
    staff_service: feedback.staff_service,
    studio_experience: feedback.studio_experience,
    cleanliness: feedback.cleanliness,
    comment: feedback.comment || '',
    staff_reply: feedback.staff_reply || null,
    replied_at: feedback.replied_at || null,
    created_at: feedback.created_at,
    appointment: a ? {
      id: a.id, tracking_number: a.tracking_number,
      date: a.date, time: a.time,
    } : null,
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
    const feedback = await Feedback.findAll({
      where: { client_id: req.user.id },
      attributes: PUBLIC_FIELDS,
      include: [{
        model: Appointment, as: 'appointment',
        attributes: ['id', 'tracking_number', 'date', 'time'],
        required: false,
      }],
      order: [['created_at', 'DESC']],
      limit: 100,
    });
    return res.json({ feedback: feedback.map(ownFeedback) });
  } catch (err) { return next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const data = req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'Invalid feedback form.' });
    }
    if (Object.keys(data).some((field) => !INPUT_FIELDS.has(field))) {
      return res.status(400).json({ error: 'Unsupported feedback field.' });
    }

    const scores = {};
    for (const field of SCORE_FIELDS) {
      const value = data[field];
      // No fractional values, arrays, coercible objects or out-of-range scores.
      if (!((typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5) ||
            (typeof value === 'string' && /^[1-5]$/.test(value)))) {
        return res.status(400).json({ error: `Please provide a 1-to-5 rating for ${field.replaceAll('_', ' ')}.` });
      }
      scores[field] = Number(value);
    }

    if (data.comment !== undefined && typeof data.comment !== 'string') {
      return res.status(400).json({ error: 'Feedback comment must be text.' });
    }
    const comment = (data.comment || '').trim();
    if (comment.length > 4000) {
      return res.status(400).json({ error: 'Comments must be 4000 characters or fewer.' });
    }

    const appointmentId = data.appointment_id === null || data.appointment_id === undefined ||
      data.appointment_id === '' ? null : data.appointment_id;
    if (appointmentId !== null) {
      if (typeof appointmentId !== 'string' || !UUID.test(appointmentId)) {
        return res.status(400).json({ error: 'Invalid appointment ID.' });
      }
      const appointment = await Appointment.findOne({
        where: { id: appointmentId, client_id: req.user.id },
        attributes: ['id', 'status'],
      });
      if (!appointment) {
        return res.status(404).json({ error: 'Appointment not found.' });
      }
      if (appointment.status !== 'completed') {
        return res.status(400).json({ error: 'Feedback is available after the photo session is completed.' });
      }
      // The database also has a unique constraint on appointment_id to
      // handle concurrent submissions safely.
      const existing = await Feedback.findOne({ where: { appointment_id: appointmentId } });
      if (existing) {
        return res.status(409).json({ error: 'You have already reviewed this appointment.' });
      }
    } else if (!comment) {
      return res.status(400).json({ error: 'Please enter a comment for general studio feedback.' });
    }

    let saved;
    try {
      saved = await Feedback.create({
        client_id: req.user.id,
        appointment_id: appointmentId,
        ...scores,
        comment: comment || null,
      });
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ error: 'You have already reviewed this appointment.' });
      }
      throw err;
    }
    return res.status(201).json({ feedback: ownFeedback(saved) });
  } catch (err) { return next(err); }
});

module.exports = router;
