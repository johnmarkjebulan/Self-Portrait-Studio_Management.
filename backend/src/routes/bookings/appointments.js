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
} = require('../../models');
const { authenticate, requireAdmin, requireStaffOrAdmin } = require('../../middleware/auth');
const { parseBookingQR, withClientQR, sessionStartError, hasVerifiedDownPayment } = require('../../utils/bookingQr');
const { notifyAdmins } = require('../../utils/notifyAdmins');
const { dateKeyInTimeZone, hoursUntilAppointment, isValidDateKey, formatStudioTime } = require('../../utils/dateTime');
const { getDateAvailability, assertSlotAvailable } = require('../../utils/availability');
const { canAdminTransition, canClientRequest } = require('../../utils/appointmentState');
const { autoCompleteDueSessions } = require('../../services/appointmentLifecycle');
const { ACTIVE, WAITING, queueSnapshot, startQueueError } = require('../../utils/liveQueue');

// Serialize queue mutations across Admin/Staff devices using the existing settings row.
async function queueTransaction(work) {
  await StudioSettings.findOrCreate({ where: { id: 1 }, defaults: { id: 1 } });
  return sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async transaction => {
    await StudioSettings.findByPk(1, { transaction, lock: transaction.LOCK.UPDATE });
    return work(transaction);
  });
}
async function liveQueueRows(date, transaction) {
  return Appointment.findAll({ where: { date, status: { [Op.in]: ACTIVE } },
    attributes: ['id','date','status','queue_number','queue_entry_at','checked_in_at','time','service_end_at'],
    include: [{ model: Package, as: 'package', attributes: ['duration'] }], transaction });
}
async function assertNextSession(appt, transaction) {
  const error = startQueueError(await liveQueueRows(appt.date, transaction), appt);
  if (error) { const e = new Error(error); e.status = 409; throw e; }
}
async function serializeAppointments(appointments, role) {
  const today = dateKeyInTimeZone();
  const info = role === 'client' && appointments.some(a=>a.date===today && ACTIVE.includes(a.status))
    ? queueSnapshot(await liveQueueRows(today)) : new Map();
  return appointments.map(a => {
    const plain = withClientQR(a, role);
    if (role === 'client') plain.live_queue = info.get(a.id) || null;
    return plain;
  });
}

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
router.get('/', authenticate, async (req, res, next) => {
  try {
    await autoCompleteDueSessions();
    const where = ['admin', 'staff'].includes(req.user.role) ? {} : { client_id: req.user.id };
    if (req.query.date) where.date = req.query.date;
    if (req.query.status) where.status = req.query.status;
    const appointments = await Appointment.findAll({
      where,
      include: appointmentInclude,
      order: [['date', 'DESC'], ['time', 'ASC']],
    });
    res.json({ appointments: await serializeAppointments(appointments, req.user.role) });
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
    res.json({ appointment: (await serializeAppointments([appt], req.user.role))[0] });
  } catch (err) { next(err); }
});

