// WBS 3.3.3 — Read-only Client photo delivery visibility.
// Admin/Staff update workflow stages through their existing /photo-workflows API.
const router = require('express').Router();
const { Appointment, Package, PhotoWorkflow } = require('../models');
const { authenticate } = require('../middleware/auth');
const { isSafeGalleryUrl } = require('../utils/photoWorkflow');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANCELLED = new Set(['cancelled', 'rejected', 'no_show']);
const WAITING = new Set(['checked_in', 'waiting']);
const ACTIVE = new Set(['now_serving']);
const SCHEDULED = new Set(['confirmed', 'rescheduled', 'cancellation_requested', 'reschedule_requested']);
const DELIVERY = new Set(['editing', 'ready_for_release', 'released']);
const includes = [
  { model: Package, as: 'package', attributes: ['name'] },
  { model: PhotoWorkflow, as: 'photoWorkflow', attributes: ['stage', 'gallery_url', 'ready_at', 'released_at'] },
];

router.use(authenticate, (req, res, next) => {
  if (req.user?.role !== 'client') return res.status(403).json({ error: 'Client account required.' });
  next();
});

function safePhotoStatus(appointment) {
  const a = typeof appointment.toJSON === 'function' ? appointment.toJSON() : appointment;
  const wf = a.photoWorkflow || null;
  let status;
  if (CANCELLED.has(a.status)) status = 'unavailable';
  else if (a.status === 'completed') {
    status = DELIVERY.has(wf?.stage) ? wf.stage : 'session_completed';
  } else if (ACTIVE.has(a.status)) status = 'in_progress';
  else if (WAITING.has(a.status)) status = 'waiting';
  else if (SCHEDULED.has(a.status)) status = 'scheduled';
  else status = 'pending';

  const isReleased = status === 'released';
  const rawGallery = typeof wf?.gallery_url === 'string' ? wf.gallery_url.trim() : '';
  const galleryUrl = isReleased && rawGallery && isSafeGalleryUrl(rawGallery) ? rawGallery : null;
  return {
    appointment_id: a.id,
    tracking_number: a.tracking_number,
    date: a.date,
    time: a.time,
    package_name: a.package?.name || 'Photography Session',
    appointment_status: a.status,
    photo_status: status,
    gallery_url: galleryUrl,
    gallery_available: Boolean(galleryUrl),
    ready_at: (status === 'ready_for_release' || isReleased) ? wf?.ready_at || null : null,
    released_at: isReleased ? wf?.released_at || null : null,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const appointments = await Appointment.findAll({
      where: { client_id: req.user.id },
      attributes: ['id', 'client_id', 'tracking_number', 'date', 'time', 'status'],
      include: includes,
      order: [['date', 'DESC'], ['time', 'DESC']],
    });
    res.set('Cache-Control', 'private, no-store');
    return res.json({ photoStatuses: appointments.map(safePhotoStatus) });
  } catch (error) { return next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Photo status not found.' });
    const appointment = await Appointment.findOne({
      where: { id: req.params.id, client_id: req.user.id },
      attributes: ['id', 'client_id', 'tracking_number', 'date', 'time', 'status'],
      include: includes,
    });
    if (!appointment) return res.status(404).json({ error: 'Photo status not found.' });
    res.set('Cache-Control', 'private, no-store');
    return res.json({ photoStatus: safePhotoStatus(appointment) });
  } catch (error) { return next(error); }
});

module.exports = router;
