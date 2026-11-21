require('dotenv').config();
const { Sequelize } = require('sequelize');

// XAMPP includes MySQL or MariaDB. The mysql2 driver works with both.
// Create the database in phpMyAdmin first; table creation is handled by db:init.
const sequelize = new Sequelize(
  process.env.DB_NAME || 'pose_and_pics',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD ?? '',
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    dialect: 'mysql',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    pool: {
      max: Number(process.env.DB_POOL_MAX || 5),
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
  }
);

module.exports = sequelize;
