const STAGES = Object.freeze(['awaiting_session','editing','ready_for_release','released']);
const TRANSITIONS = Object.freeze({
  awaiting_session: ['editing'],
  editing: ['ready_for_release'],
  ready_for_release: ['editing','released'],
  released: [],
});
function canTransition(current, next, role) {
  return STAGES.includes(next) && TRANSITIONS[current]?.includes(next) === true
    && (next !== 'released' || role === 'admin');
}
function isSafeGalleryUrl(input) {
  if (input === '' || input == null) return true;
  if (typeof input !== 'string' || input.length > 1500) return false;
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}
module.exports = { STAGES, TRANSITIONS, canTransition, isSafeGalleryUrl };
