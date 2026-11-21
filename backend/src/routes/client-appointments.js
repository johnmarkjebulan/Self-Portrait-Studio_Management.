// WBS 3.3.1 — Client appointment history, signed QR, queue visibility, and requests.
// Admin/Staff appointment management stays on /api/appointments.
const router = require('express').Router();
const { Op } = require('sequelize');
const { sequelize, Appointment, Package, PhotoWorkflow, StudioSettings, Notification } = require('../models');
const { authenticate } = require('../middleware/auth');
const { makeBookingQR, hasVerifiedDownPayment } = require('../utils/bookingQr');
const { dateKeyInTimeZone, hoursUntilAppointment } = require('../utils/dateTime');
const { canClientRequest } = require('../utils/appointmentState');
const { notifyAdmins } = require('../utils/notifyAdmins');

router.use(authenticate, (req, res, next) => {
  if (req.user?.role !== 'client') return res.status(403).json({ error: 'Client account access required.' });
  return next();
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QR_STATUSES = new Set(['confirmed', 'rescheduled', 'checked_in', 'waiting', 'now_serving']);
const QUEUE_INACTIVE = new Set(['completed', 'cancelled', 'rejected', 'no_show']);
const appointmentInclude = [
  { model: Package, as: 'package', attributes: ['id', 'name', 'duration', 'price', 'max_people'] },
  { model: PhotoWorkflow, as: 'photoWorkflow', attributes: ['stage', 'gallery_url'] },
];

function policyFor(appointment, settings) {
  const until = hoursUntilAppointment(appointment.date, appointment.time);
  const cancellationHours = Number(settings?.cancellation_hours ?? 24);
  const rescheduleHours = Number(settings?.reschedule_hours ?? 48);
  return {
    can_cancel: canClientRequest(appointment.status, 'cancellation_requested') && until > cancellationHours,
    can_reschedule: canClientRequest(appointment.status, 'reschedule_requested') && until > rescheduleHours,
    cancellation_hours: cancellationHours,
    reschedule_hours: rescheduleHours,
    no_show_forfeits_downpayment: Boolean(settings?.no_show_forfeits_downpayment ?? true),
  };
}

function publicAppointment(appointment, settings, queueRows = [], today = dateKeyInTimeZone()) {
  const a = typeof appointment.toJSON === 'function' ? appointment.toJSON() : appointment;
  const workflow = a.photoWorkflow || null;
  const packageData = a.package || null;
  const queueNumber = Number(a.queue_number || 0);
  const queueActive = a.date === today && queueNumber > 0 && !QUEUE_INACTIVE.has(a.status);
  const orderedQueue = queueActive ? queueRows
    .filter(row => !QUEUE_INACTIVE.has(row.status) && Number(row.queue_number) > 0)
    .sort((left, right) => Number(left.queue_number) - Number(right.queue_number)) : [];
  const nowServing = orderedQueue.find(row => row.status === 'now_serving');
  const ahead = queueActive ? orderedQueue.filter(row => Number(row.queue_number) < queueNumber).length : 0;
  return {
    id: a.id,
    tracking_number: a.tracking_number,
    package_id: a.package_id,
    package: packageData ? {
      id: packageData.id, name: packageData.name, duration: packageData.duration,
      price: Number(packageData.price || 0), max_people: packageData.max_people,
    } : null,
    date: a.date,
    time: a.time,
    num_people: a.num_people,
    addon_ids: a.addon_ids || [],
    special_requests: a.special_requests,
    total_price: a.total_price,
    down_payment: a.down_payment,
    amount_paid: a.amount_paid,
    remaining_balance: a.remaining_balance,
    payment_status: a.payment_status,
    status: a.status,
    cancellation_reason: a.cancellation_reason,
    reschedule_reason: a.reschedule_reason,
    created_at: a.created_at,
    updated_at: a.updated_at,
    queue_number: a.queue_number,
    queue: queueActive ? {
      queueNumber: a.queue_number,
      nowServingNum: nowServing ? nowServing.queue_number : null,
      isNowServing: a.status === 'now_serving',
      ahead,
    } : null,
    photoWorkflow: workflow ? {
      stage: workflow.stage,
      gallery_url: workflow.stage === 'released' ? workflow.gallery_url : null,
    } : null,
    // Never disclose an unconfirmed/unpaid QR to the Client.
    qr_payload: QR_STATUSES.has(a.status) && hasVerifiedDownPayment(a) ? makeBookingQR(a) : null,
    request_policy: policyFor(a, settings),
  };
}

async function getSafeContext(clientId, appointmentId = null) {
  const settings = await StudioSettings.findByPk(1);
  const where = { client_id: clientId };
  if (appointmentId !== null) where.id = appointmentId;
  const rows = await Appointment.findAll({
    where, include: appointmentInclude,
    order: [['created_at', 'DESC']],
    ...(appointmentId === null ? {} : { limit: 1 }),
  });
  const today = dateKeyInTimeZone();
  const queueRows = rows.some(row => row.date === today && row.queue_number)
    ? await Appointment.findAll({
      where: { date: today, queue_number: { [Op.ne]: null } },
      attributes: ['queue_number', 'status'],
      order: [['queue_number', 'ASC']],
    }) : [];
  return { rows, settings, queueRows, today };
}

router.get('/', async (req, res, next) => {
  try {
    const { rows, settings, queueRows, today } = await getSafeContext(req.user.id);
    res.set('Cache-Control', 'private, no-store');
    return res.json({ appointments: rows.map(row => publicAppointment(row, settings, queueRows, today)) });
  } catch (err) { return next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Booking not found.' });
    const { rows, settings, queueRows, today } = await getSafeContext(req.user.id, req.params.id);
    if (!rows.length) return res.status(404).json({ error: 'Booking not found.' });
    res.set('Cache-Control', 'private, no-store');
    return res.json({ appointment: publicAppointment(rows[0], settings, queueRows, today) });
  } catch (err) { return next(err); }
});

async function submitRequest(req, res, next, action) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => k !== 'reason') ||
      typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 1000) {
    return res.status(400).json({ error: 'A reason is required (maximum 1000 characters).' });
  }
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Booking not found.' });
  const status = action === 'cancel' ? 'cancellation_requested' : 'reschedule_requested';
  const column = action === 'cancel' ? 'cancellation_reason' : 'reschedule_reason';
  try {
    const result = await sequelize.transaction(async transaction => {
      const appt = await Appointment.findOne({
        where: { id: req.params.id, client_id: req.user.id },
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!appt) return { error: 'Booking not found.', code: 404 };
      const settings = await StudioSettings.findByPk(1, { transaction });
      if (!settings) return { error: 'Studio policies are unavailable. Please contact the studio.', code: 503 };
      const policy = policyFor(appt, settings);
      if (!canClientRequest(appt.status, status)) {
        return { error: 'A request cannot be submitted for this booking status.', code: 409 };
      }
      if (!(action === 'cancel' ? policy.can_cancel : policy.can_reschedule)) {
        return { error: 'The request deadline has passed. Please contact the studio.', code: 409 };
      }
      await appt.update({ status, [column]: body.reason.trim() }, { transaction });
      return { id: appt.id, tracking_number: appt.tracking_number, status: appt.status };
    });
    if (result.error) return res.status(result.code).json({ error: result.error });
    try {
      await Notification.create({
        user_id: req.user.id,
        title: action === 'cancel' ? 'Cancellation requested' : 'Reschedule requested',
        message: `Your ${action === 'cancel' ? 'cancellation' : 'reschedule'} request for ${result.tracking_number} has been submitted for studio review.`,
        type: 'booking', read: false, related_id: result.id, related_type: 'appointment',
      });
      await notifyAdmins('Client booking request', `${req.user.name || 'A client'} submitted a ${action} request for ${result.tracking_number}.`, 'booking', result.id, 'appointment');
    } catch (notifyError) {
      console.error('Client booking request notification failed:', notifyError.message);
    }
    return res.json({ appointment: result });
  } catch (err) { return next(err); }
}

router.post('/:id/request-cancellation', (req, res, next) => submitRequest(req, res, next, 'cancel'));
router.post('/:id/request-reschedule', (req, res, next) => submitRequest(req, res, next, 'reschedule'));

module.exports = router;
