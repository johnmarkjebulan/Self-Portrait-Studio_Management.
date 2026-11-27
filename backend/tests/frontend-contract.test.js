const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const base = path.resolve(__dirname, '../../frontend/src');
const read = name => fs.readFileSync(path.join(base, name), 'utf8');

test('client check-in QR uses server-signed payload and not an unsigned local string', () => {
  const booking = read('pages/client/Book.jsx');
  assert.match(booking, /const qrValue = appt\.qr_payload/);
  assert.doesNotMatch(booking, /`SP-STUDIO\|\$\{appt\.tracking_number\}/);
});
test('client payment pages show only uploaded official QR images', () => {
  assert.match(read('pages/client/Book.jsx'), /<StudioPaymentQR/);
  assert.match(read('pages/client/Payments.jsx'), /<StudioPaymentQR/);
  assert.match(read('pages/admin/Settings.jsx'), /settingsApi\.uploadPaymentQr/);
});
