// WBS 3.3.3 — isolated HTTP-route behavior tests, no database writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const OWN = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CLIENT = { id: 'client-one', role: 'client' };

function fixture({ appointmentStatus = 'completed', stage = 'editing', url = 'https://studio.example/gallery', otherStage = 'released' } = {}) {
  const handlers = new Map();
  const middleware = [];
  const rows = [
    {
      id: OWN, client_id: CLIENT.id, status: appointmentStatus,
      tracking_number: 'SP-2026-001', date: '2026-12-01', time: '09:00',
      package: { name: 'Portrait' },
      photoWorkflow: { stage, gallery_url: url, internal_notes: 'SECRET CLIENT NOTE',
        assigned_staff_id: 'private-user-id', ready_at: '2026-11-20', released_at: '2026-11-21' },
    },
    {
      id: OTHER, client_id: 'client-two', status: 'completed',
      tracking_number: 'SP-SECRET', package: { name: 'Private' },
      photoWorkflow: { stage: otherStage, gallery_url: 'https://studio.example/secret' },
    },
  ];
  const express = { Router: () => ({
    use(...fns) { middleware.push(...fns); },
    get(url, fn) { handlers.set(`GET ${url}`, fn); },
  }) };
  const models = {
    Appointment: {
      async findAll(opts) {
        assert.deepEqual(Object.keys(opts.where), ['client_id']);
        return rows.filter(a => a.client_id === opts.where.client_id);
      },
      async findOne(opts) {
        assert.equal(opts.where.client_id, CLIENT.id);
        return rows.find(a => a.client_id === opts.where.client_id && a.id === opts.where.id) || null;
      },
    },
    PhotoWorkflow: {}, Package: {},
  };
  const routeFile = path.resolve(__dirname, '../src/routes/client-photo-status.js');
  const original = Module._load;
  Module._load = function (name, parent, main) {
    if (parent?.filename === routeFile) {
      if (name === 'express') return express;
      if (name === '../models') return models;
      if (name === '../middleware/auth') return {
        authenticate(req, res, next) { if (!req.user) return res.status(401).json({ error: 'Unauthorized' }); next(); },
      };
      if (name === '../utils/photoWorkflow') return {
        isSafeGalleryUrl(value) {
          try { const u = new URL(value); return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password; }
          catch { return false; }
        },
      };
    }
    return original.call(this, name, parent, main);
  };
  delete require.cache[routeFile];
  try { require(routeFile); } finally { Module._load = original; delete require.cache[routeFile]; }
  const request = (url, user = CLIENT, params = {}) => new Promise((resolve, reject) => {
    const handler = handlers.get(`GET ${url}`);
    assert.ok(handler, `Missing route GET ${url}`);
    const req = { user, params };
    const res = {
      code: 200, headers: {}, status(code) { this.code = code; return this; },
      set(name, value) { this.headers[name] = value; return this; },
      json(body) { resolve({ code: this.code, body, headers: this.headers }); return this; },
    };
    let i = 0;
    const chain = [...middleware, handler];
    const next = err => {
      if (err) return reject(err);
      try { Promise.resolve(chain[i++](req, res, next)).catch(reject); }
      catch (e) { reject(e); }
    };
    next();
  });
  return { request, rows };
}

test('Client sees only own photo statuses, with no cache', async () => {
  const { request } = fixture();
  const response = await request('/');
  assert.equal(response.code, 200);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(response.body.photoStatuses.length, 1);
  assert.equal(response.body.photoStatuses[0].tracking_number, 'SP-2026-001');
});
test('Client-only access; Admin/Staff/anonymous cannot view', async () => {
  const { request } = fixture();
  assert.equal((await request('/', null)).code, 401);
  assert.equal((await request('/', { id: 'admin', role: 'admin' })).code, 403);
  assert.equal((await request('/', { id: 'staff', role: 'staff' })).code, 403);
});
test('Other Client appointment and invalid IDs return 404', async () => {
  const { request } = fixture();
  assert.equal((await request('/:id', CLIENT, { id: OTHER })).code, 404);
  assert.equal((await request('/:id', CLIENT, { id: 'not-a-uuid' })).code, 404);
  assert.equal((await request('/:id', CLIENT, { id: OWN })).code, 200);
});
test('No internal notes, staff IDs, or unreleased gallery leak', async () => {
  const { request } = fixture();
  const data = (await request('/')).body.photoStatuses[0];
  assert.equal(data.photo_status, 'editing');
  assert.equal(data.gallery_url, null);
  assert.equal(data.gallery_available, false);
  assert.equal(JSON.stringify(data).includes('SECRET'), false);
  assert.equal(JSON.stringify(data).includes('private-user-id'), false);
});
test('Maps session in progress, completed, editing and ready for release accurately', async () => {
  for (const [appointmentStatus, stage, expected] of [
    ['now_serving', 'awaiting_session', 'in_progress'],
    ['checked_in', 'awaiting_session', 'waiting'],
    ['confirmed', 'released', 'scheduled'],
    ['pending', 'editing', 'pending'],
    ['completed', null, 'session_completed'],
    ['completed', 'awaiting_session', 'session_completed'],
    ['completed', 'editing', 'editing'],
    ['completed', 'ready_for_release', 'ready_for_release'],
    ['cancelled', 'released', 'unavailable'],
  ]) {
    const { request, rows } = fixture({ appointmentStatus, stage });
    if (stage === null) rows[0].photoWorkflow = null;
    const result = (await request('/')).body.photoStatuses[0];
    assert.equal(result.photo_status, expected, `${appointmentStatus} / ${stage}`);
    assert.equal(result.gallery_url, null);
  }
});
test('Gallery link appears ONLY when released after completed session', async () => {
  const { request } = fixture({ appointmentStatus: 'completed', stage: 'released' });
  const row = (await request('/:id', CLIENT, { id: OWN })).body.photoStatus;
  assert.equal(row.gallery_available, true);
  assert.equal(row.gallery_url, 'https://studio.example/gallery');
  assert.equal(row.released_at, '2026-11-21');
});
test('Unsafe or empty gallery URL remains hidden even in released stage', async () => {
  for (const url of ['javascript:alert(1)', 'http://example.com', '', 'https://user:pass@example.com/']) {
    const { request } = fixture({ stage: 'released', url });
    const result = (await request('/')).body.photoStatuses[0];
    assert.equal(result.gallery_url, null);
    assert.equal(result.gallery_available, false);
  }
});
test('Invalid stage never grants gallery access', async () => {
  const { request } = fixture({ stage: 'invalid_stage' });
  const result = (await request('/')).body.photoStatuses[0];
  assert.equal(result.photo_status, 'session_completed');
  assert.equal(result.gallery_url, null);
});
test('Only GET endpoints are exposed for Client photo status', () => {
  const f = fixture();
  assert.ok(f.request);
  // Router fixture deliberately implements only read-only .get; any .post/.patch would fail during loading.
});
