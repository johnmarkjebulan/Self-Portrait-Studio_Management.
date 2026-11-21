const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
// Separate table; no changes to existing appointments table or historical records.
const PhotoWorkflow = sequelize.define('PhotoWorkflow', {
  appointment_id: { type: DataTypes.UUID, primaryKey: true },
  assigned_staff_id: { type: DataTypes.UUID, allowNull: true },
  stage: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'awaiting_session' },
  gallery_url: { type: DataTypes.TEXT, allowNull: true },
  internal_notes: { type: DataTypes.TEXT, allowNull: true },
  ready_at: { type: DataTypes.DATE, allowNull: true },
  released_at: { type: DataTypes.DATE, allowNull: true },
  last_updated_by: { type: DataTypes.UUID, allowNull: true },
}, { tableName: 'photo_workflows', underscored: true, indexes: [ { fields: ['assigned_staff_id'] }, { fields: ['stage'] } ] });
module.exports = PhotoWorkflow;
