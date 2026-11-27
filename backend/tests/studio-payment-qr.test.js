const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { getCurrentQrPath, saveOfficialQr } = require('../src/utils/studioPaymentQr');

test('official payment QR accepts a real image signature and saves private local file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pose-payment-qr-'));
  try {
    const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
    const saved = await saveOfficialQr(png, dir);
    assert.equal(saved, path.join(dir, 'official-payment-qr.png'));
    assert.equal(getCurrentQrPath(dir), saved);
    assert.deepEqual(fs.readFileSync(saved), png);
    await assert.rejects(saveOfficialQr(Buffer.from('not an image'), dir), /Invalid QR image/);
    const jpeg = Buffer.from([255,216,255,224,1,2,3,4]);
    assert.equal(await saveOfficialQr(jpeg, dir), path.join(dir, 'official-payment-qr.jpg'));
    assert.equal(getCurrentQrPath(dir), path.join(dir, 'official-payment-qr.jpg'));
    assert.equal(fs.existsSync(saved), false);
  } finally { fs.rmSync(dir, { recursive:true, force:true }); }
});
