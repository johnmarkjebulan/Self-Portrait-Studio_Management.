import BookingDialog from "../../components/common/BookingDialog";
import { formatStudioTime } from "../../utils/date";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { appointmentsApi } from "../../services/api";
import { StatusBadge } from "../../components/common/StatusBadge";
import BookingToolbar from "../../components/common/BookingToolbar";
import {matchesBookingGroup,sortBookings,searchBooking} from "../../utils/bookingView";
export default function StaffAppointments() {
  const [rows, setRows] = useState([]);
  const [selected,setSelected]=useState(null);
  const detail=rows.find(a=>a.id===selected);
  const [q, setQ] = useState("");
  const [filter,setFilter]=useState("all"), [date,setDate]=useState(""), [order,setOrder]=useState("schedule");
  const [loading,setLoading]=useState(true), [error,setError]=useState("");
  useEffect(() => {
    const reload = () => appointmentsApi.getAll().then(data=>{setRows(data);setError("")}).catch(e=>setError(e.message||"Unable to load bookings")).finally(()=>setLoading(false));
    reload();
    const id = setInterval(() => { if (!document.hidden) reload(); }, 20000);
    return () => clearInterval(id);
  }, []);
  const filtered = sortBookings(rows.filter(a=>matchesBookingGroup(a,filter)&&searchBooking(a,q)&&(!date||a.date===date)),order);
  return <div className="max-w-6xl mx-auto">
    <div className="flex flex-wrap justify-between items-center gap-3 mb-5"><div><h1 className="text-2xl font-semibold">Bookings</h1><p className="text-sm text-gray-500 mt-1">View live session status and scan client booking QR codes.</p></div>
      <Link to="/staff/scanner" className="rounded-xl bg-gray-900 text-white text-sm font-semibold px-5 py-3">Scan Booking QR</Link></div>
    <BookingToolbar rows={rows} filter={filter} setFilter={setFilter} search={q} setSearch={setQ} date={date} setDate={setDate} order={order} setOrder={setOrder} total={filtered.length}/>
    {error&&<p role="alert" className="text-sm text-red-700 mb-3">{error}</p>}
    <div className="bg-white border rounded-2xl overflow-x-auto"><table className="w-full responsive-booking-table text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{['Tracking','Client','Date','Time','Package','Status','Actions'].map((h)=><th key={h} className="text-left p-3">{h}</th>)}</tr></thead>
    <tbody>{!filtered.length&&<tr><td colSpan={7} className="text-center py-12 text-gray-500">{loading?"Loading bookings…":"No matching bookings"}</td></tr>}{filtered.map((a)=><tr key={a.id} className="border-t"><td data-label="Tracking #" className="p-3 font-mono">{a.tracking_number}</td><td data-label="Client" className="p-3">{a.client?.name||'—'}</td><td data-label="Date" className="p-3">{a.date}</td><td data-label="Time" className="p-3">{formatStudioTime(a.time)}</td><td data-label="Package" className="p-3">{a.package?.name||'—'}</td><td data-label="Status" className="p-3"><StatusBadge status={a.status}/></td><td data-label="Actions" className="p-3"><button type="button" className="text-blue-700 font-semibold" onClick={()=>setSelected(a.id)}>View</button></td></tr>)}</tbody></table></div>
    {detail&&<BookingDialog title="Booking details" onClose={()=>setSelected(null)}><div className="space-y-3 text-sm"><p className="font-mono font-bold">{detail.tracking_number}</p><StatusBadge status={detail.status}/><p><strong>Client:</strong> {detail.client?.name||"—"}</p><p><strong>Package:</strong> {detail.package?.name||"—"}</p><p><strong>Appointment:</strong> {detail.date} · {formatStudioTime(detail.time)}</p><Link className="block rounded-xl bg-gray-900 text-white p-3 text-center" to="/staff/scanner">Open booking scanner</Link></div></BookingDialog>}
  </div>;
}
