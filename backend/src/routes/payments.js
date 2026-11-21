const router = require('express').Router();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { Op } = require('sequelize');
const { Payment, Appointment, Package, User, Notification } = require('../models');
const { authenticate, requireAdmin, requireStaffOrAdmin } = require('../middleware/auth');
const { notifyAdmins } = require('../utils/notifyAdmins');
const { dateKeyInTimeZone, isValidDateKey } = require('../utils/dateTime');
const { logActivity } = require('../utils/activityLog');
const { PROOFS_DIR, MAX_PROOF_BYTES, imageExtension, safeLocalFile } = require('../utils/paymentProof');

const SUBMISSION_STATUSES = ['payment_submitted', 'under_verification'];
const FINAL_STATUSES = ['verified', 'rejected'];

// Proof files are private local files, not huge base64 strings stored in MySQL.
// Keep backend/uploads when replacing/updating the project; it contains real receipts.
const uploadProof = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PROOF_BYTES, files: 1, fields: 20, fieldSize: 20 * 1024 },
}).single('proof');

function multipartProof(req, res, next) {
  if (!req.is('multipart/form-data')) return next(); // legacy JSON requests
  return uploadProof(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        error: err.code === 'LIMIT_FILE_SIZE'
          ? 'Payment proof must be 5 MB or smaller.'
          : 'Invalid payment proof upload.',
      });
    }
    return next(err);
  });
}


const include = [
  {
    model: Appointment,
    as: 'appointment',
    attributes: ['id', 'tracking_number', 'date', 'time', 'total_price', 'down_payment', 'amount_paid', 'remaining_balance', 'status'],
    include: [{ model: Package, as: 'package', attributes: ['id', 'name'] }],
  },
  { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
];

async function notifyClient(userId, title, message, paymentId) {
  try {
    await Notification.create({
      user_id: userId,
      title,
      message,
      type: 'payment',
      read: false,
      related_id: paymentId,
      related_type: 'payment',
    });
  } catch (err) {
    console.error('Payment notification failed:', err.message);
  }
}

async function recalculateAppointmentPayment(appt) {
  const verifiedTotal = Number(await Payment.sum('amount', {
    where: { appointment_id: appt.id, status: 'verified' },
  })) || 0;
  const balance = Math.max(0, Number(appt.total_price) - verifiedTotal);
  const pending = await Payment.count({ where: { appointment_id: appt.id, status: { [Op.in]: SUBMISSION_STATUSES } } });
  const paymentStatus = balance === 0
    ? 'fully_paid'
    : verifiedTotal > 0
      ? 'partially_paid'
      : pending > 0
        ? 'payment_submitted'
        : 'payment_required';
  await appt.update({ amount_paid: verifiedTotal, remaining_balance: balance, payment_status: paymentStatus });
}

// ADMIN/STAFF-ONLY API. Client-specific routes are reserved for Ryan Joy.

router.get('/', authenticate, requireStaffOrAdmin, async (req, res, next) => {
  try {
    const where = {};
    if (req.query.appointment_id) where.appointment_id = req.query.appointment_id;
    const payments = await Payment.findAll({ where, include, attributes: { exclude: ['proof_data'] }, order: [['created_at', 'DESC']] });
    res.json({ payments });
  } catch (err) { next(err); }
});

// Client submits a new proof. Admins should verify/reject via PATCH, not impersonate a client submission.
router.get('/:id/proof', authenticate, requireStaffOrAdmin, async (req, res, next) => {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment proof not found' });
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    const localPath = safeLocalFile(payment.proof_url);
    if (localPath) {
      return res.sendFile(localPath, (err) => {
        if (err && !res.headersSent) next(err.status === 404 ? Object.assign(new Error('Receipt image not found on disk'), { status: 404 }) : err);
      });
    }
    // Read older receipts that were saved as base64 before the XAMPP upload fix.
    if (payment.proof_data) {
      const match = /^data:image\/(jpeg|jpg|png|webp);base64,([a-z0-9+/=]+)$/i.exec(String(payment.proof_data));
      if (!match) return res.status(404).json({ error: 'Payment proof format not available' });
      res.type(match[1] === 'jpg' ? 'jpeg' : match[1]);
      return res.send(Buffer.from(match[2], 'base64'));
    }
    return res.status(404).json({ error: 'No payment proof was uploaded' });
  } catch (err) { next(err); }
});
router.patch('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    const status = req.body.status;
    const notes = String(req.body.notes || '').trim().slice(0, 2000) || null;
    if (!['under_verification', 'verified', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid payment status' });
    if (payment.status === 'verified') return res.status(409).json({ error: 'Verified payments are final and cannot be changed' });
    if (payment.status === 'rejected') return res.status(409).json({ error: 'Rejected payments are final; ask the client to submit a new proof' });

    const appt = await Appointment.findByPk(payment.appointment_id);
    if (!appt) return res.status(409).json({ error: 'The related appointment no longer exists' });

    if (status === 'verified') {
      const otherVerified = Number(await Payment.sum('amount', {
        where: { appointment_id: appt.id, status: 'verified', id: { [Op.ne]: payment.id } },
      })) || 0;
      if (otherVerified + Number(payment.amount) > Number(appt.total_price) + 0.001) {
        return res.status(409).json({ error: 'Verifying this payment would exceed the appointment total' });
      }
    }

    await payment.update({
      status,
      notes,
      verified_by: FINAL_STATUSES.includes(status) ? req.user.id : null,
      verified_at: FINAL_STATUSES.includes(status) ? new Date() : null,
    });
    await recalculateAppointmentPayment(appt);

    const messages = {
      under_verification: ['Payment Under Review', `Your payment of ₱${Number(payment.amount).toLocaleString('en-PH')} is being reviewed.`],
      verified: ['Payment Verified', `Your payment of ₱${Number(payment.amount).toLocaleString('en-PH')} has been verified.`],
      rejected: ['Payment Rejected', `Your payment was rejected.${notes ? ` ${notes}` : ''}`],
    };
    await notifyClient(payment.client_id, ...messages[status], payment.id);
    await logActivity(
      req,
      status === 'verified' ? 'VERIFY_PAYMENT' : status === 'rejected' ? 'REJECT_PAYMENT' : 'PAYMENT_REVIEW',
      `${status.replace(/_/g, ' ')} ₱${Number(payment.amount).toLocaleString('en-PH')} for ${appt.tracking_number}`,
      'payment',
      payment.id,
    );

    const result = await Payment.findByPk(payment.id, { include, attributes: { exclude: ['proof_data'] } });
    res.json({ payment: result });
  } catch (err) { next(err); }
});

module.exports = router;
