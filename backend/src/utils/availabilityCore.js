const { dateKeyInTimeZone, isValidTime, weekdayKey, minutesFromTime, timeFromMinutes } = require('./dateTime');

const OCCUPYING_STATUSES = [
  'pending',
  'confirmed',
  'cancellation_requested',
  'reschedule_requested',
  'rescheduled',
  'checked_in',
  'waiting',
  'now_serving',
  'completed',
];

const DEFAULT_HOURS = {
  Mon: { open: '09:00', close: '17:00', closed: false },
  Tue: { open: '09:00', close: '17:00', closed: false },
  Wed: { open: '09:00', close: '17:00', closed: false },
  Thu: { open: '09:00', close: '17:00', closed: false },
  Fri: { open: '09:00', close: '17:00', closed: false },
  Sat: { open: '09:00', close: '17:00', closed: false },
  Sun: { open: '09:00', close: '17:00', closed: true },
};

function parseJsonObject(value, fallback) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return fallback;
}

function normalizeSettings(settings) {
  const raw = settings?.toJSON ? settings.toJSON() : (settings || {});
  return {
    ...raw,
    business_hours: { ...DEFAULT_HOURS, ...parseJsonObject(raw.business_hours, {}) },
    daily_capacity: Math.max(1, Number(raw.daily_capacity || 10)),
    slot_capacity: Math.max(1, Number(raw.slot_capacity || 3)),
    slot_interval_minutes: Math.max(15, Math.min(240, Number(raw.slot_interval_minutes || 60))),
  };
}

function generateDefaultSlots(date, settings) {
  const day = weekdayKey(date);
  const hours = settings.business_hours?.[day] || DEFAULT_HOURS[day];
  if (!hours || hours.closed || !isValidTime(hours.open) || !isValidTime(hours.close)) return [];

  const start = minutesFromTime(hours.open);
  const end = minutesFromTime(hours.close);
  if (end <= start) return [];

  const slots = [];
  for (let minute = start; minute < end; minute += settings.slot_interval_minutes) {
    slots.push(timeFromMinutes(minute));
  }
  return slots;
}

function computeDateAvailability(date, settingsInput, appointments = [], schedules = []) {
  const settings = normalizeSettings(settingsInput);
  const today = dateKeyInTimeZone();
  const overrideMap = new Map(schedules.map((s) => [s.time, s.toJSON ? s.toJSON() : s]));
  const generated = generateDefaultSlots(date, settings);
  const special = schedules
    .filter((s) => !(s.toJSON ? s.toJSON() : s).blocked)
    .map((s) => (s.toJSON ? s.toJSON() : s).time)
    .filter(isValidTime);
  const times = [...new Set([...generated, ...special])].sort();

  const occupying = appointments.filter((a) => OCCUPYING_STATUSES.includes(a.status));
  const dailyBooked = occupying.length;
  const dailyRemaining = Math.max(0, settings.daily_capacity - dailyBooked);

  const slots = times.map((time) => {
    const override = overrideMap.get(time);
    const blocked = Boolean(override?.blocked);
    const capacity = Math.max(1, Number(override?.max_capacity || settings.slot_capacity));
    const booked = occupying.filter((a) => a.time === time).length;
    const slotRemaining = Math.max(0, capacity - booked);
    const remaining = Math.max(0, Math.min(slotRemaining, dailyRemaining));
    return {
      time,
      capacity,
      booked,
      remaining,
      blocked,
      available: date >= today && !blocked && remaining > 0,
      source: override ? 'override' : 'default',
    };
  });

  const openSlots = slots.filter((slot) => slot.available);
  const day = weekdayKey(date);
  const baseClosed = Boolean(settings.business_hours?.[day]?.closed);
  const hasSpecialOpening = schedules.some((s) => {
    const value = s.toJSON ? s.toJSON() : s;
    return !value.blocked;
  });
  const closed = date < today || ((baseClosed || generated.length === 0) && !hasSpecialOpening) || slots.length === 0;
  const full = !closed && (dailyRemaining <= 0 || openSlots.length === 0);
  const limited = !closed && !full && (
    dailyRemaining <= Math.ceil(settings.daily_capacity / 2) ||
    openSlots.some((slot) => slot.remaining <= Math.max(1, Math.floor(slot.capacity / 2)))
  );

  return {
    date,
    weekday: day,
    closed,
    full,
    status: closed ? 'closed' : full ? 'full' : limited ? 'limited' : 'available',
    daily_capacity: settings.daily_capacity,
    daily_booked: dailyBooked,
    daily_remaining: dailyRemaining,
    slot_capacity: settings.slot_capacity,
    slot_interval_minutes: settings.slot_interval_minutes,
    slots,
  };
}


module.exports = { OCCUPYING_STATUSES, DEFAULT_HOURS, normalizeSettings, generateDefaultSlots, computeDateAvailability };
