const WAITING = ['checked_in', 'waiting'];
const ACTIVE = [...WAITING, 'now_serving'];
const number = a => Number(a.queue_number) > 0 ? Number(a.queue_number) : null;
function compareQueue(a,b) {
  return (number(a) ?? Infinity) - (number(b) ?? Infinity) ||
    String(a.queue_entry_at || a.checked_in_at || '').localeCompare(String(b.queue_entry_at || b.checked_in_at || '')) ||
    String(a.time || '').localeCompare(String(b.time || '')) || String(a.id).localeCompare(String(b.id));
}
function duration(a) {
  const minutes = Number(a.package?.duration);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}
// Single studio queue. Only safe aggregate information is returned to each client.
function queueSnapshot(rows, now = Date.now()) {
  const ongoing = rows.filter(a => a.status === 'now_serving').sort(compareQueue);
  const waiting = rows.filter(a => WAITING.includes(a.status)).sort(compareQueue);
  const serving = ongoing.map(number).filter(n => n !== null);
  const remaining = ongoing.map(a => {
    const end = a.service_end_at ? new Date(a.service_end_at).getTime() : NaN;
    // An overdue session is still active until the operator completes it.
    return Number.isFinite(end) && end > now ? (end-now)/60000 : null;
  });
  const result = new Map();
  for (const a of [...ongoing, ...waiting]) {
    const active = a.status === 'now_serving';
    const before = active ? [] : waiting.slice(0, waiting.findIndex(b => b.id === a.id));
    const minutes = [...remaining, ...before.map(duration)];
    result.set(a.id, {
      queueNumber: number(a), nowServingNumbers: serving,
      activeCount: ongoing.length, isNowServing: active,
      ahead: active ? 0 : ongoing.length + before.length,
      estimated: active ? 0 : minutes.includes(null) ? null : Math.ceil(minutes.reduce((sum,m)=>sum+m,0)),
    });
  }
  return result;
}
function startQueueError(rows, appointment) {
  if (rows.some(a=>a.status==='now_serving' && a.id!==appointment.id)) return 'Another client is taking pictures. Complete that session first.';
  const next = rows.filter(a=>WAITING.includes(a.status)).sort(compareQueue)[0];
  if(next && next.id!==appointment.id) return 'Another client is ahead in the queue. Start the next waiting client first.';
  return null;
}
module.exports = { WAITING, ACTIVE, compareQueue, queueSnapshot, startQueueError };
