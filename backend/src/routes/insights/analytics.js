const router = require('express').Router();
const { Appointment, Payment, User, Package, Feedback, StudioSettings } = require('../../models');
const { authenticate, requireAdmin } = require('../../middleware/auth');
const { resolveRange, summarize } = require('../../utils/analyticsRange');
const { Op } = require('sequelize');

router.get('/', authenticate, requireAdmin, async (req, res, next) => {
  let range;
  try { range = resolveRange(req.query); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  try {
    // All appointment metrics refer to the scheduled appointment date;
    // verified revenue refers to the verification timestamp, in studio time.
    const [appointments, payments, clients, packages, feedback, settings] = await Promise.all([
      Appointment.findAll({ where: { date: { [Op.between]: [range.startDate, range.endDate] } }, attributes:['date','status','package_id','total_price'] }),
      Payment.findAll({attributes:['status','amount','verified_at','createdAt']}),
      User.findAll({where:{role:'client'},attributes:['createdAt']}),
      Package.findAll({attributes:['id','name']}),
      Feedback.findAll({attributes:['rating','createdAt']}),
      StudioSettings.findByPk(1),
    ]);
    res.json(summarize({appointments,payments,clients,packages,feedback,dailyCapacity:settings?.daily_capacity},range));
  } catch (err) { next(err); }
});
module.exports = router;
