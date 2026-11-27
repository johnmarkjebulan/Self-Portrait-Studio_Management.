import DashboardWelcome from "../../components/common/DashboardWelcome";
import SessionClock from "../../components/common/SessionClock";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../../components/common/StatusBadge";
import { studioToday } from "../../utils/date";
import { appointmentsApi, feedbackApi, postsApi, usersApi } from "../../services/api";
export default function StaffDashboard(){
 const [data,setData]=useState({appointments:[],clients:[],feedback:[],posts:[]});
 useEffect(()=>{const refresh=()=>Promise.all([appointmentsApi.getAll(),usersApi.getAll('client'),feedbackApi.getAll(),postsApi.getAll()]).then(([appointments,clients,feedback,posts])=>setData({appointments,clients,feedback,posts})).catch(console.error); refresh(); const id=setInterval(()=>{if(!document.hidden)refresh()},20000);return()=>clearInterval(id)},[]);
 const today=studioToday();
 const cards=[['Today’s Sessions',data.appointments.filter(a=>a.date===today).length],['Registered Clients',data.clients.length],['Client Feedback',data.feedback.length],['Studio Posts',data.posts.length]];
 const ongoing=data.appointments.filter(a=>a.date===today&&a.status==='now_serving');
 return <div className="max-w-6xl mx-auto"><DashboardWelcome role="staff"/><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{cards.map(([l,v])=><div key={l} className="bg-white border rounded-2xl p-5"><p className="text-xs text-gray-500 uppercase tracking-wider">{l}</p><p className="text-3xl font-semibold mt-2">{v}</p></div>)}</div><div className="mt-6 border border-emerald-200 bg-emerald-50 rounded-2xl p-5"><div className="flex items-center justify-between gap-3 flex-wrap"><h2 className="font-semibold text-emerald-900">Taking Pictures — Live Sessions ({ongoing.length})</h2><Link to="/staff/scanner" className="bg-gray-900 text-white px-4 py-2.5 rounded-xl font-semibold text-sm">Scan Booking QR</Link></div>{ongoing.length?<div className="space-y-2 mt-4">{ongoing.map(a=><div key={a.id} className="bg-white rounded-xl p-3 flex flex-wrap justify-between gap-2"><span className="font-semibold text-sm">{a.client?.name} — {a.tracking_number}</span><StatusBadge status={a.status}/><div className="w-full"><SessionClock appointment={a}/></div></div>)}</div>:<p className="text-sm text-gray-500 mt-3">No photography sessions active right now.</p>}</div>
 <div className="mt-6 bg-white border rounded-2xl p-5"><h2 className="font-semibold mb-3">Staff Access</h2><p className="text-sm text-gray-600 leading-relaxed">You can scan booking QR codes, start and complete photography sessions, and view appointments, client records, studio posts, and feedback. Payments verification, system settings, and staff account management remain Admin-only.</p></div></div>
}
