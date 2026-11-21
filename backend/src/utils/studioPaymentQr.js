const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { imageExtension } = require('./paymentProof');
const QR_DIR = path.resolve(__dirname, '../../uploads/studio');
const STEM = 'official-payment-qr';
const ALLOWED = ['.jpg', '.png', '.webp'];

function getCurrentQrPath(directory = QR_DIR) {
  for (const ext of ALLOWED) {
    const filename = path.join(directory, STEM + ext);
    if (fs.existsSync(filename)) return filename;
  }
  return null;
}
async function saveOfficialQr(buffer, directory = QR_DIR) {
  const ext = imageExtension(buffer);
  if (!ext) { const error = new Error('Invalid QR image. Use a real JPG, PNG or WebP file.'); error.status = 400; throw error; }
  await fs.promises.mkdir(directory, { recursive: true });
  const staging = path.join(directory, `.${STEM}-${crypto.randomUUID()}${ext}`);
  const final = path.join(directory, STEM + ext);
  try {
    await fs.promises.writeFile(staging, buffer, { flag: 'wx', mode: 0o600 });
    await fs.promises.rename(staging, final);
    for (const other of ALLOWED) {
      if (other !== ext) await fs.promises.unlink(path.join(directory, STEM + other)).catch((err) => { if (err.code !== 'ENOENT') throw err; });
    }
  } finally {
    await fs.promises.unlink(staging).catch(() => {});
  }
  return final;
}
module.exports = { QR_DIR, getCurrentQrPath, saveOfficialQr };
