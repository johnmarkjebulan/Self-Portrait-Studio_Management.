// WBS 3.3.2 — Client-owned proof submission and payment history.
// Admin verification and staff access remain exclusively on /api/payments.
const router = require('express').Router();
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const multer = require('multer');
const { Op } = require('sequelize');
const { sequelize, Appointment, Payment, Notification } = require('../models');
const { authenticate } = require('../middleware/auth');
const { notifyAdmins } = require('../utils/notifyAdmins');
const { dateKeyInTimeZone, isValidDateKey } = require('../utils/dateTime');
const { PROOFS_DIR, MAX_PROOF_BYTES, imageExtension, safeLocalFile } = require('../utils/paymentProof');

router.use(authenticate, (req, res, next) => {
  if (req.user?.role !== 'client') return res.status(403).json({ error: 'Client access required.' });
  next();
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PENDING_STATUSES = ['payment_submitted', 'under_verification'];
const DISALLOWED_BOOKING_STATUSES = ['cancelled', 'rejected', 'no_show'];
const MAX_REFERENCE_LENGTH = 100;

const multipart = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PROOF_BYTES, files: 1, fields: 10, fieldSize: 10 * 1024 },
}).single('proof');

function receiveProof(req, res, next) {
  if (!req.is('multipart/form-data')) return res.status(415).json({ error: 'Upload an image using the payment proof form.' });
  return multipart(req, res, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        error: error.code === 'LIMIT_FILE_SIZE' ? 'Payment proof must be 5 MB or smaller.' : 'Invalid payment proof upload.',
      });
    }
    return next(error);
  });
}

function safePayment(payment) {
  const row = typeof payment.toJSON === 'function' ? payment.toJSON() : payment;
  const appointment = row.appointment || null;
  return {
    id: row.id,
    appointment_id: row.appointment_id,
    amount: row.amount,
    type: row.type,
    reference_number: row.reference_number,
    payment_date: row.payment_date,
    status: row.status,
    notes: row.status === 'rejected' ? row.notes : null,
    has_proof: Boolean(row.proof_url || row.proof_data),
    created_at: row.created_at,
    appointment: appointment ? {
      id: appointment.id, tracking_number: appointment.tracking_number,
      date: appointment.date, time: appointment.time,
    } : null,
  };
}

function validateSubmission(body, file, today) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid payment form.';
  const allowed = new Set(['appointment_id', 'amount', 'reference_number', 'payment_date']);
  if (Object.keys(body).some(key => !allowed.has(key))) return 'Unsupported payment fields supplied.';
  if (typeof body.appointment_id !== 'string' || !UUID.test(body.appointment_id)) return 'Select a valid appointment.';
  const amount = String(body.amount ?? '');
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(amount) || Math.round(Number(amount) * 100) < 1) return 'Enter a valid payment amount (maximum two decimals).';
  if (typeof body.reference_number !== 'string' || !body.reference_number.trim() ||
      body.reference_number.trim().length > MAX_REFERENCE_LENGTH || /[\x00-\x1f\x7f]/.test(body.reference_number)) return 'Enter a valid transaction reference (maximum 100 characters).';
  if (typeof body.payment_date !== 'string' || !isValidDateKey(body.payment_date) || body.payment_date > today) return 'Payment date must be a valid date that is not in the future.';
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || file.size > MAX_PROOF_BYTES) return 'A payment proof image (up to 5 MB) is required.';
  const ext = imageExtension(file.buffer);
  const mimeForExtension = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  if (!ext || mimeForExtension[ext] !== file.mimetype) return 'Only valid JPG, PNG or WEBP payment proof images are accepted.';
  return null;
}

router.get('/', async (req, res, next) => {
  try {
    const payments = await Payment.findAll({
      where: { client_id: req.user.id },
      include: [{
        model: Appointment, as: 'appointment', required: true,
        where: { client_id: req.user.id },
        attributes: ['id', 'tracking_number', 'date', 'time'],
      }],
      order: [['created_at', 'DESC']],
    });
    res.set('Cache-Control', 'private, no-store');
    return res.json({ payments: payments.map(safePayment) });
  } catch (err) { return next(err); }
});

