// WBS 3.3.2 isolated API tests. No MySQL, uploads or real credentials required.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const OWN = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PAYMENT = '33333333-3333-4333-8333-333333333333';
const client = { id: 'client-1', role: 'client', name: 'Ana' };
const IMG = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x01]);
const valid = {
  appointment_id: OWN, amount: '500.00',
  reference_number: 'TXN-12345', payment_date: '2026-11-21',
};

function setup({ status = 'pending', balance = 1500, pendingAmount = 0, verifiedAmount = 0, duplicate = false, fsError = false } = {}) {
  const handlers = new Map(); const middleware = []; const uploads = []; const removed = [];
  const notifications = []; const admins = []; const payments = [];
  const appointment = {
    id: OWN, client_id: client.id, tracking_number: 'SP-2026-1000', date: '2026-12-20', time: '10:00',
    status, remaining_balance: String(balance), amount_paid: String(verifiedAmount), payment_status: 'payment_required',
    async update(data) { Object.assign(this, data); },
  };
  const otherPayment = { id: OTHER, client_id: 'client-2', appointment_id: OTHER,
    amount: '900', status: 'verified', reference_number: 'PRIVATE', payment_date: '2026-11-20', proof_url: 'local:SECRET.png',
    appointment: { id: OTHER, tracking_number: 'SECRET TRACKING', date: '2026-12-20', time: '09:00' },
  };
  const existing = { id: PAYMENT, appointment_id: OWN, client_id: client.id,
    amount: 500, type: 'down_payment', reference_number: 'EXISTING', payment_date: '2026-11-21',
    proof_url: 'local:33333333-3333-4333-8333-333333333333.png',
    status: 'rejected', notes: 'Receipt unclear',
    appointment: { id: OWN, tracking_number: appointment.tracking_number, date: appointment.date, time: appointment.time },
  };
  payments.push(existing, otherPayment);
  const mockFs = {
    async mkdir() {},
    async writeFile(name, buf, args) {
      if (fsError) throw new Error('Storage failure');
      assert.equal(args.flag, 'wx'); uploads.push(name);
    },
    async unlink(name) { removed.push(name); },
  };
  class MulterError extends Error { constructor(code) { super(code); this.code = code; } }
  const multer = () => ({ single: () => (req, res, next) => req.mockUploadError ? next(new MulterError(req.mockUploadError)) : next() });
  multer.memoryStorage = () => ({});
  multer.MulterError = MulterError;
  const models = {
    sequelize: { transaction: async fn => fn({ LOCK: { UPDATE: 'FOR UPDATE' } }) },
    Appointment: {
      findOne: async opts => {
        assert.equal(opts.lock, 'FOR UPDATE');
        return opts.where.id === OWN && opts.where.client_id === client.id ? appointment : null;
      },
    },
    Payment: {
      findAll: async opts => {
        assert.equal(opts.where.client_id, client.id);
        assert.equal(opts.include[0].where.client_id, client.id);
        return payments.filter(p => p.client_id === client.id);
      },
      findOne: async opts => {
        assert.equal(opts.where.client_id, client.id);
        if (opts.where.id) return payments.find(p => p.id === opts.where.id && p.client_id === client.id) || null;
        if (opts.where.reference_number) return duplicate ? { id: 'existing' } : null;
        throw Error('Unexpected findOne');
      },
      sum: async (field, opts) => {
        assert.equal(field, 'amount');
        assert.equal(opts.where.appointment_id, OWN);
        return pendingAmount;
      },
      create: async (data, options) => {
        assert.ok(options.transaction);
        const row = { id: '44444444-4444-4444-8444-444444444444', ...data, toJSON() { return { ...data, id: this.id }; } };
        payments.push(row);
        return row;
      },
    },
    Notification: { create: async data => notifications.push(data) },
  };
  const express = { Router: () => ({
    use(...fn) { middleware.push(...fn); },
    get(route, ...handlersList) { handlers.set(`GET ${route}`, handlersList); },
    post(route, ...handlersList) { handlers.set(`POST ${route}`, handlersList); },
  }) };
  const routeFile = path.resolve(__dirname, '../src/routes/client-payments.js');
  const old = Module._load;
  Module._load = function(name, parent, main) {
    if (parent?.filename === routeFile) {
      if (name === 'express') return express;
      if (name === 'node:fs/promises') return mockFs;
      if (name === 'node:crypto') return { randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
      if (name === 'multer') return multer;
      if (name === 'sequelize') return { Op: { in: Symbol.for('in') } };
      if (name === '../models') return models;
      if (name === '../middleware/auth') return { authenticate: (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Unauthorized' }) };
      if (name === '../utils/notifyAdmins') return { notifyAdmins: async (...args) => admins.push(args) };
      if (name === '../utils/dateTime') return { dateKeyInTimeZone: () => '2026-11-21', isValidDateKey: value => /^2026-11-(0[1-9]|1\d|2[0-9]|30)$/.test(value) };
      if (name === '../utils/paymentProof') return {
        PROOFS_DIR: '/safe/uploads', MAX_PROOF_BYTES: 5 * 1024 * 1024,
        imageExtension: buf => Buffer.isBuffer(buf) && buf.subarray(0, 8).equals(IMG.subarray(0, 8)) ? '.png' : null,
        safeLocalFile: value => value === existing.proof_url ? '/safe/uploads/existing.png' : null,
      };
    }
    return old.call(this, name, parent, main);
  };
  delete require.cache[routeFile];
  try { require(routeFile); } finally { Module._load = old; delete require.cache[routeFile]; }
  const request = (method, url, user = client, { body = {}, file = undefined, params = {}, multipart = true, mockUploadError = undefined } = {}) => new Promise((resolve, reject) => {
    const fns = [...middleware, ...(handlers.get(`${method} ${url}`) || [])];
    assert.ok(handlers.has(`${method} ${url}`), `Missing ${method} ${url}`);
    const res = {
      code: 200, headers: {}, headersSent: false,
      status(value) { this.code = value; return this; },
      set(key, value) { this.headers[key] = value; return this; },
      type(value) { this.mime = value; return this; },
      json(value) { resolve({ status: this.code, body: value, headers: this.headers }); return this; },
      send(value) { resolve({ status: this.code, body: value }); return this; },
      sendFile(filepath) { resolve({ status: this.code, file: filepath, headers: this.headers }); return this; },
    };
    const req = { user, body, file, params, mockUploadError, is: kind => kind === 'multipart/form-data' && multipart };
    let idx = 0;
    const next = err => {
      if (err) return reject(err);
      const fn = fns[idx++];
      try { Promise.resolve(fn(req, res, next)).catch(reject); }
      catch (error) { reject(error); }
    };
    next();
  });
  const proof = { size: IMG.length, buffer: IMG, mimetype: 'image/png', originalname: 'receipt.png' };
  return { request, proof, appointment, uploads, removed, payments, notifications, admins };
}

test('history includes only own payments and hides private receipt paths', async () => {
  const s = setup(); const r = await s.request('GET', '/');
  assert.equal(r.status, 200); assert.equal(r.body.payments.length, 1);
  assert.equal(r.body.payments[0].appointment.tracking_number, 'SP-2026-1000');
  assert.equal(r.body.payments[0].notes, 'Receipt unclear');
  assert.equal('proof_url' in r.body.payments[0], false);
  assert.equal(JSON.stringify(r.body).includes('SECRET'), false);
  assert.equal(r.headers['Cache-Control'], 'private, no-store');
});
test('Admin, Staff and anonymous users cannot access Client payments', async () => {
  const s = setup();
  assert.equal((await s.request('GET', '/', null)).status, 401);
  assert.equal((await s.request('GET', '/', { id: 'admin', role: 'admin' })).status, 403);
  assert.equal((await s.request('POST', '/', { id: 'staff', role: 'staff' }, { body: valid, file: s.proof })).status, 403);
});
test('valid image proof is stored privately as pending; Admin still must verify', async () => {
  const s = setup(); const r = await s.request('POST', '/', client, { body: valid, file: s.proof });
  assert.equal(r.status, 201); assert.equal(r.body.payment.status, 'payment_submitted');
  assert.equal(r.body.payment.amount, 500); assert.equal(s.appointment.amount_paid, '0');
  assert.equal(s.appointment.payment_status, 'payment_submitted');
  assert.equal('proof_url' in r.body.payment, false);
  assert.equal(s.uploads.length, 1); assert.ok(s.uploads[0].endsWith('.png'));
  assert.equal(s.notifications.length, 1); assert.equal(s.admins.length, 1);
});
test('ownership check blocks payment proofs for someone else booking', async () => {
  const s = setup();
  const r = await s.request('POST', '/', client, { body: { ...valid, appointment_id: OTHER }, file: s.proof });
  assert.equal(r.status, 404); assert.equal(s.uploads.length, 0);
});
test('rejects cancelled bookings, amount exceeding available balance and duplicate reference', async () => {
  const s = setup({ status: 'cancelled' });
  assert.equal((await s.request('POST', '/', client, { body: valid, file: s.proof })).status, 409);
  const partial = setup({ pendingAmount: 1400 });
  assert.equal((await partial.request('POST', '/', client, { body: valid, file: partial.proof })).status, 409);
  const duplicate = setup({ duplicate: true });
  assert.equal((await duplicate.request('POST', '/', client, { body: valid, file: duplicate.proof })).status, 409);
});
test('rejects role/status/amount injection and invalid date or image content', async () => {
  const s = setup();
  for (const body of [
    { ...valid, client_id: 'admin' },
    { ...valid, status: 'verified' },
    { ...valid, amount: '-5' },
    { ...valid, amount: '0' },
    { ...valid, amount: '3.777' },
    { ...valid, payment_date: '2026-11-29' },
    { ...valid, reference_number: '' },
  ]) assert.equal((await s.request('POST', '/', client, { body, file: s.proof })).status, 400);
  assert.equal((await s.request('POST', '/', client, { body: valid, file: { ...s.proof, buffer: Buffer.from('javascript') } })).status, 400);
  assert.equal(s.uploads.length, 0);
});
test('rejects missing and oversized multipart proof without saving', async () => {
  const s = setup();
  assert.equal((await s.request('POST', '/', client, { body: valid })).status, 400);
  assert.equal((await s.request('POST', '/', client, { body: valid, multipart: false })).status, 415);
  assert.equal((await s.request('POST', '/', client, { body: valid, file: s.proof, mockUploadError: 'LIMIT_FILE_SIZE' })).status, 413);
  assert.equal(s.uploads.length, 0);
});
test('receipt preview only permits payment owner', async () => {
  const s = setup();
  assert.equal((await s.request('GET', '/:id/proof', client, { params: { id: OTHER } })).status, 404);
  const ok = await s.request('GET', '/:id/proof', client, { params: { id: PAYMENT } });
  assert.equal(ok.status, 200); assert.equal(ok.file, '/safe/uploads/existing.png');
  assert.equal(ok.headers['Cache-Control'], 'private, no-store');
});
test('storage failure rejects submission and creates no payment', async () => {
  const s = setup({ fsError: true });
  await assert.rejects(s.request('POST', '/', client, { body: valid, file: s.proof }), /Storage failure/);
  assert.equal(s.payments.length, 2);
});
