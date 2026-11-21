// WBS 3.4.2 - Client feedback/rating isolated backend tests (no MySQL access).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

const CLIENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const A_DONE = '11111111-1111-4111-8111-111111111111';
const A_DONE2 = '22222222-2222-4222-8222-222222222222';
const A_PENDING = '33333333-3333-4333-8333-333333333333';
const B_DONE = '44444444-4444-4444-8444-444444444444';
const A = { id: CLIENT_A, role: 'client' };
const B = { id: CLIENT_B, role: 'client' };
const valid = { rating: 5, booking_experience: 4, staff_service: 5, studio_experience: 4, cleanliness: 5 };
const routeFile = path.resolve(__dirname, '../src/routes/client-feedback.js');

function fixture() {
  const handlers = new Map();
  const middlewares = [];
  const appointments = [
    { id: A_DONE, client_id: CLIENT_A, status: 'completed', tracking_number: 'A-DONE', date: '2026-11-01', time: '10:00' },
    { id: A_DONE2, client_id: CLIENT_A, status: 'completed', tracking_number: 'A-NEW', date: '2026-11-02', time: '10:00' },
    { id: A_PENDING, client_id: CLIENT_A, status: 'pending', tracking_number: 'A-PENDING', date: '2026-12-01', time: '11:00' },
    { id: B_DONE, client_id: CLIENT_B, status: 'completed', tracking_number: 'B-PRIVATE', date: '2026-11-03', time: '11:00' },
  ];
  const rows = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', client_id: CLIENT_A,
      appointment_id: A_DONE, ...valid, comment: 'Nice photos',
      staff_reply: 'Thank you!', replied_by: 'PRIVATE_STAFF_ID',
      replied_at: '2026-11-05', created_at: '2026-11-04',
      internal_private: 'SECRET', appointment: appointments[0],
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', client_id: CLIENT_B,
      appointment_id: B_DONE, ...valid, comment: 'OTHER_CLIENT_SECRET',
      staff_reply: 'PRIVATE_REPLY', created_at: '2026-11-06',
      appointment: appointments[3],
    },
  ];
  let uniqueError = false;
  const models = {
    Feedback: {
      async findAll(opts) {
        assert.equal(opts.where.client_id !== undefined, true);
        assert.ok(opts.limit <= 100);
        assert.deepEqual(opts.include[0].attributes, ['id', 'tracking_number', 'date', 'time']);
        return rows.filter(r => r.client_id === opts.where.client_id);
      },
      async findOne({ where }) { return rows.find(r => r.appointment_id === where.appointment_id) || null; },
      async create(data) {
        if (uniqueError || (data.appointment_id && rows.some(r => r.appointment_id === data.appointment_id))) {
          const err = new Error('Duplicate appointment');
          err.name = 'SequelizeUniqueConstraintError';
          throw err;
        }
        const row = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', created_at: '2026-11-21', ...data };
        rows.push(row);
        return row;
      },
    },
    Appointment: {
      async findOne({ where }) {
        assert.ok(where.client_id);
        return appointments.find(a => a.id === where.id && a.client_id === where.client_id) || null;
      },
    },
  };
  const router = {
    use(...fns) { middlewares.push(...fns); },
    get(path, ...fns) { handlers.set(`GET ${path}`, [...middlewares, ...fns]); },
    post(path, ...fns) { handlers.set(`POST ${path}`, [...middlewares, ...fns]); },
  };
  const realLoad = Module._load;
  Module._load = function(name, parent, isMain) {
    if (parent?.filename === routeFile) {
      if (name === 'express') return { Router: () => router };
      if (name === '../models') return models;
      if (name === '../middleware/auth') return {
        authenticate(req, res, next) {
          if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
          return next();
        },
      };
    }
    return realLoad.call(this, name, parent, isMain);
  };
  try {
    delete require.cache[routeFile];
    require(routeFile);
  } finally {
    Module._load = realLoad;
    delete require.cache[routeFile];
  }

  async function send(method, url, user = A, body = {}) {
    const fns = handlers.get(`${method} ${url}`);
    assert.ok(fns, `Missing route ${method} ${url}`);
    const req = { user, body, params: {}, query: {} };
    const headers = {};
    const res = {
      code: 200, body: undefined, headers,
      status(code) { this.code = code; return this; },
      set(key, value) { headers[key] = value; return this; },
      json(payload) { this.body = payload; return this; },
    };
    let nextError = null;
    for (const fn of fns) {
      let nextCalled = false;
      await fn(req, res, (error) => {
        nextCalled = true;
        if (error) nextError = error;
      });
      if (nextError) throw nextError;
      if (res.body !== undefined) break;
      assert.ok(nextCalled, 'Middleware failed to continue or respond.');
    }
    assert.notEqual(res.body, undefined, 'Route did not respond');
    return { code: res.code, body: res.body, headers };
  }
  return { send, rows, setUniqueError: (v) => { uniqueError = v; } };
}

