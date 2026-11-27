const router = require('express').Router();

router.use('/auth', require('./identity/auth'));
router.use('/users', require('./identity/users'));
router.use('/packages', require('./studio/packages'));
router.use('/appointments', require('./bookings/appointments'));
router.use('/photo-workflows', require('./bookings/photo-workflows'));
router.use('/payments', require('./billing/payments'));
router.use('/notifications', require('./engagement/notifications'));
router.use('/feedback', require('./engagement/feedback'));
router.use('/posts', require('./engagement/posts'));
router.use('/settings', require('./studio/settings'));
router.use('/schedules', require('./bookings/schedules'));
router.use('/availability', require('./bookings/availability'));
router.use('/analytics', require('./insights/analytics'));
router.use('/activity-logs', require('./insights/activity-logs'));
router.use('/public-stats', require('./insights/public-stats'));

module.exports = router;