router.get('/:id/proof', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Payment proof not found.' });
    const payment = await Payment.findOne({
      where: { id: req.params.id, client_id: req.user.id },
      include: [{ model: Appointment, as: 'appointment', required: true, where: { client_id: req.user.id }, attributes: ['id'] }],
    });
    if (!payment) return res.status(404).json({ error: 'Payment proof not found.' });
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    const filename = safeLocalFile(payment.proof_url);
    if (filename) {
      // Files remain outside the public frontend/static tree.
      return res.sendFile(filename, error => {
        if (error && !res.headersSent) next(error.status === 404 ? Object.assign(new Error('Payment proof file not found.'), { status: 404 }) : error);
      });
    }
    if (payment.proof_data) {
      const match = /^data:image\/(jpeg|jpg|png|webp);base64,([a-z0-9+/=]+)$/i.exec(String(payment.proof_data));
      if (match) {
        res.type(match[1] === 'jpg' ? 'jpeg' : match[1]);
        return res.send(Buffer.from(match[2], 'base64'));
      }
    }
    return res.status(404).json({ error: 'No payment proof is available.' });
  } catch (err) { return next(err); }
});

router.post('/', receiveProof, async (req, res, next) => {
  const error = validateSubmission(req.body, req.file, dateKeyInTimeZone());
  if (error) return res.status(400).json({ error });

  let savedPath = null;
  try {
    const result = await sequelize.transaction(async transaction => {
      const appt = await Appointment.findOne({
        where: { id: req.body.appointment_id, client_id: req.user.id },
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!appt) return { code: 404, error: 'Appointment not found.' };
      if (DISALLOWED_BOOKING_STATUSES.includes(appt.status)) return { code: 409, error: 'Payments cannot be submitted for this booking status.' };

      const pendingCents = Math.round((Number(await Payment.sum('amount', {
        where: { appointment_id: appt.id, status: { [Op.in]: PENDING_STATUSES } }, transaction,
      })) || 0) * 100);
      const availableCents = Math.round(Number(appt.remaining_balance || 0) * 100) - pendingCents;
      const submittedCents = Math.round(Number(req.body.amount) * 100);
      if (availableCents <= 0) return { code: 409, error: 'The balance is paid or already awaiting verification.' };
      if (submittedCents > availableCents) return { code: 409, error: 'Amount exceeds the unpaid balance after pending submissions.' };

      const reference = req.body.reference_number.trim();
      const existing = await Payment.findOne({
        where: {
          client_id: req.user.id, reference_number: reference,
          status: { [Op.in]: ['payment_submitted', 'under_verification', 'verified'] },
        }, transaction,
      });
      if (existing) return { code: 409, error: 'This transaction reference has already been submitted.' };

      const extension = imageExtension(req.file.buffer);
      const filename = `${crypto.randomUUID()}${extension}`;
      await fs.mkdir(PROOFS_DIR, { recursive: true });
      savedPath = path.join(PROOFS_DIR, filename);
      await fs.writeFile(savedPath, req.file.buffer, { flag: 'wx' });

      const verifiedCents = Math.round(Number(appt.amount_paid || 0) * 100);
      const type = verifiedCents === 0 ? 'down_payment' : submittedCents === availableCents ? 'full' : 'partial';
      const payment = await Payment.create({
        appointment_id: appt.id, client_id: req.user.id,
        amount: submittedCents / 100, type, reference_number: reference,
        payment_date: req.body.payment_date,
        proof_url: `local:${filename}`,
        proof_filename: path.basename(String(req.file.originalname || 'proof')).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 180),
        proof_data: null, status: 'payment_submitted', verified_by: null, verified_at: null,
      }, { transaction });

      // Verified amounts never change until Admin explicitly verifies a payment.
      if (verifiedCents === 0 && pendingCents === 0) {
        await appt.update({ payment_status: 'payment_submitted' }, { transaction });
      }
      return { payment: safePayment({ ...payment.toJSON(), appointment: { id: appt.id, tracking_number: appt.tracking_number, date: appt.date, time: appt.time } }), tracking: appt.tracking_number, id: appt.id };
    });

    if (result.error) return res.status(result.code).json({ error: result.error });
    savedPath = null; // Committed; do not remove uploaded proof.
    try {
      await Notification.create({
        user_id: req.user.id, title: 'Payment proof submitted',
        message: `Your proof for ${result.tracking} was received and is pending admin verification.`,
        type: 'payment', read: false, related_id: result.payment.id, related_type: 'payment',
      });
      await notifyAdmins('Client payment proof submitted', `${req.user.name || 'A client'} submitted payment proof for ${result.tracking}.`, 'payment', result.payment.id, 'payment');
    } catch (notifyError) { console.error('Payment notification failed:', notifyError.message); }
    res.set('Cache-Control', 'private, no-store');
    return res.status(201).json({ payment: result.payment });
  } catch (err) {
    if (savedPath) await fs.unlink(savedPath).catch(() => {});
    return next(err);
  }
});

module.exports = router;
