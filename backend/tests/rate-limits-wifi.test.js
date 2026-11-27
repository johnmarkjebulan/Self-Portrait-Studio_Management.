const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createRequestLimiters, READ_LIMIT, WRITE_LIMIT, AUTH_FAILED_LIMIT, isReadMethod } = require('../src/utils/requestLimits');

function captureOptions() {
  const options = [];
  createRequestLimiters((config) => { options.push(config); return () => {}; }, 'development');
  return { auth: options[0], read: options[1], write: options[2] };
}

test('in development, normal feedback and payment GET calls cannot be locked out by global per-IP limit', () => {
  const { auth, read, write } = captureOptions();
  assert.equal(READ_LIMIT, 6000);
  assert.equal(WRITE_LIMIT, 300);
  assert.equal(AUTH_FAILED_LIMIT, 30);
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(isReadMethod(method), true);
    assert.equal(read.skip({ method }), true);
    assert.equal(write.skip({ method }), true);
  }
  assert.equal(auth.skipSuccessfulRequests, true);
  assert.equal(typeof auth.message.error, 'string');
});

test('production GETs retain a high rate limit; writes cannot exhaust the reads budget', () => {
  const configs = [];
  createRequestLimiters((config) => { configs.push(config); return () => {}; }, 'production');
  const read = configs[1];
  const write = configs[2];
  assert.equal(read.skip({ method: 'GET' }), false);
  assert.equal(read.skip({ method: 'POST' }), true);
  assert.equal(write.skip({ method: 'GET' }), true);
  assert.equal(write.skip({ method: 'POST' }), false);
  assert.ok(read.limit >= 3000);
  assert.equal(read.windowMs, 15*60*1000);
  assert.equal(write.windowMs, read.windowMs);
});

test('Vite binds Wi-Fi only and excludes Ethernet, link-local, external and virtual adapters', async () => {
  const src = path.resolve(__dirname, '../../frontend/wifi-host.js');
  const { pickWifiHost, isPrivateIpv4 } = await import(pathToFileURL(src).href);
  const adapters = {
    'Ethernet 2': [{ family: 'IPv4', address: '169.254.77.219', internal: false }],
    'Wi-Fi': [{ family: 'IPv6', address: 'fe80::1', internal: false }, { family: 'IPv4', address: '192.168.254.105', internal: false }],
    'vEthernet (Default Switch)': [{ family: 'IPv4', address: '172.19.12.3', internal: false }],
    'Loopback': [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  };
  assert.equal(pickWifiHost(adapters, ''), '192.168.254.105');
  assert.equal(pickWifiHost({ 'Ethernet 2': adapters['Ethernet 2'] }, ''), '127.0.0.1');
  assert.equal(pickWifiHost(adapters, '192.168.254.104'), '192.168.254.104');
  assert.equal(isPrivateIpv4('169.254.77.219'), false);
  assert.equal(isPrivateIpv4('8.8.8.8'), false);
  assert.equal(isPrivateIpv4('192.168.254.105'), true);
  assert.throws(() => pickWifiHost(adapters, '0.0.0.0'), /POSE_VITE_HOST/);
});

test('429 responses are actionable and backend binds to loopback behind Wi-Fi Vite proxy', () => {
  const fs = require('node:fs');
  const base = path.resolve(__dirname, '../..');
  const api = fs.readFileSync(path.join(base, 'frontend/src/services/api.js'), 'utf8');
  const server = fs.readFileSync(path.join(base, 'backend/src/server.js'), 'utf8');
  const vite = fs.readFileSync(path.join(base, 'frontend/vite.config.js'), 'utf8');
  assert.match(api, /res\.status === 429/);
  assert.match(api, /retry-after/);
  assert.match(server, /const host = serverHost\(\)/);
  assert.match(server, /app\.listen\(PORT, host/);
  const { serverHost } = require('../src/utils/serverHost');
  assert.equal(serverHost('development'), '127.0.0.1');
  assert.equal(serverHost('production'), '0.0.0.0');
  assert.match(vite, /host:\s*true/);
  assert.doesNotMatch(vite, /host:\s*'0\.0\.0\.0'/);
});
