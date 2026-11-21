// WBS 3.3.1 — isolated route tests; do not connect to MySQL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const OWN = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const client = { id: 'client-one', name: 'Ana', role: 'client' };
const otherClient = { id: 'client-two', name: 'Bob', role: 'client' };

function fixture({ hours = 100, status = 'confirmed', paid = true } = {}) {
  const handlers = new Map();
  const middlewares = [];
  const notifications = [];
  const own = {
    id: OWN, client_id: client.id, tracking_number: 'SP-2026-0001',
    date: '2026-12-20', time: '10:00', status,
    payment_status: paid ? 'verified' : 'payment_required', amount_paid: paid ? 500 : 0,
    down_payment: 500, total_price: '1500.00', remaining_balance: '1000.00',
    queue_number: 3, num_people: 2, addon_ids: [],
    special_requests: 'Small backdrop', created_at: '2026-11-21T00:00:00Z',
    package: { id: 'pkg-1', name: 'Solo', price: '1500', duration: 60, max_people: 2 },
    photoWorkflow: { stage: 'editing', gallery_url: 'https://studio.example/private', internal_notes: 'HIDDEN' },
  };
  const other = {
    ...own, id: OTHER, client_id: otherClient.id, tracking_number: 'SP-2026-9999',
    queue_number: 1, package: { ...own.package, name: 'Private package' },
  };
  const row = data => ({
    ...data,
    toJSON() { return { ...data }; },
    async update(changes) { Object.assign(data, changes); Object.assign(this, changes); },
  });
  const models = {
    sequelize: { transaction: async fn => fn({ LOCK: { UPDATE: 'FOR UPDATE' } }) },
    Appointment: {
      async findAll(opts) {
        if ('client_id' in opts.where) return [own, other]
          .filter(r => r.client_id === opts.where.client_id && (!opts.where.id || opts.where.id === r.id))
          .map(row);
        assert.equal(opts.where.date, '2026-12-20');
        return [{ queue_number: 1, status: 'waiting' }, { queue_number: 2, status: 'completed' }, { queue_number: 3, status: 'confirmed' }];
      },
      async findOne(opts) {
        assert.equal(opts.lock, 'FOR UPDATE');
        return [own, other].filter(r => r.id === opts.where.id && r.client_id === opts.where.client_id).map(row)[0] || null;
      },
    },
    Package: {}, PhotoWorkflow: {},
    StudioSettings: { findByPk: async () => ({ cancellation_hours: 24, reschedule_hours: 48, no_show_forfeits_downpayment: true }) },
    Notification: { create: async data => notifications.push(data) },
  };
  const express = { Router: () => ({
    use(...fn) { middlewares.push(...fn); },
    get(url, fn) { handlers.set(`GET ${url}`, fn); },
    post(url, fn) { handlers.set(`POST ${url}`, fn); },
  }) };
  const routeFile = path.resolve(__dirname, '../src/routes/client-appointments.js');
  const oldLoad = Module._load;
  Module._load = function (name, parent, main) {
    if (parent?.filename === routeFile) {
      if (name === 'express') return express;
      if (name === 'sequelize') return { Op: { ne: Symbol('ne') } };
      if (name === '../models') return models;
      if (name === '../middleware/auth') return {
        authenticate(req, res, next) { return req.user ? next() : res.status(401).json({ error: 'Unauthorized' }); },
      };
      if (name === '../utils/bookingQr') return {
        makeBookingQR: appt => `SIGNED:${appt.id}`,
        hasVerifiedDownPayment: appt => ['verified', 'partially_paid', 'fully_paid'].includes(appt.payment_status)
          && Number(appt.amount_paid) >= Number(appt.down_payment),
      };
      if (name === '../utils/dateTime') return {
        dateKeyInTimeZone: () => '2026-12-20',
        hoursUntilAppointment: () => hours,
      };
      if (name === '../utils/appointmentState') return {
        canClientRequest: (from, to) => ({
          pending: ['cancellation_requested'],
          confirmed: ['cancellation_requested', 'reschedule_requested'],
          rescheduled: ['cancellation_requested', 'reschedule_requested'],
        })[from]?.includes(to) || false,
      };
      if (name === '../utils/notifyAdmins') return { notifyAdmins: async () => {} };
    }
    return oldLoad.call(this, name, parent, main);
  };
  delete require.cache[routeFile];
  try { require(routeFile); } finally { Module._load = oldLoad; delete require.cache[routeFile]; }
  const request = (method, url, user, { body = {}, params = {} } = {}) => new Promise((resolve, reject) => {
    const handler = handlers.get(`${method} ${url}`);
    assert.ok(handler, `Missing ${method} ${url}`);
    const res = {
      code: 200, headers: {}, status(n) { this.code = n; return this; },
      set(k, value) { this.headers[k] = value; return this; },
      json(value) { resolve({ status: this.code, body: value, headers: this.headers }); return this; },
    };
    const req = { user, body, params };
    const chain = [...middlewares, handler];
    let idx = 0;
    const next = err => {
      if (err) return reject(err);
      const fn = chain[idx++];
      try { Promise.resolve(fn(req, res, next)).catch(reject); }
      catch (error) { reject(error); }
    };
    next();
  });
  return { request, own, other, notifications };
}

