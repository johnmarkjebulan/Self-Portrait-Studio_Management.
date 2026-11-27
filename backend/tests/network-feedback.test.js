const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isTrustedDevelopmentLanOrigin } = require('../src/utils/lanOrigin');
const src = path.resolve(__dirname, '../../frontend/src');
const read = (part) => fs.readFileSync(path.join(src, part), 'utf8');

test('five visible ratings accept full ratings without hidden sixth field', async () => {
  const { missingFeedbackRatings, REQUIRED_FEEDBACK_RATINGS } = await import(pathToFileURL(path.join(src, 'utils/feedbackRatings.js')).href);
  const scores = { rating:5, booking_experience:5, staff_service:5, studio_experience:4, cleanliness:4 };
  assert.equal(REQUIRED_FEEDBACK_RATINGS.length, 5);
  assert.deepEqual(missingFeedbackRatings(scores), []);
  assert.deepEqual(missingFeedbackRatings({ ...scores, staff_service:0 }), ['staff_service']);
  assert.deepEqual(missingFeedbackRatings({ ...scores, rating:6 }), ['rating']);
  assert.deepEqual(missingFeedbackRatings({ ...scores, cleanliness:undefined }), ['cleanliness']);
  assert.doesNotMatch(read('pages/client/Feedback.jsx'), /overall_satisfaction:\s*0/);
});

test('Vite supports LAN hosting and client uses same-origin API proxy', () => {
  const config = fs.readFileSync(path.resolve(__dirname, '../../frontend/vite.config.js'), 'utf8');
  const api = read('services/api.js');
  assert.match(config, /host:\s*true/);
  assert.match(config, /'\/api'/);
  assert.match(api, /\|\| '\/api'/);
  assert.doesNotMatch(api, /http:\/\/localhost:5000\/api/);
});

test('development CORS accepts private LAN and rejects Internet origins', () => {
  for (const origin of ['http://192.168.1.10:5173', 'http://10.0.0.8:5173', 'http://172.16.5.12:5173', 'http://localhost:5173', 'http://127.0.0.1:5173', 'https://192.168.1.10:5173', 'https://localhost:5173']) {
    assert.equal(isTrustedDevelopmentLanOrigin(origin, 'development'), true, origin);
    assert.equal(isTrustedDevelopmentLanOrigin(origin, 'production'), false, origin);
  }
  for (const origin of ['http://8.8.8.8:5173', 'https://8.8.8.8:5173', 'http://192.168.1.10:9999', 'http://172.32.0.1:5173', 'http://192.168.1.10.evil.test:5173']) {
    assert.equal(isTrustedDevelopmentLanOrigin(origin, 'development'), false, origin);
  }
});

test('payments surface source failures and offer retry', () => {
  const payments = read('pages/client/Payments.jsx');
  assert.match(payments, /Promise\.allSettled/);
  assert.match(payments, /setLoadError\(problems\.join/);
  assert.match(payments, /Retry Loading/);
  assert.doesNotMatch(payments, /toast\("Failed to load data\."/);
});
