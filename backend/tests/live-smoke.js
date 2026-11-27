// Run only after XAMPP MySQL, backend (5000) and frontend (5173) are running.
// Performs read-only smoke checks; no accounts, bookings or payments are created.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '../..');
const envPath = path.join(root, 'backend/.env');
const config = fs.existsSync(envPath) ? require('dotenv').parse(fs.readFileSync(envPath)) : {};
const port = process.env.POSE_BACKEND_PORT || process.env.PORT || config.PORT || '5000';
const https = ['cert.pem','key.pem'].every(name => fs.existsSync(path.join(root,'frontend/certs',name)));
const apiBase = (process.env.SMOKE_API_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '');
const frontendBase = (process.env.SMOKE_FRONTEND_URL || `${https?'https':'http'}://localhost:5173`).replace(/\/$/, '');
(async () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const cases = [
    [`${apiBase}/api/health`, 200, 'API health'],
    [`${apiBase}/api/settings`, 200, 'Studio settings'],
    [`${apiBase}/api/packages`, 200, 'Public package catalog'],
    [`${apiBase}/api/packages/addons/list`, 200, 'Add-ons'],
    [`${apiBase}/api/availability?date=${today}`, 200, 'Booking availability'],
    [`${apiBase}/api/public-stats`, 200, 'Public stats'],
    [`${apiBase}/api/appointments`, 401, 'Protected appointments'],
    [`${apiBase}/api/payments`, 401, 'Protected payments'],
    [`${frontendBase}/`, 200, 'Frontend index'],
    [`${frontendBase}/api/health`, 200, 'Frontend API proxy / same-origin API'],
    [`${frontendBase}/login`, 200, 'Frontend login route'],
  ];
  let pass=0;
  for (const [url, expected, label] of cases) {
    try {
      const response=await fetch(url, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, expected, `expected HTTP ${expected}, got ${response.status}`);
      console.log(`PASS ${label}: ${response.status}`); pass++;
    } catch (err) { console.error(`FAIL ${label}: ${err.message}`); }
  }
  console.log(`${pass}/${cases.length} live smoke checks passed.`);
  if(pass!==cases.length) process.exitCode=1;
})().catch(err=>{console.error(err);process.exitCode=1;});