test('returns own booking history only, never other Client details', async () => {
  const s = fixture(); const r = await s.request('GET', '/', client);
  assert.equal(r.status, 200); assert.equal(r.body.appointments.length, 1);
  assert.equal(r.body.appointments[0].id, OWN);
  assert.equal(r.body.appointments[0].package.name, 'Solo');
  assert.equal(r.headers['Cache-Control'], 'private, no-store');
});
test('signed QR is available only for eligible confirmed, paid bookings', async () => {
  for (const scenario of [
    [{ status: 'confirmed', paid: true }, `SIGNED:${OWN}`],
    [{ status: 'confirmed', paid: false }, null],
    [{ status: 'pending', paid: true }, null],
    [{ status: 'completed', paid: true }, null],
  ]) {
    const s = fixture(scenario[0]); const r = await s.request('GET', '/', client);
    assert.equal(r.body.appointments[0].qr_payload, scenario[1]);
  }
});
test('hides internal workflow notes and unreleased gallery link', async () => {
  const s = fixture(); const r = await s.request('GET', '/', client);
  const appt = r.body.appointments[0];
  assert.equal(appt.photoWorkflow.stage, 'editing');
  assert.equal(appt.photoWorkflow.gallery_url, null);
  assert.equal('internal_notes' in appt.photoWorkflow, false);
  assert.equal('client' in appt, false);
});
test('exposes aggregate queue position but never other booking identities', async () => {
  const s = fixture(); const r = await s.request('GET', '/', client);
  const queue = r.body.appointments[0].queue;
  assert.equal(queue.queueNumber, 3);
  assert.equal(queue.ahead, 1);
  assert.equal(queue.nowServingNum, null);
  assert.equal(JSON.stringify(queue).includes('SP-2026-9999'), false);
});
test('blocks Admin, Staff and unauthenticated callers', async () => {
  const s = fixture();
  assert.equal((await s.request('GET', '/', null)).status, 401);
  assert.equal((await s.request('GET', '/', { id: 'admin', role: 'admin' })).status, 403);
  assert.equal((await s.request('GET', '/', { id: 'staff', role: 'staff' })).status, 403);
});
test('single booking lookup and request changes are restricted to owner', async () => {
  const s = fixture();
  assert.equal((await s.request('GET', '/:id', client, { params: { id: OTHER } })).status, 404);
  assert.equal((await s.request('POST', '/:id/request-cancellation', client,
    { params: { id: OTHER }, body: { reason: 'Please cancel' } })).status, 404);
  assert.equal((await s.request('GET', '/:id', client, { params: { id: OWN } })).status, 200);
});
test('Client can submit cancellation and reschedule requests without directly changing dates', async () => {
  const cancel = fixture();
  const one = await cancel.request('POST', '/:id/request-cancellation', client,
    { params: { id: OWN }, body: { reason: 'Unable to attend' } });
  assert.equal(one.status, 200); assert.equal(cancel.own.status, 'cancellation_requested');
  assert.equal(cancel.own.cancellation_reason, 'Unable to attend');
  assert.equal(cancel.notifications.length, 1);
  const again = await cancel.request('POST', '/:id/request-cancellation', client,
    { params: { id: OWN }, body: { reason: 'Again' } });
  assert.equal(again.status, 409);
  const reschedule = fixture();
  const two = await reschedule.request('POST', '/:id/request-reschedule', client,
    { params: { id: OWN }, body: { reason: 'Prefer next Friday' } });
  assert.equal(two.status, 200); assert.equal(reschedule.own.status, 'reschedule_requested');
  assert.equal(reschedule.own.date, '2026-12-20');
});
test('rejects late requests, oversized notes and status/role injection', async () => {
  const s = fixture({ hours: 2 });
  const late = await s.request('POST', '/:id/request-cancellation', client,
    { params: { id: OWN }, body: { reason: 'Late' } });
  assert.equal(late.status, 409);
  const n = fixture();
  assert.equal((await n.request('POST', '/:id/request-cancellation', client,
    { params: { id: OWN }, body: { reason: 'x'.repeat(1001) } })).status, 400);
  assert.equal((await n.request('POST', '/:id/request-cancellation', client,
    { params: { id: OWN }, body: { reason: 'Test', status: 'cancelled' } })).status, 400);
  assert.equal(n.own.status, 'confirmed');
});
