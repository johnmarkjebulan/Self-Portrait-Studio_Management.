const jwt = require('jsonwebtoken');

// Recheck active account and current role for each request. This immediately
// revokes access when an Admin disables staff, even if their JWT has not expired.
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized — no token' });
  let payload;
  try { payload = jwt.verify(header.slice(7), process.env.JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
  try {
    if (!payload?.id) return res.status(401).json({error: 'Invalid authentication token'});
    const { User } = require('../models');
    const user = await User.findByPk(payload.id, { attributes: ['id','name','email','role','is_active'] });
    if (!user || !user.is_active) return res.status(401).json({ error: 'This account is inactive or no longer exists. Please log in again.' });
    req.user = { id: user.id, role: user.role, name: user.name, email: user.email };
    next();
  } catch(err) { next(err); }
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Owner/Admin access required' });
  next();
}
function requireStaffOrAdmin(req, res, next) {
  if (!['admin', 'staff'].includes(req.user?.role)) return res.status(403).json({ error: 'Staff access required' });
  next();
}
module.exports = { authenticate, requireAdmin, requireStaffOrAdmin };
