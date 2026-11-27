const test = require('node:test');
const assert = require('node:assert/strict');
const { STAGES, canTransition, isSafeGalleryUrl } = require('../src/utils/photoWorkflow');
test('editing follows a controlled release workflow', () => {
  assert.equal(STAGES.length, 4);
  assert.equal(canTransition('editing','ready_for_release','staff'),true);
  assert.equal(canTransition('ready_for_release','released','staff'),false);
  assert.equal(canTransition('ready_for_release','released','admin'),true);
  assert.equal(canTransition('released','editing','admin'),false);
  assert.equal(canTransition('awaiting_session','released','admin'),false);
});
test('gallery links must be HTTPS without URL credentials', () => {
  assert.equal(isSafeGalleryUrl('https://example.com/gallery/one'),true);
  assert.equal(isSafeGalleryUrl('http://example.com/pics'),false);
  assert.equal(isSafeGalleryUrl('https://user:pass@example.com/pics'),false);
  assert.equal(isSafeGalleryUrl('javascript:alert(1)'),false);
  assert.equal(isSafeGalleryUrl(''),true);
});