// GET /api/appointments/queue/today — today roster + live queue
router.get('/queue/today', authenticate, requireStaffOrAdmin, async (req, res, next) => {
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
    const result = await queueTransaction(async (transaction) => {
      const appt = await Appointment.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!appt) { const e = new Error('Booking not found.'); e.status = 404; throw e; }
      const error = sessionStartError(appt, dateKeyInTimeZone());
      if (error) { const e = new Error(error); e.status = 409; throw e; }
      await assertNextSession(appt, transaction);
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
    const result = await queueTransaction(async (transaction) => {
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
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    await autoCompleteDueSessions();
    const appt = await Appointment.findByPk(req.params.id, { include: appointmentInclude });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    if (!['admin', 'staff'].includes(req.user.role) && appt.client_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ appointment: (await serializeAppointments([appt], req.user.role))[0] });
  } catch (err) { next(err); }
});

// POST /api/appointments — clients create bookings
router.post('/', authenticate, async (req, res, next) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client account required to create a booking' });

  try {
    const { package_id, date, time, num_people = 1, special_requests = null } = req.body;
    const addonIds = [...new Set(Array.isArray(req.body.addon_ids) ? req.body.addon_ids : [])];
    if (!package_id || !date || !time) {
      return res.status(400).json({ error: 'package_id, date, and time are required' });
    }
    if (!isValidDateKey(date)) return res.status(400).json({ error: 'Invalid appointment date' });

    const created = await sequelize.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE },
      async (transaction) => {
        const settings = await StudioSettings.findByPk(1, { transaction });
        const pkg = await Package.findByPk(package_id, { transaction });
        if (!pkg || !pkg.active) {
          const err = new Error('Package not found or inactive');
          err.status = 404;
          throw err;
        }

        const people = Number(num_people);
        if (!Number.isInteger(people) || people < 1 || people > Number(pkg.max_people)) {
          const err = new Error(`Number of people must be between 1 and ${pkg.max_people}`);
          err.status = 400;
          throw err;
        }

        const addons = addonIds.length
          ? await Addon.findAll({ where: { id: addonIds, active: true }, transaction })
          : [];
        if (addons.length !== addonIds.length) {
          const err = new Error('One or more selected add-ons are invalid or inactive');
          err.status = 400;
          throw err;
        }

        const availability = await getDateAvailability(date, { transaction });
        assertSlotAvailable(availability, time);

        const addonTotal = addons.reduce((sum, addon) => sum + Number(addon.price), 0);
        const totalPrice = Number(pkg.price) + addonTotal;
        const configuredDp = settings?.down_payment_type === 'percentage'
          ? Math.ceil(totalPrice * Number(settings.down_payment_value || 0) / 100)
          : Number(settings?.down_payment_value || 500);
        const downPayment = Math.max(0, Math.min(totalPrice, configuredDp));
        const tracking = await generateTracking(transaction);

        return Appointment.create({
          client_id: req.user.id,
          package_id,
          date,
          time,
          num_people: people,
          special_requests: typeof special_requests === 'string' ? special_requests.trim().slice(0, 2000) : null,
          addon_ids: addonIds,
          tracking_number: tracking,
          total_price: totalPrice,
          down_payment: downPayment,
          remaining_balance: totalPrice,
          amount_paid: 0,
          payment_status: 'payment_required',
          status: 'pending',
        }, { transaction });
      },
    );

    await notify(req.user.id, 'Booking Submitted', `Your booking ${created.tracking_number} has been submitted.`, 'booking', created.id, 'appointment');
    await notifyAdmins('New Booking', `${req.user.name || 'A client'} submitted booking ${created.tracking_number}.`, 'booking', created.id, 'appointment');
    await logActivity(req, 'APPOINTMENT_CREATE', `Created ${created.tracking_number}`, created.id);
    const appt = await Appointment.findByPk(created.id, { include: appointmentInclude });
    // Booking details and QR check-in are available in the client portal.
    res.status(201).json({ appointment: withClientQR(appt, req.user.role) });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') err.status = 409;
    next(err);
  }
});

