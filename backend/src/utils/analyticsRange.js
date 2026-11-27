const { dateKeyInTimeZone, isValidDateKey } = require('./dateTime');
const DAY = 86400000;
const dateMs = key => Date.parse(`${key}T00:00:00Z`);

function resolveRange(query = {}, now = new Date()) {
  const today = dateKeyInTimeZone(now);
  const startDate = query.startDate ?? `${today.slice(0, 7)}-01`;
  const endDate = query.endDate ?? today;
  if (typeof startDate !== 'string' || typeof endDate !== 'string' || !isValidDateKey(startDate) || !isValidDateKey(endDate) || startDate > endDate) {
    throw new Error('Choose valid From and To dates. From must be on or before To.');
  }
  const days = (dateMs(endDate) - dateMs(startDate)) / DAY + 1;
  if (days > 3660) throw new Error('Choose a date range of 10 years or less.');
  const granularity = days > 92 ? 'month' : 'day';
  return { startDate, endDate, days, granularity };
}
function timestampKey(value) {
  if (value == null || value === '') return null;
  const raw = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value) ? value.replace(' ', 'T') + 'Z' : value;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? dateKeyInTimeZone(d) : null;
}
const createdKey = row => timestampKey(row.createdAt ?? row.created_at);
const verifiedKey = row => timestampKey(row.verified_at ?? row.verifiedAt ?? row.createdAt ?? row.created_at);
const inRange = (key, range) => typeof key === 'string' && key >= range.startDate && key <= range.endDate;
function makeBuckets(range) {
  const buckets = new Map();
  const label = new Intl.DateTimeFormat('en-PH', {timeZone:'UTC', month:'short', ...(range.granularity === 'month' ? {year:'numeric'} : {day:'numeric', ...(range.startDate.slice(0,4) !== range.endDate.slice(0,4) ? {year:'2-digit'} : {})})});
  for (let ms = dateMs(range.startDate); ms <= dateMs(range.endDate); ms += DAY) {
    const d = new Date(ms);
    const key = d.toISOString().slice(0, range.granularity === 'month' ? 7 : 10);
    if (!buckets.has(key)) buckets.set(key, { date: label.format(d), appointments:0, revenue:0 });
  }
  return buckets;
}
function summarize({appointments, payments, clients, packages, feedback, dailyCapacity}, range) {
  const appts = appointments.filter(a => inRange(a.date, range));
  const filteredPayments = payments.filter(p => inRange(p.status === 'verified' ? verifiedKey(p) : createdKey(p), range));
  const verified = filteredPayments.filter(p => p.status === 'verified');
  const reviews = feedback.filter(f => inRange(createdKey(f), range));
  const newClients = clients.filter(c => inRange(createdKey(c), range));
  const buckets = makeBuckets(range);
  const bucket = key => buckets.get(key.slice(0, range.granularity === 'month' ? 7 : 10));
  const pkgCounts = new Map();
  const statuses = new Map();
  const payStatuses = new Map();
  for (const a of appts) {
    bucket(a.date).appointments++;
    const p = pkgCounts.get(a.package_id) || { bookings:0, revenue:0 };
    p.bookings++; p.revenue += Number(a.total_price || 0); pkgCounts.set(a.package_id,p);
    statuses.set(a.status,(statuses.get(a.status)||0)+1);
  }
  for (const p of verified) bucket(verifiedKey(p)).revenue += Number(p.amount || 0);
  for (const p of filteredPayments) payStatuses.set(p.status,(payStatuses.get(p.status)||0)+1);
  const count = status => statuses.get(status) || 0;
  const finalized = count('completed') + count('no_show') + count('cancelled');
  const rate = n => finalized ? (100*n/finalized).toFixed(1) : '0.0';
  const booked = appts.filter(a => !['cancelled','declined','rejected','no_show','pending','pending_approval'].includes(a.status)).length;
  const capacity = Number(dailyCapacity) > 0 ? Number(dailyCapacity) : 10;
  return {
    range, totalAppts:appts.length, completedAppts:count('completed'), cancelledAppts:count('cancelled'), noShows:count('no_show'),
    totalRevenue: verified.reduce((sum,p)=>sum+Number(p.amount||0),0),
    pendingPayments: filteredPayments.filter(p=>['payment_submitted','under_verification'].includes(p.status)).length,
    totalClients: newClients.length, newClients:newClients.length,
    avgRating: reviews.length ? (reviews.reduce((sum,f)=>sum+Number(f.rating),0)/reviews.length).toFixed(1) : '—',
    totalFeedback:reviews.length, noShowRate:rate(count('no_show')), completionRate:rate(count('completed')),
    capacityUtilization:Math.min(100,Math.round(booked/(range.days*capacity)*100)),
    pendingRequests:count('cancellation_requested')+count('reschedule_requested'),
    daily:[...buckets.values()],
    packageData:packages.map(p=>({name:p.name.replace(' Package',''), ...(pkgCounts.get(p.id)||{bookings:0,revenue:0})})),
    statusData:[...statuses].map(([name,value])=>({name,value})),
    paymentData:[...payStatuses].map(([name,value])=>({name,value})),
    ratingDist:[1,2,3,4,5].map(r=>({rating:`${r}★`,count:reviews.filter(f=>Number(f.rating)===r).length})),
  };
}
module.exports = { resolveRange, timestampKey, inRange, summarize };
