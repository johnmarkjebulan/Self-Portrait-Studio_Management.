const router = require('express').Router();
const { Op, Transaction } = require('sequelize');
const {
  sequelize,
  Appointment,
  BookingScan,
  PhotoWorkflow,
  Package,
  Addon,
  User,
  Notification,
  ActivityLog,
  StudioSettings,
} = require('../models');
const { authenticate, requireAdmin, requireStaffOrAdmin } = require('../middleware/auth');
const { parseBookingQR, withClientQR, sessionStartError } = require('../utils/bookingQr');
const { notifyAdmins } = require('../utils/notifyAdmins');
const { dateKeyInTimeZone, hoursUntilAppointment, isValidDateKey } = require('../utils/dateTime');
const { getDateAvailability, assertSlotAvailable } = require('../utils/availability');
const { canAdminTransition, canClientRequest } = require('../utils/appointmentState');
const { autoCompleteDueSessions } = require('../services/appointmentLifecycle');

async function generateTracking(transaction) {
  const year = Number(dateKeyInTimeZone().slice(0, 4));
  const prefix = `SP-${year}-`;
  const latest = await Appointment.findOne({
    where: { tracking_number: { [Op.like]: `${prefix}%` } },
    order: [['tracking_number', 'DESC']],
    attributes: ['tracking_number'],
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
  const lastNumber = latest ? Number.parseInt(latest.tracking_number.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(lastNumber + 1).padStart(4, '0')}`;
}

async function generateQueueNumber(date, transaction) {
  const maxQueue = await Appointment.max('queue_number', { where: { date }, transaction });
  return (Number(maxQueue) || 0) + 1;
}

async function notify(userId, title, message, type, relatedId, relatedType) {
  try {
    await Notification.create({
      user_id: userId,
      title,
      message,
      type,
      read: false,
      related_id: relatedId,
      related_type: relatedType,
    });
  } catch (err) {
    console.error('Notification creation failed:', err.message);
  }
}

async function logActivity(req, action, description, appointmentId) {
  try {
    await ActivityLog.create({
      user_id: req.user.id,
      user_name: req.user.name,
      action,
      description,
      entity_type: 'appointment',
      entity_id: appointmentId,
      ip_address: req.ip,
    });
  } catch (err) {
    console.error('Activity log creation failed:', err.message);
  }
}

const appointmentInclude = [
  { model: Package, as: 'package', attributes: ['id', 'name', 'duration', 'price', 'max_people'] },
  { model: User, as: 'client', attributes: ['id', 'name', 'email', 'mobile'] },
  { model: PhotoWorkflow, as: 'photoWorkflow', attributes: ['appointment_id', 'assigned_staff_id', 'stage', 'gallery_url', 'internal_notes', 'ready_at', 'released_at', 'updated_at'], include: [{ model: User, as: 'photographer', attributes: ['id', 'name'] }] },
];

// GET /api/appointments — admin: all; client: own
// ADMIN/STAFF-ONLY API. Client-specific routes are reserved for Ryan Joy.

router.get('/', authenticate, requireStaffOrAdmin, async (req, res, next) => {
  try {
    await autoCompleteDueSessions();
    const where = {};
    if (req.query.date) where.date = req.query.date;
    if (req.query.status) where.status = req.query.status;
    const appointments = await Appointment.findAll({
      where,
      include: appointmentInclude,
      order: [['date', 'DESC'], ['time', 'ASC']],
    });
    res.json({ appointments: appointments.map((a) => withClientQR(a, req.user.role)) });
  } catch (err) { next(err); }
});

// GET /api/appointments/tracking/:tn — QR scanner lookup
router.get('/tracking/:tn', authenticate, requireStaffOrAdmin, async (req, res, next) => {
  try {
    await autoCompleteDueSessions();
    const appt = await Appointment.findOne({
      where: { tracking_number: req.params.tn },
      include: appointmentInclude,
    });
    if (!appt) return res.status(404).json({ error: 'Tracking number not found' });
    res.json({ appointment: withClientQR(appt, req.user.role) });
  } catch (err) { next(err); }
});

// GET /api/appointments/queue/today — today roster + live queue
router.get('/queue/today', authenticate, requireAdmin, async (req, res, next) => {
  try {
    await autoCompleteDueSessions();
    const today = dateKeyInTimeZone();
    const queue = await Appointment.findAll({
      where: {
        date: today,
        status: { [Op.in]: ['confirmed', 'rescheduled', 'checked_in', 'waiting', 'now_serving', 'completed'] },
      },
      include: appointmentInclude,
      order: [
        [sequelize.literal("CASE WHEN status = 'now_serving' THEN 0 WHEN queue_number IS NOT NULL THEN 1 ELSE 2 END"), 'ASC'],
        ['queue_number', 'ASC'],
        ['time', 'ASC'],
      ],
    });
    res.json({ queue, date: today });
  } catch (err) { next(err); }
});

// POST /api/appointments/scan — staff/admin validates a signed QR or manually finds a booking.
// Scanning only LOOKS UP. It never changes a booking status.
router.post('/scan', authenticate, requireStaffOrAdmin, async (req, res, next) => {
  try {
    const hasQr = typeof req.body?.qr_payload === 'string';
    let lookup;
    if (hasQr) {
      lookup = parseBookingQR(req.body.qr_payload);
      if (!lookup) return res.status(400).json({ error: 'Invalid or modified booking QR. Ask client to reopen their booking.' });
    } else {
      const tracking = String(req.body?.tracking_number || '').trim().toUpperCase();
      if (!/^SP-\d{4}-\d+$/.test(tracking)) return res.status(400).json({ error: 'Enter a valid booking tracking number.' });
      lookup = { tracking_number: tracking };
    }
    await autoCompleteDueSessions();
    const appt = await Appointment.findOne({ where: lookup, include: appointmentInclude });
    if (!appt) return res.status(404).json({ error: 'Booking not found.' });
    await BookingScan.create({ appointment_id: appt.id, actor_id: req.user.id, method: hasQr ? 'qr' : 'manual', event: 'scanned' });
    res.json({ appointment: appt, method: hasQr ? 'qr' : 'manual' });
  } catch (err) { next(err); }
});

// GET /api/appointments/:id/scan-history — inspect operator, timestamp and result.
router.get('/:id/scan-history', authenticate, requireStaffOrAdmin, async (req, res, next) => {
  try {
    const appt = await Appointment.findByPk(req.params.id, { attributes: ['id'] });
    if (!appt) return res.status(404).json({ error: 'Booking not found.' });
    const scans = await BookingScan.findAll({ where: { appointment_id: appt.id },
      include: [{ model: User, as: 'actor', attributes: ['id', 'name', 'role'] }],
      order: [['created_at', 'DESC']], limit: 30 });
    res.json({ scans });
  } catch (err) { next(err); }
});

// POST /api/appointments/:id/session/start — explicit operator confirmation.
// Row lock prevents double-start from simultaneous Admin/Staff devices.
router.post('/:id/session/start', authenticate, requireStaffOrAdmin, async (req, res, next) => {
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const appt = await Appointment.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!appt) { const e = new Error('Booking not found.'); e.status = 404; throw e; }
      const error = sessionStartError(appt, dateKeyInTimeZone());
      if (error) { const e = new Error(error); e.status = 409; throw e; }
      const startedAt = new Date();
      const pkg = await Package.findByPk(appt.package_id, { transaction, attributes: ['duration'] });
      const durationMinutes = Math.max(1, Number(pkg?.duration || 60));
      const queue = appt.queue_number || await generateQueueNumber(appt.date, transaction);
      await appt.update({
        status: 'now_serving', queue_number: queue,
        checked_in_at: appt.checked_in_at || startedAt,
        queue_entry_at: appt.queue_entry_at || startedAt,
        checked_in_by: req.user.id,
        service_start_at: startedAt,
        service_end_at: new Date(startedAt.getTime() + durationMinutes * 60 * 1000),
      }, { transaction });
      await BookingScan.create({ appointment_id: appt.id, actor_id: req.user.id,
        method: req.body?.method === 'manual' ? 'manual' : 'qr', event: 'session_started' }, { transaction });
      return appt;
    });
    await notify(result.client_id, 'Taking Pictures', `Your photo session ${result.tracking_number} has started.`, 'booking', result.id, 'appointment');
    await notifyAdmins('Photo Session Started', `${req.user.name || 'A team member'} started ${result.tracking_number}.`, 'booking', result.id, 'appointment');
    await logActivity(req, 'SESSION_STARTED', `Started photography session ${result.tracking_number}`, result.id);
    res.json({ appointment: await Appointment.findByPk(result.id, { include: appointmentInclude }) });
  } catch (err) { next(err); }
});

// POST /api/appointments/:id/session/complete — operator finishes early, if needed.
router.post('/:id/session/complete', authenticate, requireStaffOrAdmin, async (req, res, next) => {
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const appt = await Appointment.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!appt) { const e = new Error('Booking not found.'); e.status = 404; throw e; }
      if (appt.status !== 'now_serving') { const e = new Error('Only an ongoing photo session can be completed.'); e.status = 409; throw e; }
      await appt.update({ status: 'completed', service_end_at: new Date() }, { transaction });
      await BookingScan.create({ appointment_id: appt.id, actor_id: req.user.id,
        method: req.body?.method === 'manual' ? 'manual' : 'qr', event: 'session_completed' }, { transaction });
      return appt;
    });
    const [workflow] = await PhotoWorkflow.findOrCreate({ where: { appointment_id: result.id }, defaults: { stage: 'editing' } });
    if (workflow.stage === 'awaiting_session') await workflow.update({ stage: 'editing', last_updated_by: req.user.id });
    await notify(result.client_id, 'Session Completed', `Your photo session ${result.tracking_number} is complete and photos are moving to editing.`, 'booking', result.id, 'appointment');
    await logActivity(req, 'SESSION_COMPLETED', `Completed photography session ${result.tracking_number}`, result.id);
    res.json({ appointment: await Appointment.findByPk(result.id, { include: appointmentInclude }) });
  } catch (err) { next(err); }
});

// GET /api/appointments/:id
router.get('/:id', authenticate, requireStaffOrAdmin, async (req, res, next) => {
  try {
    await autoCompleteDueSessions();
    const appt = await Appointment.findByPk(req.params.id, { include: appointmentInclude });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ appointment: withClientQR(appt, req.user.role) });
  } catch (err) { next(err); }
});

// POST /api/appointments — clients create bookings
router.patch('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const appt = await Appointment.findByPk(req.params.id);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    let targetStatus = req.body.status;
    const updateData = {};

      // checked_in is retained in the database for compatibility, but the live workflow
      // goes directly to waiting so Scanner and Queue cannot drift apart.
      if (targetStatus === 'checked_in') targetStatus = 'waiting';
      if (targetStatus && !canAdminTransition(appt.status, targetStatus)) {
        return res.status(409).json({ error: `Invalid transition: ${appt.status.replace(/_/g, ' ')} → ${targetStatus.replace(/_/g, ' ')}` });
      }

      if (targetStatus) updateData.status = targetStatus;
      if (req.body.special_requests !== undefined) updateData.special_requests = String(req.body.special_requests || '').slice(0, 2000);

      if (targetStatus === 'rescheduled') {
        const newDate = req.body.date;
        const newTime = req.body.time;
        if (!newDate || !newTime) return res.status(400).json({ error: 'New date and time are required for rescheduling' });
        const availability = await getDateAvailability(newDate, { excludeAppointmentId: appt.id });
        assertSlotAvailable(availability, newTime);
        updateData.date = newDate;
        updateData.time = newTime;
        updateData.queue_number = null;
        updateData.checked_in_at = null;
        updateData.queue_entry_at = null;
        updateData.service_start_at = null;
        updateData.service_end_at = null;
        updateData.checked_in_by = null;
      }

      if (targetStatus === 'waiting') {
        if (appt.date !== dateKeyInTimeZone()) return res.status(409).json({ error: 'Only today\'s appointments can be checked in' });
        if (!appt.queue_number) updateData.queue_number = await generateQueueNumber(appt.date);
        updateData.checked_in_at = appt.checked_in_at || new Date();
        updateData.queue_entry_at = appt.queue_entry_at || new Date();
        updateData.checked_in_by = req.user.id;
        updateData.arrival_time = req.body.arrival_time || appt.arrival_time || null;
      }
      if (targetStatus === 'now_serving') {
        const startError = sessionStartError(appt, dateKeyInTimeZone());
        if (startError) return res.status(409).json({ error: startError });
        const startedAt = appt.service_start_at || new Date();
        const pkg = await Package.findByPk(appt.package_id, { attributes: ['duration'] });
        const durationMinutes = Math.max(1, Number(pkg?.duration || 60));
        if (!appt.queue_number) updateData.queue_number = await generateQueueNumber(appt.date);
        updateData.checked_in_at = appt.checked_in_at || startedAt;
        updateData.queue_entry_at = appt.queue_entry_at || startedAt;
        updateData.checked_in_by = req.user.id;
        updateData.service_start_at = startedAt;
        updateData.service_end_at = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);
      }
      if (targetStatus === 'completed') updateData.service_end_at = new Date();
      if (targetStatus === 'cancelled') updateData.queue_number = null;

    if (!Object.keys(updateData).length) return res.status(400).json({ error: 'No valid appointment changes supplied' });
    const previousStatus = appt.status;
    await appt.update(updateData);
    if (targetStatus === 'completed') {
      const [workflow] = await PhotoWorkflow.findOrCreate({ where: { appointment_id: appt.id }, defaults: { stage: 'editing' } });
      if (workflow.stage === 'awaiting_session') await workflow.update({ stage: 'editing', last_updated_by: req.user.id });
    }

    if (req.user.role !== 'admin') {
      const isCancel = targetStatus === 'cancellation_requested';
      await notifyAdmins(
        isCancel ? 'Cancellation Request' : 'Reschedule Request',
        `${req.user.name || 'A client'} requested ${isCancel ? 'cancellation' : 'rescheduling'} for ${appt.tracking_number}.`,
        'booking', appt.id, 'appointment',
      );
    } else if (targetStatus && targetStatus !== previousStatus) {
      const messages = {
        confirmed: ['Booking Confirmed', `Your appointment ${appt.tracking_number} has been confirmed.`],
        cancelled: ['Booking Cancelled', `Your appointment ${appt.tracking_number} has been cancelled.`],
        rejected: ['Booking Rejected', `Your booking ${appt.tracking_number} was not approved.`],
        rescheduled: ['Booking Rescheduled', `Your appointment ${appt.tracking_number} has been rescheduled to ${appt.date} at ${appt.time}.`],
        waiting: ['Checked In', `You are checked in for ${appt.tracking_number}. Queue #${appt.queue_number}.`],
        now_serving: ['Session Ongoing', `Your session ${appt.tracking_number} is now ongoing.`],
        completed: ['Session Completed', `Your session ${appt.tracking_number} has been completed. Thank you!`],
        no_show: ['Appointment Marked No Show', `Appointment ${appt.tracking_number} was marked as no-show.`],
      };
      if (messages[targetStatus]) {
        await notify(appt.client_id, ...messages[targetStatus], targetStatus === 'waiting' || targetStatus === 'now_serving' ? 'queue' : 'booking', appt.id, 'appointment');
      }
    }

    await logActivity(req, 'APPOINTMENT_UPDATE', `Status: ${previousStatus} → ${appt.status}`, appt.id);
    const updated = await Appointment.findByPk(appt.id, { include: appointmentInclude });

    // Status updates are delivered through in-app notifications.
    res.json({ appointment: withClientQR(updated, req.user.role) });
  } catch (err) { next(err); }
});

module.exports = router;
