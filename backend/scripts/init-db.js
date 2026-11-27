require('dotenv').config();
const mysql = require('mysql2/promise');
const { sequelize, StudioSettings } = require('../src/models');
const { DEFAULT_HOURS } = require('../src/utils/availability');

async function main() {
  try {
    const db = process.env.DB_NAME || 'pose_and_pics';
    if (!/^[a-zA-Z0-9_]+$/.test(db)) throw new Error('DB_NAME must contain only letters, numbers and underscores.');
    // First try the existing schema. Create only when it does not exist.
    try { await sequelize.authenticate(); }
    catch (err) {
      if ((err.original || err.parent || err).code !== 'ER_BAD_DB_ERROR') throw err;
      const connection = await mysql.createConnection({host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || ''});
      try { await connection.query('CREATE DATABASE IF NOT EXISTS `' + db + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'); }
      finally { await connection.end(); }
      await sequelize.authenticate();
    }
    // Safe for new XAMPP databases. Does not drop tables or overwrite existing rows.
    // Schema changes to an existing database require a separate explicit migration.
    await sequelize.sync();
    await StudioSettings.findOrCreate({
      where: { id: 1 },
      defaults: { id: 1, business_hours: DEFAULT_HOURS },
    });
    console.log('MySQL/MariaDB schema initialized; existing data preserved.');
    console.log('Next: npm run db:seed, then npm run admin:create');
  } finally {
    await sequelize.close();
  }
}
main().catch((err) => { console.error('Database initialization failed:', err); process.exitCode = 1; });
