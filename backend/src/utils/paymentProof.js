const path = require('node:path');

const PROOFS_DIR = path.join(process.env.UPLOADS_DIR || path.resolve(__dirname, '../../uploads'), 'payment-proofs');
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

function imageExtension(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return null;
}

function safeLocalFile(value) {
  const match = /^local:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp))$/i.exec(String(value || ''));
  return match ? path.join(PROOFS_DIR, match[1]) : null;
}

module.exports = { PROOFS_DIR, MAX_PROOF_BYTES, imageExtension, safeLocalFile };
