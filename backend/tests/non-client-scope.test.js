const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '..', 'src', 'routes');
const content = (name) => fs.readFileSync(path.join(dir, name + '.js'), 'utf8');
test('Client-only routes are not registered', () => {
  assert.doesNotMatch(content('auth'), /router\.post\('\/register'/);
  assert.doesNotMatch(content('appointments'), /router\.post\('\/'/);
  assert.doesNotMatch(content('payments'), /router\.post\('\/'/);
  assert.doesNotMatch(content('feedback'), /router\.post\('\/'/);
  assert.doesNotMatch(content('posts'), /router\.post\('\/:id\/like'/);
  assert.doesNotMatch(content('index'), /public-stats/);
});
test('Admin and Staff operational API routes remain present', () => {
  assert.match(content('appointments'), /router\.post\('\/scan'/);
  assert.match(content('appointments'), /router\.post\('\/:id\/session\/start'/);
  assert.match(content('appointments'), /router\.patch\('\/:id'/);
  assert.match(content('payments'), /router\.patch\('\/:id'/);
  assert.match(content('photo-workflows'), /router\.patch\('\/:id\/assign'/);
  assert.match(content('schedules'), /router\.post\('\/'/);
});
