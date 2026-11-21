import os from 'node:os';

// Vite binds only to the active Wi-Fi adapter, never the 169.254.x.x
// link-local Ethernet/virtual adapter. On a PC without Wi-Fi, use loopback.
// To override: $env:POSE_VITE_HOST = '192.168.x.x' (PowerShell).
const wifiAdapter = /^(wi[-\s]?fi(?:\s*\d+)?|wireless(?:\s+lan)?|wlan\d*|wlp\w+|airport)$/i;

function isPrivateIpv4(ip) {
  const v = String(ip || '').split('.').map(Number);
  if (v.length !== 4 || v.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return v[0] === 10 || (v[0] === 172 && v[1] >= 16 && v[1] <= 31) || (v[0] === 192 && v[1] === 168);
}

export function pickWifiHost(interfaces = os.networkInterfaces(), requestedHost = process.env.POSE_VITE_HOST) {
  if (requestedHost) {
    if (requestedHost === '127.0.0.1' || requestedHost === 'localhost' || isPrivateIpv4(requestedHost)) return requestedHost;
    throw new Error('POSE_VITE_HOST must be localhost or a private Wi-Fi IPv4 address (e.g. 192.168.254.105).');
  }
  for (const [name, entries] of Object.entries(interfaces)) {
    if (!wifiAdapter.test(name.trim())) continue;
    for (const item of entries || []) {
      if ((item.family === 'IPv4' || item.family === 4) && !item.internal && isPrivateIpv4(item.address)) return item.address;
    }
  }
  return '127.0.0.1';
}

export { isPrivateIpv4 };
