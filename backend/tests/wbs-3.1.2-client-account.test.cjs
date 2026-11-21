// WBS 3.1.2 isolated route checks. These use mocks and DO NOT touch MySQL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function createSuite() {
  const calls = [];
  const users = [
    { id: 'client-one', role: 'client', name: '  Ana ', email: 'ana@gmail.com', mobile: '09111111111', password_hash: 'hash:old-password', is_active: true },
    { id: 'client-two', role: 'client', name: 'Bob', email: 'bob@gmail.com', mobile: '09222222222', password_hash: 'hash:other-password', is_active: true },
  ];
  const appointments = [
    { id: 'a1', client_id: 'client-one', tracking_number: 'SP-2026-0001', date: '2026-11-23', time: '13:00', status: 'confirmed', payment_status: 'payment_required', total_price: '1500', amount_paid: '0', remaining_balance: '1500', queue_number: null, created_at: '2026-11-20T10:00:00Z', package: { id: 'pkg1', name: 'Solo' } },
    { id: 'a2', client_id: 'client-one', tracking_number: 'SP-2026-0002', date: '2026-11-18', time: '10:00', status: 'completed', payment_status: 'verified', total_price: '1500', amount_paid: '1500', remaining_balance: '0', queue_number: null, created_at: '2026-11-18T10:00:00Z', package: { id: 'pkg1', name: 'Solo' } },
    { id: 'other', client_id: 'client-two', tracking_number: 'SP-2026-0999', date: '2026-11-25', time: '14:00', status: 'confirmed', payment_status: 'payment_required', total_price: '99999', amount_paid: '0', remaining_balance: '99999', queue_number: 3, created_at: '2026-11-21T10:00:00Z', package: { id: 'pkg2', name: 'Other' } },
  ];
  const notifications = [
    { id: 'n1', user_id: 'client-one', title: 'Your booking is confirmed', message: 'Ready for your session', read: false, type: 'booking', created_at: '2026-11-20T11:00:00Z' },
    { id: 'n2', user_id: 'client-two', title: 'Private message', message: 'Not for Ana', read: false, type: 'system', created_at: '2026-11-21T11:00:00Z' },
  ];
  const payments = [
    { client_id: 'client-one', status: 'verified', amount: '500' },
    { client_id: 'client-one', status: 'payment_submitted', amount: '800' },
    { client_id: 'client-two', status: 'verified', amount: '99999' },
  ];
  const asUser = (data) => data && ({
    ...data,
    toJSON() { return { ...data }; },
    async update(change) { Object.assign(data, change); return this; },
  });

  const models = {
    User: {
      async findOne({ where }) {
        calls.push(['User.findOne', where]);
        return asUser(users.find(u => u.id === where.id && u.role === where.role && u.is_active === where.is_active) || null);
      },
    },
    Appointment: {
      async findAll({ where }) {
        calls.push(['Appointment.findAll', where]);
        return appointments.filter(a => Object.keys(where).every(k => a[k] === where[k])).map(a => ({ toJSON: () => ({ ...a }) }));
      },
    },
    Package: {},
    Payment: {
      async sum(field, { where }) {
        calls.push(['Payment.sum', where]);
        return payments.filter(p => Object.keys(where).every(k => p[k] === where[k]))
          .reduce((total, p) => total + Number(p[field]), 0);
      },
    },
    Notification: {
      async count({ where }) {
        calls.push(['Notification.count', where]);
        return notifications.filter(n => Object.keys(where).every(k => n[k] === where[k])).length;
      },
      async findAll({ where, limit }) {
        calls.push(['Notification.findAll', where]);
        return notifications.filter(n => Object.keys(where).every(k => n[k] === where[k]))
          .slice(0, limit).map(n => ({ toJSON: () => ({ ...n }) }));
      },
    },
  };

  const router = {
    middlewares: [], handlers: new Map(),
    use(...fns) { this.middlewares.push(...fns); return this; },
    get(url, handler) { this.handlers.set(`GET ${url}`, handler); return this; },
    patch(url, handler) { this.handlers.set(`PATCH ${url}`, handler); return this; },
  };
  const routePath = path.resolve(__dirname, '../src/routes/client-account.js');
  const saved = Module._load;
  Module._load = function (name, parent, isMain) {
    if (parent?.filename === routePath) {
      if (name === 'express') return { Router: () => router };
      if (name === 'bcryptjs') return {
        compare: async (plain, hashed) => hashed === `hash:${plain}`,
        hash: async (plain, cost) => { assert.equal(cost, 12); return `hash:${plain}`; },
      };
      if (name === '../models') return models;
      if (name === '../middleware/auth') return {
        authenticate(req, res, next) {
          if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
          return next();
        },
      };
      if (name === '../utils/dateTime') return { dateKeyInTimeZone: () => '2026-11-21' };
    }
    return saved.call(this, name, parent, isMain);
  };
  delete require.cache[routePath];
  try { require(routePath); }
  finally { Module._load = saved; delete require.cache[routePath]; }

  async function request(method, url, user, body = {}) {
    const handler = router.handlers.get(`${method} ${url}`);
    assert.ok(handler, `Missing route ${method} ${url}`);
    const req = { user, body };
    return await new Promise((resolve, reject) => {
      const res = {
        code: 200,
        status(code) { this.code = code; return this; },
        json(payload) { resolve({ status: this.code, body: payload }); return this; },
      };
      const chain = [...router.middlewares, handler];
      let i = 0;
      const next = (error) => {
        if (error) return reject(error);
        const callback = chain[i++];
        if (!callback) return resolve({ status: res.code, body: null });
        try { Promise.resolve(callback(req, res, next)).catch(reject); }
        catch (err) { reject(err); }
      };
      next();
    });
  }
  return { request, calls, users, appointments };
}

