const test = require('node:test');
const assert = require('node:assert/strict');
const { makeBookingQR, parseBookingQR, hasVerifiedDownPayment, sessionStartError } = require('../src/utils/bookingQr');
const secret = 'a-test-only-strong-secret-not-for-production';
const a = { id: '56b64567-6b74-4e9f-a3d0-905e84f44800', tracking_number: 'SP-2026-0001', date: '2026-11-20', status: 'confirmed', payment_status: 'partially_paid', amount_paid: 500, down_payment: 500 };
test('unique QR can be scanned; tampering is rejected', () => {
  const qr = makeBookingQR(a, secret);
  assert.deepEqual(parseBookingQR(qr, secret), { id:a.id, tracking_number:a.tracking_number });
  assert.equal(parseBookingQR(qr.replace('0001', '0002'), secret), null);
  assert.equal(parseBookingQR(qr.slice(0,-1)+'! ', secret), null);
  assert.notEqual(makeBookingQR({...a, id:'56b64567-6b74-4e9f-a3d0-905e84f44801'}, secret), qr);
});
test('starting session requires confirmed booking, verified payment and today', () => {
  assert.equal(hasVerifiedDownPayment(a), true);
  assert.equal(sessionStartError(a, '2026-11-20'), null);
  assert.match(sessionStartError({ ...a, status:'now_serving' }, '2026-11-20'), /already started/i);
  assert.match(sessionStartError({...a, payment_status:'payment_submitted'}, '2026-11-20'), /verify/i);
  assert.match(sessionStartError({...a, amount_paid:200}, '2026-11-20'), /verify/i);
  assert.match(sessionStartError(a, '2026-11-21'), /scheduled/i);
  assert.match(sessionStartError({...a, status:'pending'}, '2026-11-20'), /confirmed/i);
});

test('booking confirmation QR is signed and tamper-proof', () => {
  const qr = makeBookingQR(a, secret);
  assert.ok(qr.startsWith('SP-STUDIO|'));
  assert.equal(qr.split('|').length, 4);
  assert.equal(parseBookingQR(`SP-STUDIO|${a.tracking_number}|${a.id}`, secret), null);
  assert.notEqual(qr, `SP-STUDIO|${a.tracking_number}|${a.id}`);
});
