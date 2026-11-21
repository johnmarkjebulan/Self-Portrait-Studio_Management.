// WBS 3.2.1 isolated route tests. These mocks do not access a live database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const PKG = '11111111-1111-4111-8111-111111111111';
const ADD = '22222222-2222-4222-8222-222222222222';
const CLIENT = { id: 'client-1', role: 'client', name: 'Test Client' };
const payload = (extra = {}) => ({ package_id: PKG, date: '2026-12-02', time: '10:00', num_people: 2, addon_ids: [ADD], special_requests: 'Soft backdrop', ...extra });

function suite({ unavailable = false, missingPackage = false, missingAddon = false } = {}) {
  const handlers = new Map(); const middleware = []; const created = []; const notices = [];
  const tx = { LOCK: { UPDATE: 'FOR UPDATE' } };
  const models = {
    sequelize: { transaction: async fn => fn(tx) },
    StudioSettings: { findByPk: async (id, opts) => { assert.equal(opts.lock, 'FOR UPDATE'); return { down_payment_type: 'percentage', down_payment_value: '25' }; } },
    Package: { findOne: async ({ where }) => { assert.equal(where.active, true); return missingPackage ? null : { id: PKG, name: 'Solo', price: '1499.99', max_people: 3, duration: 60 }; } },
    Addon: { findAll: async ({ where }) => { assert.equal(where.active, true); return missingAddon ? [] : [{ id: ADD, price: '150.01' }]; } },
    Appointment: { findOne: async () => null, create: async (row, opts) => { assert.equal(opts.transaction, tx); created.push(row); return { ...row, id: 'appointment-1' }; } },
    Notification: { create: async row => notices.push(row) },
  };
  const express = { Router: () => ({
    use: (...fns) => { middleware.push(...fns); },
    get: (p, fn) => handlers.set(`GET ${p}`, fn),
    post: (p, fn) => handlers.set(`POST ${p}`, fn),
  }) };
  const file = path.resolve(__dirname, '../src/routes/client-bookings.js');
  const original = Module._load;
  Module._load = function (name, parent, isMain) {
    if (parent?.filename === file) {
      if (name === 'express') return express;
      if (name === 'sequelize') return { Op: { like: Symbol('like'), in: Symbol('in') } };
      if (name === '../models') return models;
      if (name === '../middleware/auth') return { authenticate: (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Unauthenticated' }) };
      if (name === '../utils/dateTime') return {
        dateKeyInTimeZone: () => '2026-11-21',
        dateTimeInStudioZone: (d, t) => new Date(`${d}T${t}:00+08:00`),
        isValidDateKey: value => /^2026-\d{2}-\d{2}$/.test(value),
        isValidTime: value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
      };
      if (name === '../utils/availability') return {
        getDateAvailability: async () => ({ closed: false, daily_remaining: 2, slots: [{ time: '10:00', available: !unavailable }] }),
        getMonthAvailability: async month => ({ month, days: [] }),
        assertSlotAvailable: (data, time) => { if (!data.slots.some(s => s.time === time && s.available)) throw Object.assign(new Error('Slot unavailable'), { status: 409 }); },
      };
      if (name === '../utils/notifyAdmins') return { notifyAdmins: async () => {} };
    }
    return original.call(this, name, parent, isMain);
  };
  delete require.cache[file];
  try { require(file); } finally { Module._load = original; delete require.cache[file]; }

  const request = (method, url, user, body = {}, query = {}) => new Promise(resolve => {
    const handler = handlers.get(`${method} ${url}`); assert.ok(handler);
    let idx = 0;
    const res = { code: 200, status(n) { this.code = n; return this; }, json(value) { resolve({ status: this.code, value }); return this; } };
    const next = err => {
      if (err) return resolve({ status: err.status || 500, value: { error: err.message } });
      const fn = [...middleware, handler][idx++];
      try { Promise.resolve(fn({ user, body, query }, res, next)).catch(next); } catch (e) { next(e); }
    };
    next();
  });
  return { request, created, notices };
}

test('creates Client booking with server-calculated total and down payment', async () => {
  const s = suite(); const res = await s.request('POST', '/', CLIENT, payload());
  assert.equal(res.status, 201); assert.equal(s.created.length, 1);
  assert.equal(s.created[0].client_id, CLIENT.id);
  assert.equal(s.created[0].total_price, 1650); assert.equal(s.created[0].down_payment, 412.5);
  assert.equal(s.created[0].payment_status, 'payment_required');
  assert.equal(s.created[0].status, 'pending'); assert.equal(res.value.appointment.tracking_number, 'SP-2026-0001');
  assert.equal(s.notices.length, 1);
});
test('rejects Admin, Staff and unauthenticated booking callers', async () => {
  const s = suite();
  assert.equal((await s.request('POST', '/', { id: 'a', role: 'admin' }, payload())).status, 403);
  assert.equal((await s.request('POST', '/', { id: 's', role: 'staff' }, payload())).status, 403);
  assert.equal((await s.request('POST', '/', null, payload())).status, 401);
  assert.equal(s.created.length, 0);
});
test('rejects browser attempts to choose user, totals or booking statuses', async () => {
  const s = suite();
  for (const field of ['client_id', 'total_price', 'down_payment', 'role', 'status', 'payment_status']) {
    assert.equal((await s.request('POST', '/', CLIENT, payload({ [field]: 'forged' }))).status, 400);
  }
  assert.equal(s.created.length, 0);
});
test('rejects too many guests, missing package, missing addon and duplicate addons', async () => {
  const s = suite();
  assert.equal((await s.request('POST', '/', CLIENT, payload({ num_people: 4 }))).status, 400);
  assert.equal((await s.request('POST', '/', CLIENT, payload({ addon_ids: [ADD, ADD] }))).status, 400);
  assert.equal((await suite({ missingPackage: true }).request('POST', '/', CLIENT, payload())).status, 404);
  assert.equal((await suite({ missingAddon: true }).request('POST', '/', CLIENT, payload())).status, 400);
  assert.equal(s.created.length, 0);
});
test('refuses unavailable slots and does not save appointment', async () => {
  const s = suite({ unavailable: true });
  assert.equal((await s.request('POST', '/', CLIENT, payload())).status, 409);
  assert.equal(s.created.length, 0);
});
test('exposes only aggregate read-only availability to Client', async () => {
  const s = suite();
  assert.equal((await s.request('GET', '/availability', CLIENT, {}, { date: '2026-12-02' })).status, 200);
  assert.equal((await s.request('GET', '/availability', CLIENT, {}, { month: '2026-12' })).status, 200);
  assert.equal((await s.request('GET', '/availability', CLIENT)).status, 400);
  assert.equal((await s.request('GET', '/availability', { id: 'admin', role: 'admin' })).status, 403);
});
test('rejects invalid or past date, time and oversized notes', async () => {
  const s = suite();
  assert.equal((await s.request('POST', '/', CLIENT, payload({ date: 'bad' }))).status, 400);
  assert.equal((await s.request('POST', '/', CLIENT, payload({ date: '2026-01-01' }))).status, 409);
  assert.equal((await s.request('POST', '/', CLIENT, payload({ time: '99:00' }))).status, 400);
  assert.equal((await s.request('POST', '/', CLIENT, payload({ special_requests: 'x'.repeat(1001) }))).status, 400);
  assert.equal(s.created.length, 0);
});
