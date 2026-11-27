// Initialize schema only; do not drop tables or create default credentials.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const root = path.resolve(__dirname, '..');
async function main() {
  if (process.env.NODE_ENV !== 'production') throw new Error('Cloud startup requires NODE_ENV=production');
  if (!process.env.DB_HOST || !process.env.DB_PASSWORD || !process.env.UPLOADS_DIR) throw new Error('Missing cloud database or persistent uploads configuration');
  for (let attempt = 1; attempt <= 12; attempt++) {
    const result = spawnSync(process.execPath, ['backend/scripts/init-db.js'], { cwd: root, stdio: 'inherit' });
    if (result.status === 0) {
      require('../backend/src/server.js');
      return;
    }
    if (attempt < 12) { console.log(`Database setup not ready (${attempt}/12); retrying in 5s`); await sleep(5000); }
  }
  throw new Error('Could not initialize cloud database. Check service logs and credentials.');
}
main().catch(err => { console.error(err.message); process.exit(1); });
