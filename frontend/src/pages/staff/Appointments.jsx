import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { appointmentsApi } from "../../services/api";
import { StatusBadge } from "../../components/common/StatusBadge";
export default function StaffAppointments() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    const reload = () => appointmentsApi.getAll().then(setRows).catch(console.error);
    reload();
    const id = setInterval(() => { if (!document.hidden) reload(); }, 20000);
    return () => clearInterval(id);
  }, []);
  const filtered = rows.filter((a) => !q || `${a.tracking_number} ${a.client?.name||''}`.toLowerCase().includes(q.toLowerCase()));
  return <div className="max-w-6xl mx-auto">
    <div className="flex flex-wrap justify-between items-center gap-3 mb-5"><div><h1 className="text-2xl font-semibold">Appointments</h1><p className="text-sm text-gray-500 mt-1">View live session status and scan client booking QR codes.</p></div>
      <Link to="/staff/scanner" className="rounded-xl bg-gray-900 text-white text-sm font-semibold px-5 py-3">Scan Booking QR</Link></div>
    <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search tracking number or client…" className="w-full mb-4 border rounded-xl px-4 py-2.5 text-sm" />
    <div className="bg-white border rounded-2xl overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{['Tracking','Client','Date','Time','Package','Status'].map((h)=><th key={h} className="text-left p-3">{h}</th>)}</tr></thead>
    <tbody>{filtered.map((a)=><tr key={a.id} className="border-t"><td className="p-3 font-mono">{a.tracking_number}</td><td className="p-3">{a.client?.name||'—'}</td><td className="p-3">{a.date}</td><td className="p-3">{a.time}</td><td className="p-3">{a.package?.name||'—'}</td><td className="p-3"><StatusBadge status={a.status}/></td></tr>)}</tbody></table></div>
  </div>;
}
