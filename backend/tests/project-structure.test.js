const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routesRoot = path.resolve(__dirname, '../src/routes');
const registered = {
  auth: 'identity/auth', users: 'identity/users',
  appointments: 'bookings/appointments', availability: 'bookings/availability',
  schedules: 'bookings/schedules', 'photo-workflows': 'bookings/photo-workflows',
  payments: 'billing/payments', packages: 'studio/packages', settings: 'studio/settings',
  posts: 'engagement/posts', feedback: 'engagement/feedback', notifications: 'engagement/notifications',
  analytics: 'insights/analytics', 'activity-logs': 'insights/activity-logs', 'public-stats': 'insights/public-stats',
};

test('all API endpoint registrations retain their original prefix after folder organization', () => {
  const entry = fs.readFileSync(path.join(routesRoot, 'index.js'), 'utf8');
  const lines = [...entry.matchAll(/router\.use\('\/([^']+)',\s*require\('\.\/([^']+)'\)\)/g)];
  assert.equal(lines.length, Object.keys(registered).length);
  for (const [, endpoint, modulePath] of lines) {
    assert.equal(modulePath, registered[endpoint], `API path for ${endpoint} changed`);
    assert.equal(fs.existsSync(path.join(routesRoot, modulePath + '.js')), true);
  }
});

test('all grouped backend route relative imports resolve locally', () => {
  for (const modulePath of Object.values(registered)) {
    const from = path.join(routesRoot, modulePath + '.js');
    const contents = fs.readFileSync(from, 'utf8');
    for (const [, rel] of contents.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const resolved = path.resolve(path.dirname(from), rel);
      assert.ok(fs.existsSync(resolved) || fs.existsSync(resolved + '.js') || fs.existsSync(path.join(resolved, 'index.js')), `Missing ${rel} from ${modulePath}`);
    }
  }
});
