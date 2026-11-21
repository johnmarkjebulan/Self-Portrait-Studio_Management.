// WBS 3.2.1 - Client-only photography service booking.
// Shared Admin/Staff appointment routes and models are intentionally unchanged.
const router = require('express').Router();
const { Op } = require('sequelize');
const {
  sequelize, Appointment, Package, Addon, StudioSettings, Notification,
} = require('../models');
const { authenticate } = require('../middleware/auth');
const { dateKeyInTimeZone, dateTimeInStudioZone, isValidDateKey, isValidTime } = require('../utils/dateTime');
const { getDateAvailability, getMonthAvailability, assertSlotAvailable } = require('../utils/availability');
const { notifyAdmins } = require('../utils/notifyAdmins');

router.use(authenticate, (req, res, next) => {
  if (req.user?.role !== 'client') {
    return res.status(403).json({ error: 'Client account access required.' });
  }
  return next();
});

// Read-only availability for the Client booking calendar.
// Excludes private appointment records and does not accept an exclusion ID.
router.get('/availability', async (req, res, next) => {
  try {
    if (typeof req.query?.date === 'string' && req.query.date) {
      return res.json({ availability: await getDateAvailability(req.query.date) });
    }
    if (typeof req.query?.month === 'string' && req.query.month) {
      return res.json({ availability: await getMonthAvailability(req.query.month) });
    }
    return res.status(400).json({ error: 'Provide a date or month to check availability.' });
  } catch (err) { return next(err); }
});

function moneyCents(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10000000) {
    throw Object.assign(new Error('Invalid price configuration.'), { status: 500 });
  }
  return Math.round(numeric * 100);
}

function validationError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function validateBooking(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw validationError('Booking details are required.');
  const allowed = new Set(['package_id', 'date', 'time', 'num_people', 'special_requests', 'addon_ids']);
  if (Object.keys(body).some(field => !allowed.has(field))) {
    throw validationError('Booking contains unsupported fields. Client ID and prices are assigned by the server.');
  }
  const { package_id: packageId, date, time, num_people: numPeople, addon_ids: addonIds = [] } = body;
  if (typeof packageId !== 'string' || !/^[0-9a-f-]{36}$/i.test(packageId)) throw validationError('Select a valid package.');
  if (typeof date !== 'string' || !isValidDateKey(date)) throw validationError('Select a valid booking date.');
  if (typeof time !== 'string' || !isValidTime(time)) throw validationError('Select a valid booking time.');
  if (date < dateKeyInTimeZone()) throw validationError('Please select a future booking date.', 409);
  if (dateTimeInStudioZone(date, time).getTime() <= Date.now()) throw validationError('Please choose a future time slot.', 409);
  if (!Number.isInteger(numPeople) || numPeople < 1) throw validationError('Number of people must be a positive whole number.');
  if (!Array.isArray(addonIds) || addonIds.length > 20 || addonIds.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) {
    throw validationError('Select valid add-ons (up to 20).');
  }
  if (new Set(addonIds).size !== addonIds.length) throw validationError('Duplicate add-ons are not allowed.');
  const special = body.special_requests === undefined ? '' : body.special_requests;
  if (typeof special !== 'string' || special.trim().length > 1000) throw validationError('Special requests must be at most 1000 characters.');
  return { packageId, date, time, numPeople, addonIds, special: special.trim() };
}

async function nextTrackingNumber(transaction) {
  const prefix = `SP-${dateKeyInTimeZone().slice(0, 4)}-`;
  const latest = await Appointment.findOne({
    where: { tracking_number: { [Op.like]: `${prefix}%` } },
    attributes: ['tracking_number'],
    order: [['tracking_number', 'DESC']],
    transaction,
  });
  const previous = latest ? Number.parseInt(String(latest.tracking_number).slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(previous + 1).padStart(4, '0')}`;
}

router.post('/', async (req, res, next) => {
  let input;
  try { input = validateBooking(req.body); }
  catch (err) { return res.status(err.status || 400).json({ error: err.message }); }

  try {
    // Serializes Client booking writes against the studio-settings row so concurrent
    // Clients cannot both consume the last available slot. Requires InnoDB tables.
    const saved = await sequelize.transaction(async (transaction) => {
      const settings = await StudioSettings.findByPk(1, {
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!settings) throw validationError('Studio settings are unavailable. Contact the studio.', 503);

      const pkg = await Package.findOne({
        where: { id: input.packageId, active: true },
        transaction,
      });
      if (!pkg) throw validationError('The selected package is no longer available.', 404);
      if (input.numPeople > Number(pkg.max_people || 1)) {
        throw validationError(`This package allows at most ${pkg.max_people} people.`);
      }

      const addons = input.addonIds.length ? await Addon.findAll({
        where: { id: { [Op.in]: input.addonIds }, active: true },
        transaction,
      }) : [];
      if (addons.length !== input.addonIds.length) throw validationError('One or more selected add-ons are unavailable.');

      // Recheck availability at save-time, not just when the Client picks a slot.
      const availability = await getDateAvailability(input.date, { transaction });
      assertSlotAvailable(availability, input.time);

      const totalCents = moneyCents(pkg.price) + addons.reduce((sum, addon) => sum + moneyCents(addon.price), 0);
      const rate = Number(settings.down_payment_value || 0);
      let downCents;
      if (settings.down_payment_type === 'percentage') {
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw validationError('Invalid studio down payment settings.', 503);
        downCents = Math.round(totalCents * rate / 100);
      } else {
        downCents = moneyCents(rate);
      }
      downCents = Math.min(downCents, totalCents);
      const totalPrice = totalCents / 100;
      const downPayment = downCents / 100;

      const appt = await Appointment.create({
        tracking_number: await nextTrackingNumber(transaction),
        client_id: req.user.id,
        package_id: pkg.id,
        date: input.date,
        time: input.time,
        num_people: input.numPeople,
        special_requests: input.special || null,
        addon_ids: input.addonIds,
        total_price: totalPrice,
        down_payment: downPayment,
        amount_paid: 0,
        remaining_balance: totalPrice,
        status: 'pending',
        payment_status: 'payment_required',
      }, { transaction });
      return {
        id: appt.id, tracking_number: appt.tracking_number,
        package_id: pkg.id, package: { id: pkg.id, name: pkg.name, price: Number(pkg.price), duration: pkg.duration },
        date: input.date, time: input.time, num_people: input.numPeople,
        special_requests: input.special,
        addon_ids: input.addonIds, total_price: totalPrice, down_payment: downPayment,
        amount_paid: 0, remaining_balance: totalPrice,
        status: 'pending', payment_status: 'payment_required',
      };
    });

    // Notifications are helpful, but failures do not erase a successfully saved booking.
    try {
      await Notification.create({
        user_id: req.user.id,
        title: 'Booking request received',
        message: `Booking ${saved.tracking_number} was created. Payment is required before studio confirmation.`,
        type: 'booking', read: false, related_id: saved.id, related_type: 'appointment',
      });
    } catch (err) { console.error('Client booking notification failed:', err.message); }
    await notifyAdmins('New client booking', `${req.user.name || 'A client'} booked ${saved.tracking_number}.`, 'booking', saved.id, 'appointment');
    return res.status(201).json({ appointment: saved });
  } catch (err) { return next(err); }
});

module.exports = router;
