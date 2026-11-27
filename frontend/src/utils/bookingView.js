// Presentation only: existing database status values remain unchanged.
export const ACTIVE_BOOKINGS = ['pending','confirmed','reschedule_requested','cancellation_requested','rescheduled','checked_in','waiting','now_serving'];
export const CLOSED_BOOKINGS = ['completed','cancelled','no_show','rejected'];
export const BOOKING_LABELS = {pending:'Pending approval',confirmed:'Confirmed',reschedule_requested:'Reschedule requested',cancellation_requested:'Cancellation requested',rescheduled:'Rescheduled',checked_in:'Checked in',waiting:'Waiting',now_serving:'Taking pictures',completed:'Completed',cancelled:'Cancelled',no_show:'No show',rejected:'Declined'};
export const BOOKING_GROUPS = [
 {value:'all',label:'All bookings'},
 {value:'review',label:'Needs review',statuses:['pending','reschedule_requested','cancellation_requested']},
 {value:'scheduled',label:'Scheduled',statuses:['confirmed','rescheduled']},
 {value:'live',label:'Studio session',statuses:['checked_in','waiting','now_serving']},
 {value:'completed',label:'Completed',statuses:['completed']},
 {value:'closed',label:'Closed',statuses:['cancelled','no_show','rejected']},
];
export function matchesBookingGroup(row,filter){const group=BOOKING_GROUPS.find(g=>g.value===filter);return filter==='all'||(group?group.statuses?.includes(row.status):row.status===filter)}
export function sortBookings(rows,order='schedule'){
 const slot=a=>`${a.date||''} ${String(a.time||'').padStart(5,'0')}`;
 const stable=(a,b)=>String(a.tracking_number||a.id||'').localeCompare(String(b.tracking_number||b.id||''));
 return [...rows].sort((a,b)=>{
  if(order==='newest')return String(b.created_at||'').localeCompare(String(a.created_at||''))||stable(a,b);
  if(order==='latest')return slot(b).localeCompare(slot(a))||stable(a,b);
  const closedA=Number(CLOSED_BOOKINGS.includes(a.status)),closedB=Number(CLOSED_BOOKINGS.includes(b.status));
  return closedA-closedB||(closedA?slot(b).localeCompare(slot(a)):slot(a).localeCompare(slot(b)))||stable(a,b);
 });
}
export function searchBooking(row,text){const q=String(text||'').trim().toLowerCase();return !q||[row.tracking_number,row.client?.name,row.package?.name,row.date].some(v=>String(v||'').toLowerCase().includes(q));}