test('Client feedback history returns only own feedback and sanitized studio replies', async () => {
  const { send } = fixture();
  const r = await send('GET', '/', A);
  assert.equal(r.code, 200);
  assert.equal(r.headers['Cache-Control'], 'private, no-store');
  assert.equal(r.body.feedback.length, 1);
  assert.equal(r.body.feedback[0].staff_reply, 'Thank you!');
  assert.equal(r.body.feedback[0].appointment.tracking_number, 'A-DONE');
  for (const secret of ['OTHER_CLIENT_SECRET', 'PRIVATE_REPLY', 'PRIVATE_STAFF_ID', 'SECRET', 'client_id']) {
    assert.ok(!JSON.stringify(r.body).includes(secret), `Leaked ${secret}`);
  }
  assert.equal((await send('GET', '/', B)).body.feedback[0].comment, 'OTHER_CLIENT_SECRET');
});

test('Client-only feedback operations deny Staff, Admin and anonymous access', async () => {
  const { send } = fixture();
  for (const user of [null, { id: CLIENT_A, role: 'admin' }, { id: CLIENT_A, role: 'staff' }]) {
    const code = user ? 403 : 401;
    assert.equal((await send('GET', '/', user)).code, code);
    assert.equal((await send('POST', '/', user, { ...valid, comment: 'Nice' })).code, code);
  }
});

test('Client can submit general studio feedback with five valid 1–5 ratings and a comment', async () => {
  const { send, rows } = fixture();
  const result = await send('POST', '/', A, { ...valid, appointment_id: null, comment: '  Excellent!  ' });
  assert.equal(result.code, 201);
  assert.equal(result.body.feedback.comment, 'Excellent!');
  assert.equal(result.body.feedback.appointment_id, null);
  assert.equal(rows.at(-1).client_id, CLIENT_A);
  assert.ok(!JSON.stringify(result.body).includes('client_id'));
});

test('Client can review only their own completed appointment and only once', async () => {
  const { send, rows } = fixture();
  const r = await send('POST', '/', A, { ...valid, appointment_id: A_DONE2, comment: 'Great' });
  assert.equal(r.code, 201);
  assert.equal(rows.at(-1).appointment_id, A_DONE2);
  assert.equal((await send('POST', '/', A, { ...valid, appointment_id: A_DONE2 })).code, 409);
  assert.equal((await send('POST', '/', A, { ...valid, appointment_id: A_DONE })).code, 409);
});

test('Client cannot review another Client appointment or pending session', async () => {
  const { send, rows } = fixture();
  const size = rows.length;
  assert.equal((await send('POST', '/', A, { ...valid, appointment_id: B_DONE })).code, 404);
  assert.equal((await send('POST', '/', A, { ...valid, appointment_id: A_PENDING })).code, 400);
  assert.equal(rows.length, size);
});

test('Server rejects invalid, missing, fractional, and object-valued rating fields', async () => {
  const { send, rows } = fixture();
  for (const overrides of [
    { rating: 0 }, { rating: 6 }, { rating: 4.3 }, { rating: null },
    { rating: {} }, { rating: [5] }, { staff_service: undefined },
    { cleanliness: 'five' }, { booking_experience: true },
  ]) {
    assert.equal((await send('POST', '/', A, { ...valid, comment: 'Good', ...overrides })).code, 400);
  }
  assert.equal(rows.length, 2);
});

test('General feedback requires a comment; overly long comments and malformed IDs rejected', async () => {
  const { send, rows } = fixture();
  for (const body of [
    { ...valid, comment: '   ' },
    { ...valid, comment: 'x'.repeat(4001) },
    { ...valid, comment: { text: 'not a string' } },
    { ...valid, comment: 'Good', appointment_id: 'bad' },
  ]) {
    assert.equal((await send('POST', '/', A, body)).code, 400);
  }
  assert.equal(rows.length, 2);
});

test('Role, client id, staff reply, timestamp and status injection are all blocked', async () => {
  const { send, rows } = fixture();
  for (const injected of [
    { client_id: CLIENT_B }, { staff_reply: 'FAKE' }, { replied_by: CLIENT_A },
    { role: 'admin' }, { status: 'published' }, { created_at: '2020-01-01' },
    { overall_satisfaction: 5 },
  ]) {
    const r = await send('POST', '/', A, { ...valid, comment: 'Nice', ...injected });
    assert.equal(r.code, 400);
  }
  assert.equal(rows.length, 2);
});

test('Concurrent database unique constraint still prevents duplicate appointment feedback', async () => {
  const { send, setUniqueError } = fixture();
  setUniqueError(true);
  assert.equal((await send('POST', '/', A, { ...valid, appointment_id: A_DONE2 })).code, 409);
});

test('Existing Admin/Staff feedback endpoint registrations are left intact', () => {
  const index = fs.readFileSync(path.resolve(__dirname, '../src/routes/index.js'), 'utf8');
  assert.match(index, /router\.use\('\/feedback', require\('\.\/feedback'\)\)/);
  assert.match(index, /router\.use\('\/client\/feedback', require\('\.\/client-feedback'\)\)/);
});
