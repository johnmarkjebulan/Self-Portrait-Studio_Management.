require('dotenv').config();
const { sequelize, StudioSettings } = require('../src/models');
const { DEFAULT_HOURS } = require('../src/utils/availability');

async function main() {
  try {
    await sequelize.authenticate();
    // Safe for new XAMPP databases. Does not drop tables or overwrite existing rows.
    // Schema changes to an existing database require a separate explicit migration.
    await sequelize.sync();
    await StudioSettings.findOrCreate({
      where: { id: 1 },
      defaults: { id: 1, business_hours: DEFAULT_HOURS },
    });
    console.log('XAMPP MySQL/MariaDB schema initialized; existing data preserved.');
    console.log('Next: npm run db:seed, then npm run admin:create');
  } finally {
    await sequelize.close();
  }
}
main().catch((err) => { console.error('Database initialization failed:', err); process.exitCode = 1; });
