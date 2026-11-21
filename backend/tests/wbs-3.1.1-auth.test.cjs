// WBS 3.1.1: dependency-free mock tests of the exact auth route module.
// This does not connect to a real database or exercise Express over HTTP.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const routePath = path.resolve(__dirname, '../src/routes/auth.js');
const routes = [];
const users = [];
const logs = [];
let idSeq = 0;
const bcrypt = {
  async hash(password, cost) { assert.equal(cost, 12); return `hash::${password}`; },
  async compare(password, hash) { return hash === `hash::${password}`; },
};
function makeUser(obj) {
  return {
    ...obj,
    toJSON() { const { toJSON, ...json } = this; return json; },
  };
}
const User = {
  async findOne({ where }) { return users.find((x) => x.email === where.email) || null; },
  async findByPk(id, opts = {}) {
    const user = users.find((x) => x.id === id);
    if (!user) return null;
    if (opts.attributes?.exclude?.includes('password_hash')) {
      const { password_hash, ...safe } = user.toJSON();
      return safe;
    }
    return user;
  },
  async create(fields) {
    if (users.some((x) => x.email === fields.email)) {
      const err = new Error('unique email'); err.name = 'SequelizeUniqueConstraintError'; throw err;
    }
    const user = makeUser({ id: `user-${++idSeq}`, ...fields });
    users.push(user);
    return user;
  },
};
const ActivityLog = { async create(log) { logs.push(log); } };
const router = {
  post(url, ...handlers) { routes.push({ method: 'post', url, handlers }); },
  get(url, ...handlers) { routes.push({ method: 'get', url, handlers }); },
  patch(url, ...handlers) { routes.push({ method: 'patch', url, handlers }); },
};
const mockDeps = {
  express: { Router: () => router },
  bcryptjs: bcrypt,
  jsonwebtoken: { sign: (payload) => `token:${payload.role}:${payload.id}` },
  '../models': { User, ActivityLog },
  '../middleware/auth': { authenticate: (_req, _res, next) => next(), requireStaffOrAdmin: (_req, _res, next) => next() },
};
const originalLoad = Module._load;
try {
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === routePath && Object.hasOwn(mockDeps, request)) return mockDeps[request];
    return originalLoad.apply(this, arguments);
  };
  require(routePath);
} finally {
  Module._load = originalLoad;
}
function getRoute(method, url) {
  const route = routes.find((r) => r.method === method && r.url === url);
  assert.ok(route, `${method.toUpperCase()} ${url} must exist`);
  return route;
}
async function call(method, url, { body = {}, user, ip = '127.0.0.1' } = {}) {
  const { handlers } = getRoute(method, url);
  const req = { body, user, ip, headers: {} };
  const res = {
    code: 200,
    status(value) { this.code = value; return this; },
    json(value) { this.data = value; return this; },
  };
  for (const handler of handlers) {
    let nextCalled = false;
    let nextErr;
    await handler(req, res, (err) => { nextCalled = true; nextErr = err; });
    if (nextErr) throw nextErr;
    if (res.data !== undefined) break;
    if (!nextCalled) break;
  }
  return res;
}

test('public registration hashes password, normalizes email, forces client role, and hides details', async () => {
  const result = await call('post', '/register', {
    body: { name: '  New  Client ', email: ' NewClient@GMAIL.COM ', mobile: '0912 345 6789', password: 'somePassword8', role: 'admin', is_active: false, password_hash: 'fake' },
  });
  assert.equal(result.code, 201);
  assert.match(result.data.message, /account created/i);
  assert.equal(result.data.user, undefined);
  const user = users[0];
  assert.equal(user.role, 'client');
  assert.equal(user.is_active, true);
  assert.equal(user.name, 'New Client');
  assert.equal(user.email, 'newclient@gmail.com');
  assert.equal(user.mobile, '09123456789');
  assert.equal(user.password_hash, 'hash::somePassword8');
});

test('registration rejects duplicate emails and invalid input', async () => {
  let r = await call('post', '/register', { body: { name: 'Other', email: 'NEWCLIENT@gmail.com', mobile: '09123456789', password: 'anotherpass8' } });
  assert.equal(r.code, 409);
  const invalid = [
    { name: '', email: 'x@gmail.com', mobile: '09123456789', password: 'abcdefgh' },
    { name: 'Valid', email: 'test@example.com', mobile: '09123456789', password: 'abcdefgh' },
    { name: 'Valid', email: 'valid@gmail.com', mobile: 'invalid', password: 'abcdefgh' },
    { name: 'Valid', email: 'valid@gmail.com', mobile: '09123456789', password: 'short' },
    { name: 'Valid', email: 'valid@gmail.com', mobile: '09123456789', password: 'x'.repeat(73) },
  ];
  for (const body of invalid) {
    r = await call('post', '/register', { body });
    assert.equal(r.code, 400, `Rejected: ${JSON.stringify({ ...body, password: '[REDACTED]' })}`);
  }
});

test('client login issues JWT; /me returns profile without password hash', async () => {
  const login = await call('post', '/login', { body: { email: 'NewClient@gmail.com', password: 'somePassword8' } });
  assert.equal(login.code, 200);
  assert.equal(login.data.user.role, 'client');
  assert.equal(login.data.user.password_hash, undefined);
  assert.equal(login.data.token, `token:client:${users[0].id}`);
  const me = await call('get', '/me', { user: { id: users[0].id, role: 'client' } });
  assert.equal(me.code, 200);
  assert.equal(me.data.user.role, 'client');
  assert.equal(me.data.user.password_hash, undefined);
  assert.equal(logs.length, 0);
});

test('login rejects wrong password and disabled account', async () => {
  let r = await call('post', '/login', { body: { email: 'NewClient@gmail.com', password: 'wrong' } });
  assert.equal(r.code, 401);
  users[0].is_active = false;
  r = await call('post', '/login', { body: { email: 'NewClient@gmail.com', password: 'somePassword8' } });
  assert.equal(r.code, 403);
  users[0].is_active = true;
});

test('Admin and Staff login keep their old activity log actions', async () => {
  users.push(makeUser({ id: 'admin-1', name: 'Owner', email: 'owner@studio.com', password_hash: 'hash::adminStrong8', role: 'admin', is_active: true }));
  users.push(makeUser({ id: 'staff-1', name: 'Staff', email: 'staff@studio.com', password_hash: 'hash::staffStrong8', role: 'staff', is_active: true }));
  const admin = await call('post', '/login', { body: { email: 'owner@studio.com', password: 'adminStrong8' } });
  const staff = await call('post', '/login', { body: { email: 'staff@studio.com', password: 'staffStrong8' } });
  assert.equal(admin.code, 200);
  assert.equal(staff.code, 200);
  assert.deepEqual(logs.map((log) => log.action), ['ADMIN_LOGIN', 'STAFF_LOGIN']);
});

test('Staff/Admin-only profile and password routes keep requireStaffOrAdmin middleware', () => {
  const staffGuard = mockDeps['../middleware/auth'].requireStaffOrAdmin;
  assert.ok(getRoute('patch', '/profile').handlers.includes(staffGuard));
  assert.ok(getRoute('patch', '/password').handlers.includes(staffGuard));
});
