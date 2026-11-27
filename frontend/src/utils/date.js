export const STUDIO_TIME_ZONE = 'Asia/Manila';

export function studioDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: STUDIO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function studioToday() {
  return studioDateKey(new Date());
}

export function studioMonthStart() {
  return `${studioToday().slice(0, 7)}-01`;
}

export function studioAppointmentDate(date, time = "00:00") {
  return new Date(`${date}T${String(time).slice(0,5)}:00+08:00`);
}

export function formatStudioTime(value) {
  const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(String(value ?? ''));
  if (!match || Number(match[1])>23) return '—';
  const hour=Number(match[1]);
  return `${hour%12 || 12}:${match[2]} ${hour>=12?'PM':'AM'}`;
}
export function formatStudioTimestamp(value) {
  if (!value) return '—';
  const raw = String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw) ? raw.replace(' ','T')+'Z' : value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US',{timeZone:STUDIO_TIME_ZONE,year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(date);
}
