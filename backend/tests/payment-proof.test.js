const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { imageExtension, safeLocalFile, PROOFS_DIR, MAX_PROOF_BYTES } = require('../src/utils/paymentProof');

test('payment proof upload validates file signatures', () => {
  assert.equal(imageExtension(Buffer.from([0xff, 0xd8, 0xff, 0x00])), '.jpg');
  assert.equal(imageExtension(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0])), '.png');
  assert.equal(imageExtension(Buffer.from('RIFFabcdWEBP....')), '.webp');
  assert.equal(imageExtension(Buffer.from('this is not a receipt image')), null);
  assert.equal(MAX_PROOF_BYTES, 5 * 1024 * 1024);
});

test('private receipt path cannot escape payment folder', () => {
  const uuid = '12345678-1234-4123-a123-123456789abc';
  assert.equal(safeLocalFile(`local:${uuid}.png`), path.join(PROOFS_DIR, `${uuid}.png`));
  assert.equal(safeLocalFile('local:../.env'), null);
  assert.equal(safeLocalFile('local:../../../secrets.jpg'), null);
  assert.equal(safeLocalFile('https://example.com/receipt.jpg'), null);
});