// PATCH /api/appointments/:id — controlled client requests and admin transitions
router.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const fail = (status, body) => { const error = new Error(body.error); error.status = status; throw error; };
    const result = await queueTransaction(async transaction => {
    const appt = await Appointment.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!appt) return fail(404, { error: 'Appointment not found' });

    let targetStatus = req.body.status;
    const updateData = {};

    const isStaffCheckIn = req.user.role === 'staff' && ['waiting','checked_in'].includes(targetStatus);
    if (req.user.role !== 'admin' && !isStaffCheckIn) {
      if (appt.client_id !== req.user.id) return fail(403, { error: 'Forbidden' });
      if (!canClientRequest(appt.status, targetStatus)) {
        return fail(409, { error: `Cannot request ${String(targetStatus || '').replace(/_/g, ' ')} from ${appt.status.replace(/_/g, ' ')}` });
      }

      const settings = await StudioSettings.findByPk(1, { transaction });
      const hoursRemaining = hoursUntilAppointment(appt.date, appt.time);
      const threshold = targetStatus === 'cancellation_requested'
        ? Number(settings?.cancellation_hours || 24)
        : Number(settings?.reschedule_hours || 48);
      if (hoursRemaining < threshold) {
        return fail(409, {
          error: `${targetStatus === 'cancellation_requested' ? 'Cancellation' : 'Reschedule'} requests must be made at least ${threshold} hours before the appointment.`,
        });
      }

      const reason = targetStatus === 'cancellation_requested'
        ? req.body.cancellation_reason
        : req.body.reschedule_reason;
      if (!String(reason || '').trim()) return fail(400, { error: 'A reason is required' });

      updateData.status = targetStatus;
      if (targetStatus === 'cancellation_requested') updateData.cancellation_reason = String(reason).trim().slice(0, 2000);
      if (targetStatus === 'reschedule_requested') updateData.reschedule_reason = String(reason).trim().slice(0, 2000);
    } else {
      // checked_in is retained in the database for compatibility, but the live workflow
      // goes directly to waiting so Scanner and Queue cannot drift apart.
      if (targetStatus === 'checked_in') targetStatus = 'waiting';
      if (isStaffCheckIn && !['confirmed','rescheduled','checked_in','waiting'].includes(appt.status)) return fail(409, { error: 'Only confirmed bookings can join the queue.' });
      if (targetStatus && !canAdminTransition(appt.status, targetStatus)) {
        return fail(409, { error: `Invalid transition: ${appt.status.replace(/_/g, ' ')} → ${targetStatus.replace(/_/g, ' ')}` });
      }

      if (targetStatus) updateData.status = targetStatus;
      if (!isStaffCheckIn && req.body.special_requests !== undefined) updateData.special_requests = String(req.body.special_requests || '').slice(0, 2000);

      if (targetStatus === 'rescheduled') {
        const newDate = req.body.date;
        const newTime = req.body.time;
        if (!newDate || !newTime) return fail(400, { error: 'New date and time are required for rescheduling' });
        const availability = await getDateAvailability(newDate, { excludeAppointmentId: appt.id, transaction });
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
        if (appt.date !== dateKeyInTimeZone()) return fail(409, { error: 'Only today\'s appointments can be checked in' });
        if (!hasVerifiedDownPayment(appt)) return fail(409, { error: 'Admin must verify the required down payment before check-in.' });
        if (!appt.queue_number) updateData.queue_number = await generateQueueNumber(appt.date, transaction);
        updateData.checked_in_at = appt.checked_in_at || new Date();
        updateData.queue_entry_at = appt.queue_entry_at || new Date();
        updateData.checked_in_by = req.user.id;
        updateData.arrival_time = req.body.arrival_time || appt.arrival_time || null;
      }
      if (targetStatus === 'now_serving') {
        const startError = sessionStartError(appt, dateKeyInTimeZone());
        if (startError) return fail(409, { error: startError });
        await assertNextSession(appt, transaction);
        const startedAt = new Date();
        const pkg = await Package.findByPk(appt.package_id, { attributes: ['duration'], transaction });
        const durationMinutes = Math.max(1, Number(pkg?.duration || 60));
        if (!appt.queue_number) updateData.queue_number = await generateQueueNumber(appt.date, transaction);
        updateData.checked_in_at = appt.checked_in_at || startedAt;
        updateData.queue_entry_at = appt.queue_entry_at || startedAt;
        updateData.checked_in_by = req.user.id;
        updateData.service_start_at = startedAt;
        updateData.service_end_at = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);
      }
      if (targetStatus === 'completed') updateData.service_end_at = new Date();
      // Keep assigned queue numbers on closed bookings to avoid reusing today's numbers.
    }

    if (!Object.keys(updateData).length) return fail(400, { error: 'No valid appointment changes supplied' });
    const previousStatus = appt.status;
    await appt.update(updateData, { transaction });
    return { appt, targetStatus, previousStatus, isStaffCheckIn };
    });
    const { appt, targetStatus, previousStatus, isStaffCheckIn } = result;
    if (targetStatus === 'completed') {
      const [workflow] = await PhotoWorkflow.findOrCreate({ where: { appointment_id: appt.id }, defaults: { stage: 'editing' } });
      if (workflow.stage === 'awaiting_session') await workflow.update({ stage: 'editing', last_updated_by: req.user.id });
    }

    if (req.user.role !== 'admin' && !isStaffCheckIn) {
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
        rescheduled: ['Booking Rescheduled', `Your appointment ${appt.tracking_number} has been rescheduled to ${appt.date} at ${formatStudioTime(appt.time)}.`],
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
    res.json({ appointment: (await serializeAppointments([updated], req.user.role))[0] });
  } catch (err) { next(err); }
});

module.exports = router;
