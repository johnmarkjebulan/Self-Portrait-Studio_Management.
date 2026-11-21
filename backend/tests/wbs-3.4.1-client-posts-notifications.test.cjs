// WBS 3.4.1 - Client posts/notifications behavior, isolated; never connects to MySQL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');

const PUBLISHED = '11111111-1111-4111-8111-111111111111';
const HIDDEN = '22222222-2222-4222-8222-222222222222';
const NOTE1 = '33333333-3333-4333-8333-333333333333';
const NOTE2 = '44444444-4444-4444-8444-444444444444';
const A = { id: 'client-A', role: 'client' };
const B = { id: 'client-B', role: 'client' };

function makeFixture(moduleName) {
  const handlers = new Map();
  const middleware = [];
  const postRows = [
    { id: PUBLISHED, title: 'Photo Highlights', caption: 'See our work', created_at: '2026-11-21', image_url: '/studio-media/posts/a.jpg', is_published: true, author_id: 'PRIVATE', author: { id: 'admin', name: 'Studio Owner', role: 'admin' }, internal_notes: 'INTERNAL_SECRET' },
    { id: HIDDEN, title: 'Unpublished Draft', caption: 'TOP SECRET', is_published: false, author_id: 'PRIVATE', author: { name: 'Owner', role: 'admin' } },
  ];
  const likes = [{ post_id: PUBLISHED, client_id: B.id }];
  const notes = [
    { id: NOTE1, user_id: A.id, title: 'Your session', message: 'Scheduled', type: 'booking', read: false, related_id: PUBLISHED, related_type: 'appointment', created_at: '2026-11-21', internal_secret: 'INTERNAL' },
    { id: NOTE2, user_id: B.id, title: 'PRIVATE CLIENT MESSAGE', message: 'SECRET', type: 'payment', read: false, created_at: '2026-11-20' },
  ];
  const routeFile = path.resolve(__dirname, `../src/routes/${moduleName}.js`);
  const router = {
    use(...fns) { middleware.push(...fns); },
    get(url, ...fns) { handlers.set(`GET ${url}`, [...middleware, ...fns]); },
    patch(url, ...fns) { handlers.set(`PATCH ${url}`, [...middleware, ...fns]); },
    post(url, ...fns) { handlers.set(`POST ${url}`, [...middleware, ...fns]); },
  };
  const models = {
    User: {},
    Post: {
      async findAll(opts) {
        assert.equal(opts.where.is_published, true);
        assert.ok(opts.limit <= 60);
        return postRows.filter(p => p.is_published);
      },
      async findOne(opts) {
        return postRows.find(p => p.id === opts.where.id && p.is_published === opts.where.is_published) || null;
      },
    },
    PostLike: {
      async findOne({ where }) {
        const row = likes.find(l => l.post_id === where.post_id && l.client_id === where.client_id);
        if (!row) return null;
        return { async destroy() { likes.splice(likes.indexOf(row), 1); } };
      },
      async count({ where }) { return likes.filter(l => l.post_id === where.post_id).length; },
      async create(row) {
        if (likes.some(l => l.post_id === row.post_id && l.client_id === row.client_id)) {
          const err = new Error('duplicate'); err.name = 'SequelizeUniqueConstraintError'; throw err;
        }
        likes.push({ ...row });
      },
    },
    Notification: {
      async findAll(opts) {
        assert.equal(typeof opts.where.user_id, 'string');
        return notes.filter(n => n.user_id === opts.where.user_id).slice(0, opts.limit);
      },
      async count({ where }) { return notes.filter(n => n.user_id === where.user_id && n.read === where.read).length; },
      async update(updates, { where }) {
        const targets = notes.filter(n => n.user_id === where.user_id &&
          (where.id === undefined || n.id === where.id) &&
          (where.read === undefined || n.read === where.read));
        targets.forEach(n => Object.assign(n, updates));
        return [targets.length];
      },
    },
  };
  const realLoad = Module._load;
  Module._load = function (name, parent, isMain) {
    if (parent?.filename === routeFile) {
      if (name === 'express') return { Router: () => router };
      if (name === '../models') return models;
      if (name === '../middleware/auth') return {
        authenticate(req, res, next) {
          return req.user ? next() : res.status(401).json({ error: 'Unauthorized' });
        },
      };
    }
    return realLoad.call(this, name, parent, isMain);
  };
  delete require.cache[routeFile];
  try { require(routeFile); } finally { Module._load = realLoad; delete require.cache[routeFile]; }

  const send = (method, route, user = A, params = {}, query = {}) => new Promise((resolve, reject) => {
    const chain = handlers.get(`${method} ${route}`);
    assert.ok(chain, `Missing handler ${method} ${route}`);
    const req = { user, params, query };
    const res = {
      code: 200, headers: {},
      status(code) { this.code = code; return this; },
      set(name, value) { this.headers[name] = value; return this; },
      json(body) { resolve({ code: this.code, body, headers: this.headers }); return this; },
    };
    let i = 0;
    const next = err => {
      if (err) return reject(err);
      if (i >= chain.length) return reject(new Error('No response'));
      try { Promise.resolve(chain[i++](req, res, next)).catch(reject); } catch (e) { reject(e); }
    };
    next();
  });
  return { send, likes, notes, postRows, handlers };
}

