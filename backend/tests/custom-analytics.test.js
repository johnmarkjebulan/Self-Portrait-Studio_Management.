const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {resolveRange, summarize, timestampKey} = require('../src/utils/analyticsRange');

test('custom range validates calendar dates and defaults to Manila month-to-date', () => {
  assert.deepEqual(resolveRange({}, new Date('2026-11-30T16:00:00Z')), {startDate:'2026-12-01',endDate:'2026-12-01',days:1,granularity:'day'});
  assert.throws(()=>resolveRange({startDate:'2026-02-30',endDate:'2026-03-05'}), /valid/);
  assert.throws(()=>resolveRange({startDate:'2026-11-30',endDate:'2026-11-01'}), /valid/);
  assert.throws(()=>resolveRange({startDate:'2000-01-01',endDate:'2026-01-01'}), /10 years/);
  assert.equal(timestampKey('2026-11-27T16:00:00Z'),'2026-11-28');
});
test('all analytics metrics and chart buckets use inclusive custom dates', () => {
  const range=resolveRange({startDate:'2026-11-28',endDate:'2026-11-29'});
  const result=summarize({appointments:[
    {date:'2026-11-27',status:'completed',package_id:'a',total_price:500},
    {date:'2026-11-28',status:'completed',package_id:'a',total_price:500},
    {date:'2026-11-29',status:'no_show',package_id:'b',total_price:400},
    {date:'2026-11-30',status:'pending',package_id:'a',total_price:500}],
    payments:[{status:'verified',amount:'500',verified_at:'2026-11-27T16:00:00Z'},
      {status:'verified',amount:'400',verified_at:'2026-11-29T16:00:00Z'},
      {status:'payment_submitted',amount:'100',createdAt:'2026-11-28T04:00:00Z'}],
    clients:[{createdAt:'2026-11-27T16:00:00Z'},{createdAt:'2026-11-29T16:00:00Z'}],
    packages:[{id:'a',name:'Solo Package'},{id:'b',name:'Group Package'}],
    feedback:[{rating:5,createdAt:'2026-11-28T04:00:00Z'},{rating:1,createdAt:'2026-11-29T16:00:00Z'}],dailyCapacity:10},range);
  assert.equal(result.totalAppts,2); assert.equal(result.totalRevenue,500); assert.equal(result.pendingPayments,1);
  assert.equal(result.newClients,1); assert.equal(result.avgRating,'5.0'); assert.equal(result.totalFeedback,1);
  assert.deepEqual(result.daily.map(d=>[d.appointments,d.revenue]),[[1,500],[1,0]]);
  assert.deepEqual(result.packageData.map(p=>p.bookings),[1,1]); assert.equal(result.statusData.reduce((a,b)=>a+b.value,0),2);
  assert.equal(result.paymentData.reduce((a,b)=>a+b.value,0),2); assert.equal(result.ratingDist[4].count,1);
  assert.equal(result.capacityUtilization,5); assert.equal(result.completionRate,'50.0');
});
test('long ranges aggregate to months and empty periods retain zero totals',()=>{
 const range=resolveRange({startDate:'2026-01-15',endDate:'2026-05-05'});
 const r=summarize({appointments:[],payments:[],clients:[],packages:[],feedback:[]},range);
 assert.equal(range.granularity,'month'); assert.equal(r.daily.length,5); assert.equal(r.totalRevenue,0); assert.equal(r.avgRating,'—');
});
test('public navigation has no redundant Book Now or password recovery links',()=>{
 const base=path.resolve(__dirname,'../../frontend/src');
 const read=name=>fs.readFileSync(path.join(base,name),'utf8');
 assert.doesNotMatch(read('components/layout/PublicLayout.jsx'),/Book Now|\/forgot-password/);
 assert.doesNotMatch(read('pages/public/Landing.jsx'),/Book Now|\/forgot-password/);
 assert.match(read('pages/public/Landing.jsx'),/Book an Appointment/);
 assert.match(read('pages/public/Login.jsx'),/\/forgot-password/);
});