const clientOne = { id: 'client-one', role: 'client' };
const clientTwo = { id: 'client-two', role: 'client' };

test('dashboard overview is scoped to the authenticated client and includes correct summaries', async () => {
  const { request, calls } = createSuite();
  const result = await request('GET', '/overview', clientOne);
  assert.equal(result.status, 200);
  assert.equal(result.body.summary.totalBookings, 2);
  assert.equal(result.body.summary.upcomingBookings, 1);
  assert.equal(result.body.summary.completed, 1);
  assert.equal(result.body.summary.pendingPayments, 1);
  assert.equal(result.body.summary.totalSpent, 500);
  assert.equal(result.body.summary.unreadNotifications, 1);
  assert.equal(result.body.nextSession.id, 'a1');
  assert.equal(result.body.recentBookings.some(a => a.id === 'other'), false);
  assert.equal(result.body.recentNotifications.some(n => n.id === 'n2'), false);
  assert.equal('password_hash' in result.body.user, false);
  const targetQueries = ['Appointment.findAll', 'Payment.sum', 'Notification.count', 'Notification.findAll'];
  for (const [name, where] of calls.filter(call => targetQueries.includes(call[0]))) {
    assert.equal(where[name.startsWith('Notification.') ? 'user_id' : 'client_id'], clientOne.id, `${name} must filter by client ID`);
  }
});

test('a different client sees only their own dashboard details', async () => {
  const { request } = createSuite();
  const result = await request('GET', '/overview', clientTwo);
  assert.equal(result.status, 200);
  assert.equal(result.body.summary.totalBookings, 1);
  assert.equal(result.body.nextSession.id, 'other');
  assert.equal(result.body.summary.totalSpent, 99999);
  assert.equal(result.body.recentNotifications[0].id, 'n2');
});

test('Admin, Staff, and missing authentication are blocked from Client routes', async () => {
  const { request, calls } = createSuite();
  for (const role of ['admin', 'staff']) {
    const response = await request('GET', '/overview', { id: role, role });
    assert.equal(response.status, 403);
  }
  const noToken = await request('GET', '/overview', null);
  assert.equal(noToken.status, 401);
  assert.equal(calls.length, 0);
});

test('Client can update own name/mobile and receives a sanitized profile', async () => {
  const { request, users } = createSuite();
  const result = await request('PATCH', '/profile', clientOne, { name: '  Ana   Reyes ', mobile: '0912 345 6789' });
  assert.equal(result.status, 200);
  assert.equal(result.body.user.name, 'Ana Reyes');
  assert.equal(result.body.user.mobile, '09123456789');
  assert.equal('password_hash' in result.body.user, false);
  assert.equal(users[0].role, 'client');
  assert.equal(users[1].name, 'Bob');
});

test('Client profile updates reject role escalation and invalid data', async () => {
  const { request } = createSuite();
  assert.equal((await request('PATCH', '/profile', clientOne, { role: 'admin' })).status, 400);
  assert.equal((await request('PATCH', '/profile', clientOne, { is_active: false })).status, 400);
  assert.equal((await request('PATCH', '/profile', clientOne, { mobile: '1234' })).status, 400);
  assert.equal((await request('PATCH', '/profile', clientOne, { name: '' })).status, 400);
  assert.equal((await request('PATCH', '/profile', clientOne, {})).status, 400);
});

test('Client password change verifies current password and bcrypt-hashes the new password', async () => {
  const { request, users } = createSuite();
  const wrong = await request('PATCH', '/password', clientOne, { currentPassword: 'wrong', newPassword: 'newpassword1' });
  assert.equal(wrong.status, 400);
  assert.equal(users[0].password_hash, 'hash:old-password');
  const valid = await request('PATCH', '/password', clientOne, { currentPassword: 'old-password', newPassword: 'newpassword1' });
  assert.equal(valid.status, 200);
  assert.equal(valid.body.success, true);
  assert.equal(users[0].password_hash, 'hash:newpassword1');
  assert.equal(users[1].password_hash, 'hash:other-password');
});

test('Client password change rejects weak, unchanged, and oversized passwords', async () => {
  const { request } = createSuite();
  assert.equal((await request('PATCH', '/password', clientOne, { currentPassword: 'old-password', newPassword: '1234' })).status, 400);
  assert.equal((await request('PATCH', '/password', clientOne, { currentPassword: 'old-password', newPassword: 'old-password' })).status, 400);
  assert.equal((await request('PATCH', '/password', clientOne, { currentPassword: 'old-password', newPassword: '😀'.repeat(19) })).status, 400);
});
