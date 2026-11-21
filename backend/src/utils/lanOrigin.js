// Development-only LAN allowance: private IPv4 hosts on Vite's default port.
// Production continues to accept ONLY origins explicitly listed in FRONTEND_URL.
function isTrustedDevelopmentLanOrigin(origin, environment = process.env.NODE_ENV) {
  if (environment === 'production') return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' || url.port !== '5173' || url.username || url.password) return false;
    const host = url.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
    const octets = host.split('.').map(Number);
    if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    return octets[0] === 10 ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
  } catch { return false; }
}
module.exports = { isTrustedDevelopmentLanOrigin };
