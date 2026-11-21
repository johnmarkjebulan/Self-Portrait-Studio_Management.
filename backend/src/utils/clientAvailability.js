// WBS 3.2.2: Client-facing slot state. Reuses the shared studio availability
// engine without changing Admin/Staff schedules or exposing booking identities.
const { dateKeyInTimeZone, dateTimeInStudioZone } = require('./dateTime');

function describeClientAvailability(availability, date, now = new Date()) {
  if (!availability || !Array.isArray(availability.slots)) return availability;
  const today = dateKeyInTimeZone(now);
  const pastDate = date < today;
  const closed = Boolean(availability.closed) || pastDate;
  const dailyFull = Number(availability.daily_remaining) <= 0;

  const slots = availability.slots.map((slot) => {
    const elapsed = date === today && dateTimeInStudioZone(date, slot.time).getTime() <= now.getTime();
    let reason = null;
    if (pastDate) reason = 'past';
    else if (elapsed) reason = 'elapsed';
    else if (closed) reason = 'closed';
    else if (slot.blocked) reason = 'blocked';
    else if (dailyFull) reason = 'daily_full';
    else if (!slot.available) reason = 'full';
    return { ...slot, available: reason === null, reason };
  });
  const full = !closed && !slots.some(slot => slot.available);
  return {
    ...availability,
    date,
    closed,
    full,
    slots,
    status: closed ? 'closed' : full ? 'full' : availability.status || 'available',
  };
}

function updateClientMonthToday(monthAvailability, todayAvailability, today = dateKeyInTimeZone()) {
  if (!monthAvailability || !Array.isArray(monthAvailability.days) || monthAvailability.month !== today.slice(0, 7)) {
    return monthAvailability;
  }
  return {
    ...monthAvailability,
    days: monthAvailability.days.map(day => day.date === today ? {
      ...day,
      status: todayAvailability.status,
      closed: todayAvailability.closed,
      full: todayAvailability.full,
      available_slots: todayAvailability.slots.filter(slot => slot.available).length,
    } : day),
  };
}

module.exports = { describeClientAvailability, updateClientMonthToday };
