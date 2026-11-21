const { Op } = require('sequelize');
const { Appointment, Schedule, StudioSettings } = require('../models');
const {
  dateKeyInTimeZone,
  isValidDateKey,
  isValidTime,
  weekdayKey,
  minutesFromTime,
  timeFromMinutes,
} = require('./dateTime');

const { OCCUPYING_STATUSES, DEFAULT_HOURS, normalizeSettings, generateDefaultSlots, computeDateAvailability } = require('./availabilityCore');

async function getSettings(transaction) {
  let settings = await StudioSettings.findByPk(1, { transaction });
  if (!settings) settings = await StudioSettings.create({ id: 1 }, { transaction });
  return settings;
}

async function getDateAvailability(date, { excludeAppointmentId = null, transaction = null } = {}) {
  if (!isValidDateKey(date)) {
    const err = new Error('Invalid date. Use YYYY-MM-DD.');
    err.status = 400;
    throw err;
  }

  const settings = await getSettings(transaction);
  const appointmentWhere = { date };
  if (excludeAppointmentId) appointmentWhere.id = { [Op.ne]: excludeAppointmentId };

  const [appointments, schedules] = await Promise.all([
    Appointment.findAll({ where: appointmentWhere, attributes: ['id', 'time', 'status'], transaction }),
    Schedule.findAll({ where: { date }, transaction }),
  ]);
  return computeDateAvailability(date, settings, appointments, schedules);
}

async function getMonthAvailability(month, { transaction = null } = {}) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) {
    const err = new Error('Invalid month. Use YYYY-MM.');
    err.status = 400;
    throw err;
  }
  const [year, monthNumber] = month.split('-').map(Number);
  if (monthNumber < 1 || monthNumber > 12) {
    const err = new Error('Invalid month. Use YYYY-MM.');
    err.status = 400;
    throw err;
  }

  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const start = `${month}-01`;
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;
  const settings = await getSettings(transaction);
  const [appointments, schedules] = await Promise.all([
    Appointment.findAll({
      where: { date: { [Op.between]: [start, end] } },
      attributes: ['id', 'date', 'time', 'status'],
      transaction,
    }),
    Schedule.findAll({ where: { date: { [Op.between]: [start, end] } }, transaction }),
  ]);

  const apptsByDate = new Map();
  for (const appt of appointments) {
    if (!apptsByDate.has(appt.date)) apptsByDate.set(appt.date, []);
    apptsByDate.get(appt.date).push(appt);
  }
  const schedulesByDate = new Map();
  for (const sched of schedules) {
    if (!schedulesByDate.has(sched.date)) schedulesByDate.set(sched.date, []);
    schedulesByDate.get(sched.date).push(sched);
  }

  const days = [];
  for (let day = 1; day <= lastDay; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const availability = computeDateAvailability(
      date,
      settings,
      apptsByDate.get(date) || [],
      schedulesByDate.get(date) || [],
    );
    days.push({
      date,
      status: availability.status,
      closed: availability.closed,
      full: availability.full,
      daily_capacity: availability.daily_capacity,
      daily_booked: availability.daily_booked,
      daily_remaining: availability.daily_remaining,
      available_slots: availability.slots.filter((slot) => slot.available).length,
    });
  }

  return { month, days };
}

function assertSlotAvailable(availability, time) {
  if (!isValidTime(time)) {
    const err = new Error('Invalid time. Use HH:mm.');
    err.status = 400;
    throw err;
  }
  if (availability.closed) {
    const err = new Error('The studio is closed on the selected date.');
    err.status = 409;
    throw err;
  }
  if (availability.daily_remaining <= 0) {
    const err = new Error('The selected date is fully booked.');
    err.status = 409;
    throw err;
  }
  const slot = availability.slots.find((item) => item.time === time);
  if (!slot) {
    const err = new Error('The selected time is outside the studio schedule.');
    err.status = 409;
    throw err;
  }
  if (!slot.available) {
    const err = new Error(slot.blocked ? 'The selected time is blocked.' : 'The selected time is fully booked.');
    err.status = 409;
    throw err;
  }
  return slot;
}

module.exports = {
  OCCUPYING_STATUSES,
  DEFAULT_HOURS,
  normalizeSettings,
  generateDefaultSlots,
  computeDateAvailability,
  getDateAvailability,
  getMonthAvailability,
  assertSlotAvailable,
};
