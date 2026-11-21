// Stateless signed QR: existing appointment rows do not need a database migration.
const crypto = require('node:crypto');
const PREFIX = 'SP-STUDIO';
const VERIFIED_PAYMENT_STATES = ['verified', 'partially_paid', 'fully_paid'];

function signature(id, trackingNumber, secret = process.env.JWT_SECRET) {
  if (!secret) throw new Error('Missing JWT_SECRET');
  return crypto.createHmac('sha256', secret)
    .update(`${PREFIX}|${trackingNumber}|${id}`).digest('base64url');
}
function makeBookingQR(appt, secret = process.env.JWT_SECRET) {
  return `${PREFIX}|${appt.tracking_number}|${appt.id}|${signature(appt.id, appt.tracking_number, secret)}`;
}
function parseBookingQR(payload, secret = process.env.JWT_SECRET) {
  if (typeof payload !== 'string' || payload.length > 300) return null;
  const parts = payload.trim().split('|');
  if (parts.length !== 4 || parts[0] !== PREFIX || !/^SP-\d{4}-\d+$/.test(parts[1]) || !/^[0-9a-f-]{36}$/i.test(parts[2])) return null;
  const expected = signature(parts[2], parts[1], secret);
  const given = parts[3];
  if (!/^[A-Za-z0-9_-]{43}$/.test(given)) return null;
  const a = Buffer.from(expected); const b = Buffer.from(given);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { tracking_number: parts[1], id: parts[2] };
}
function hasVerifiedDownPayment(appt) {
  return VERIFIED_PAYMENT_STATES.includes(appt.payment_status)
    && Number(appt.amount_paid || 0) >= Number(appt.down_payment || 0);
}
function sessionStartError(appt, today) {
  if (!appt) return 'Booking not found.';
  if (appt.status === 'now_serving') return 'Photo session has already started. Do not scan or start this booking again.';
  if (appt.status === 'completed') return 'Photo session is already completed.';
  if (!['confirmed', 'rescheduled', 'waiting', 'checked_in'].includes(appt.status)) return 'The booking must be confirmed before starting a photo session.';
  if (appt.date !== today) return `This booking is scheduled for ${appt.date}, not today.`;
  if (!hasVerifiedDownPayment(appt)) return 'Admin must verify the required down payment before starting this session.';
  return null;
}
function withClientQR(appt, role) {
  if (!appt) return appt;
  const plain = typeof appt.toJSON === 'function' ? appt.toJSON() : { ...appt };
  if (role === 'client' && plain.client_id) {
    if (plain.photoWorkflow) {
      const { internal_notes, last_updated_by, ...safeWorkflow } = plain.photoWorkflow;
      if (safeWorkflow.stage !== 'released') safeWorkflow.gallery_url = null;
      plain.photoWorkflow = safeWorkflow;
    }
    plain.qr_payload = makeBookingQR(plain);
  }
  return plain;
}
module.exports = { makeBookingQR, parseBookingQR, hasVerifiedDownPayment, sessionStartError, withClientQR };