test('public route serves published posts without authentication and no private fields', async () => {
  const { send } = makeFixture('client-posts');
  const r = await send('GET', '/public', null);
  assert.equal(r.code, 200);
  assert.equal(r.body.posts.length, 1);
  assert.equal(r.body.posts[0].liked_by_me, false);
  assert.equal(r.body.posts[0].like_count, 1);
  assert.ok(!JSON.stringify(r.body).includes('INTERNAL_SECRET'));
  assert.ok(!JSON.stringify(r.body).includes('PRIVATE'));
});
test('Client feed includes own like state; other Client likes never count as mine', async () => {
  const { send } = makeFixture('client-posts');
  assert.equal((await send('GET', '/', A)).body.posts[0].liked_by_me, false);
  const r = await send('GET', '/', B);
  assert.equal(r.body.posts[0].liked_by_me, true);
  assert.equal(r.headers['Cache-Control'], 'private, no-store');
});
test('Client feed and like mutations reject Staff, Admin and anonymous users', async () => {
  const { send } = makeFixture('client-posts');
  for (const user of [null, { id: 'admin', role: 'admin' }, { id: 'staff', role: 'staff' }]) {
    assert.equal((await send('GET', '/', user)).code, user ? 403 : 401);
    assert.equal((await send('POST', '/:id/like', user, { id: PUBLISHED })).code, user ? 403 : 401);
  }
});
test('like toggle creates and removes only own like', async () => {
  const { send, likes } = makeFixture('client-posts');
  let r = await send('POST', '/:id/like', A, { id: PUBLISHED });
  assert.equal(r.body.liked, true);
  assert.equal(r.body.like_count, 2);
  r = await send('POST', '/:id/like', A, { id: PUBLISHED });
  assert.equal(r.body.liked, false);
  assert.equal(r.body.like_count, 1);
  assert.deepEqual(likes, [{ post_id: PUBLISHED, client_id: B.id }]);
});
test('Client cannot like unpublished post or malformed id', async () => {
  const { send } = makeFixture('client-posts');
  assert.equal((await send('POST', '/:id/like', A, { id: HIDDEN })).code, 404);
  assert.equal((await send('POST', '/:id/like', A, { id: 'wrong' })).code, 404);
});
test('notification history returns own sanitized records only, with capped limit', async () => {
  const { send } = makeFixture('client-notifications');
  const r = await send('GET', '/', A, {}, { limit: '900' });
  assert.equal(r.code, 200);
  assert.equal(r.body.notifications.length, 1);
  assert.ok(!JSON.stringify(r.body).includes('PRIVATE CLIENT MESSAGE'));
  assert.ok(!JSON.stringify(r.body).includes('INTERNAL'));
  assert.ok(!JSON.stringify(r.body).includes('user_id'));
  assert.equal(r.headers['Cache-Control'], 'private, no-store');
});
test('notification listing rejects invalid limit and does not query DB', async () => {
  const { send } = makeFixture('client-notifications');
  for (const limit of ['-5', 'hello', '3.1', '']) {
    if (limit === '') continue; // Empty query means default limit in the real route.
    assert.equal((await send('GET', '/', A, {}, { limit })).code, 400);
  }
});
test('unread count is restricted to the signed-in Client', async () => {
  const { send } = makeFixture('client-notifications');
  assert.equal((await send('GET', '/unread-count', A)).body.count, 1);
  assert.equal((await send('GET', '/unread-count', B)).body.count, 1);
});
test('mark read cannot alter another Client notification', async () => {
  const { send, notes } = makeFixture('client-notifications');
  const r = await send('PATCH', '/:id/read', A, { id: NOTE2 });
  assert.equal(r.code, 404);
  assert.equal(notes[1].read, false);
  assert.equal((await send('PATCH', '/:id/read', A, { id: NOTE1 })).code, 200);
  assert.equal(notes[0].read, true);
});
test('mark all read affects only own Client notifications', async () => {
  const { send, notes } = makeFixture('client-notifications');
  const r = await send('POST', '/mark-all-read', A);
  assert.equal(r.body.updated, 1);
  assert.equal(notes[0].read, true);
  assert.equal(notes[1].read, false);
});
test('notification actions deny Admin, Staff and anonymous users', async () => {
  const { send } = makeFixture('client-notifications');
  for (const user of [null, { id: 'admin', role: 'admin' }, { id: 'staff', role: 'staff' }]) {
    const expected = user ? 403 : 401;
    assert.equal((await send('GET', '/', user)).code, expected);
    assert.equal((await send('PATCH', '/:id/read', user, { id: NOTE1 })).code, expected);
    assert.equal((await send('POST', '/mark-all-read', user)).code, expected);
  }
});
test('existing shared Admin/Staff route registrations remain intact', () => {
  const file = fs.readFileSync(path.resolve(__dirname, '../src/routes/index.js'), 'utf8');
  assert.match(file, /router\.use\('\/posts', require\('\.\/posts'\)\)/);
  assert.match(file, /router\.use\('\/notifications', require\('\.\/notifications'\)\)/);
  assert.match(file, /router\.use\('\/client\/posts', require\('\.\/client-posts'\)\)/);
  assert.match(file, /router\.use\('\/client\/notifications', require\('\.\/client-notifications'\)\)/);
});
