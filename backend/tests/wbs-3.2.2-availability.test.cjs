// WBS 3.2.2 deterministic unit tests for Client-facing slot state.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describeClientAvailability, updateClientMonthToday } = require('../src/utils/clientAvailability');
const NOW = new Date('2026-11-21T14:15:00+08:00');
const slots = () => [{ time: '09:00', available: true, blocked: false, remaining: 1 }, { time: '15:00', available: true, blocked: false, remaining: 2 }];
const base = () => ({ closed: false, full: false, status: 'available', daily_remaining: 3, slots: slots() });

test('past time slot is disabled on the current date', () => {
  const a = describeClientAvailability(base(), '2026-11-21', NOW);
  assert.equal(a.slots[0].available, false); assert.equal(a.slots[0].reason, 'elapsed');
  assert.equal(a.slots[1].available, true);
});
test('all passed times mark today as full', () => {
  const a = describeClientAvailability(base(), '2026-11-21', new Date('2026-11-21T17:30:00+08:00'));
  assert.equal(a.full, true); assert.equal(a.status, 'full');
});
test('past dates are closed and no slots remain selectable', () => {
  const a = describeClientAvailability(base(), '2026-11-20', NOW);
  assert.equal(a.closed, true); assert.equal(a.status, 'closed');
  assert.ok(a.slots.every(s => !s.available && s.reason === 'past'));
});
test('studio closure takes precedence over ordinary capacity', () => {
  const a = describeClientAvailability({ ...base(), closed: true }, '2026-11-23', NOW);
  assert.equal(a.status, 'closed'); assert.equal(a.slots[0].reason, 'closed');
});
test('blocked slot is disabled even with remaining capacity', () => {
  const data = base(); data.slots[0].blocked = true;
  const a = describeClientAvailability(data, '2026-11-23', NOW);
  assert.equal(a.slots[0].reason, 'blocked'); assert.equal(a.slots[0].available, false);
});
test('daily capacity limit disables every slot', () => {
  const a = describeClientAvailability({ ...base(), daily_remaining: 0 }, '2026-11-23', NOW);
  assert.equal(a.full, true); assert.ok(a.slots.every(s => !s.available && s.reason === 'daily_full'));
});
test('slot capacity limit keeps full and free slots distinct', () => {
  const data = base();data.slots[0].available = false;
  const a = describeClientAvailability(data, '2026-11-23', NOW);
  assert.equal(a.slots[0].reason, 'full'); assert.equal(a.slots[1].available, true);
});
test('month summary refreshes today but not other dates', () => {
  const monthly = { month: '2026-11', days: [
    { date: '2026-11-21', status: 'available', available_slots: 2 },
    { date: '2026-11-22', status: 'closed', available_slots: 0 },
  ] };
  const today = describeClientAvailability(base(), '2026-11-21', new Date('2026-11-21T17:30:00+08:00'));
  const result = updateClientMonthToday(monthly, today, '2026-11-21');
  assert.equal(result.days[0].status, 'full'); assert.equal(result.days[0].available_slots, 0);
  assert.deepEqual(result.days[1], monthly.days[1]);
});
test('other months remain untouched', () => {
  const monthly = { month: '2026-12', days: [] };
  assert.equal(updateClientMonthToday(monthly, base(), '2026-11-21'), monthly);
});
