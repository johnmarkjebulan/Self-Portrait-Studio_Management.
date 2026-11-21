const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
// Immutable check-in log. Create with `npm run db:init`; existing appointments stay untouched.
const BookingScan = sequelize.define('BookingScan', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  appointment_id: { type: DataTypes.UUID, allowNull: false },
  actor_id: { type: DataTypes.UUID, allowNull: false },
  method: { type: DataTypes.ENUM('qr', 'manual'), allowNull: false },
  event: { type: DataTypes.ENUM('scanned', 'session_started', 'session_completed'), allowNull: false },
}, { tableName: 'booking_scans', underscored: true, updatedAt: false, indexes: [
  { fields: ['appointment_id', 'created_at'] },
] });
module.exports = BookingScan;
