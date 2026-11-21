const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const root = path.resolve(__dirname, '../..');
const envFile = path.join(root, 'backend', '.env');
console.log('Pose and Pics / XAMPP local diagnostics');
console.log('Node:', process.version);
console.log('Project:', root);
let env = {};
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Za-z_][A-Za-z_0-9]*)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].trim();
}
console.log('backend/.env:', fs.existsSync(envFile) ? 'present' : 'MISSING');
console.log('JWT_SECRET:', env.JWT_SECRET?.length >= 32 && !env.JWT_SECRET.startsWith('REPLACE_') ? 'configured' : 'MISSING / PLACEHOLDER');
console.log('MySQL settings:', `${env.DB_HOST || '127.0.0.1'}:${env.DB_PORT || 3306} / ${env.DB_NAME || 'pose_and_pics'}`);
for (const [label, host, port] of [
  ['MySQL/XAMPP', env.DB_HOST || '127.0.0.1', Number(env.DB_PORT || 3306)],
  ['Backend', '127.0.0.1', Number(env.PORT || 5000)],
  ['Frontend (loopback, used only with no Wi-Fi)', '127.0.0.1', 5173],
]) {
  const sock = net.connect({ host, port });
  sock.setTimeout(1500);
  sock.once('connect', () => { console.log(`${label}: listening at ${host}:${port}`); sock.destroy(); });
  sock.once('error', (e) => { console.log(`${label}: not listening (${e.code})`); });
  sock.once('timeout', () => { console.log(`${label}: timeout`); sock.destroy(); });
}
