import { useEffect, useMemo, useState } from "react";
import { appointmentsApi, photoWorkflowApi, usersApi } from "../../services/api";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import { StatusBadge } from "../../components/common/StatusBadge";

const labels = {awaiting_session:"Awaiting Session",editing:"Editing Photos",ready_for_release:"Ready for Release",released:"Photos Released"};
const nextStages = {awaiting_session:[],editing:["ready_for_release"],ready_for_release:["editing","released"],released:[]};
const money = (v) => `₱${Number(v || 0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export default function PhotoSessions() {
  const {user}=useAuth();
  const {toast}=useToast();
  const admin=user?.role==='admin';
  const [rows,setRows]=useState([]);
  const [staff,setStaff]=useState([]);
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("active");
  const [selected,setSelected]=useState(null);
  const [gallery,setGallery]=useState("");
  const [notes,setNotes]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);

  async function refresh(silent=false) {
    try { const all=await appointmentsApi.getAll(); setRows(all);
      setSelected(previous=>previous ? all.find(a=>a.id===previous.id)||previous : null);
    } catch(err){if(!silent)toast(err.message||"Failed to load sessions","error")}
    finally{if(!silent)setLoading(false)}
  }
  useEffect(()=>{
    refresh();
    if(admin) usersApi.getAll("staff").then(setStaff).catch(()=>{});
    const timer=setInterval(()=>{if(!document.hidden)refresh(true)},20000);
    return ()=>clearInterval(timer);
  },[admin]);
  const jobs=useMemo(()=>rows.filter(a=>{
    const q=`${a.tracking_number} ${a.client?.name||''} ${a.package?.name||''}`.toLowerCase();
    if(search&&!q.includes(search.toLowerCase()))return false;
    if(filter==='active') return !['cancelled','rejected','no_show'].includes(a.status);
    if(filter==='editing')return a.photoWorkflow?.stage==='editing';
    if(filter==='ready')return a.photoWorkflow?.stage==='ready_for_release';
    if(filter==='released')return a.photoWorkflow?.stage==='released';
    if(filter==='mine')return a.photoWorkflow?.assigned_staff_id===user?.id;
    return true;
  }).sort((a,b)=>String(b.date ?? "").localeCompare(String(a.date ?? ""))),[rows,search,filter,user?.id]);
  const stats={shooting:rows.filter(a=>a.status==='now_serving').length,editing:rows.filter(a=>a.photoWorkflow?.stage==='editing').length,ready:rows.filter(a=>a.photoWorkflow?.stage==='ready_for_release').length,released:rows.filter(a=>a.photoWorkflow?.stage==='released').length};
  function open(appt){setSelected(appt);setGallery(appt.photoWorkflow?.gallery_url||'');setNotes(appt.photoWorkflow?.internal_notes||'')}
  async function change(action,callback){if(!selected||busy)return;setBusy(true);try{await callback();toast(action,'success');await refresh();}catch(err){toast(err.message||'Update failed','error')}finally{setBusy(false)}}
  const workflow=selected?.photoWorkflow||{};
  const assigned=workflow.assigned_staff_id;
  const canEdit=admin||(assigned===user?.id);
  const allowed=nextStages[workflow.stage||(selected?.status==='completed'?'editing':'awaiting_session')]||[];
  return <div className="max-w-7xl mx-auto animate-fade-in">
    <header className="flex flex-wrap justify-between items-start gap-3 mb-6"><div><h1 className="text-2xl font-semibold text-gray-900">Photo Sessions & Delivery</h1><p className="text-sm text-gray-500 mt-1">Manage photographer assignments, edit progress, ready-for-release checks and client galleries.</p></div><span className="rounded-full bg-emerald-50 text-emerald-700 px-4 py-2 text-xs font-semibold">● Updates every 10 seconds</span></header>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">{[['Taking Pictures',stats.shooting,'bg-blue-50 text-blue-800'],['Editing',stats.editing,'bg-amber-50 text-amber-800'],['Ready',stats.ready,'bg-purple-50 text-purple-800'],['Released',stats.released,'bg-emerald-50 text-emerald-800']].map(([label,n,cls])=><div key={label} className={`p-4 sm:p-5 rounded-2xl border border-black/5 studio-lift ${cls}`}><div className="text-2xl font-semibold tabular-nums">{n}</div><p className="mt-1 text-xs font-medium">{label}</p></div>)}</div>
    <div className="flex flex-wrap gap-2 mb-4"><input className="flex-1 min-w-[180px] border bg-white rounded-xl py-2.5 px-4 text-sm outline-none focus:ring-2 focus:ring-amber-200" placeholder="Search client, booking or package…" value={search} onChange={e=>setSearch(e.target.value)}/><select className="border bg-white rounded-xl px-4 py-2.5 text-sm" value={filter} onChange={e=>setFilter(e.target.value)}>{[['active','Active Bookings'],['editing','Editing'],['ready','Ready for Release'],['released','Released'],...(admin?[]:[['mine','My Assignments']]),['all','All Bookings']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
    <div className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
      <div className="space-y-3">{loading?<p className="p-8 text-center text-gray-500">Loading studio sessions…</p>:jobs.length===0?<p className="p-8 text-center rounded-2xl border bg-white text-gray-500">No bookings match this filter.</p>:jobs.map(a=><button key={a.id} onClick={()=>open(a)} className={`w-full text-left rounded-2xl border bg-white p-4 sm:p-5 transition-all duration-200 studio-lift ${selected?.id===a.id?'border-amber-400 ring-2 ring-amber-100':'border-gray-200 hover:border-amber-300'}`}><div className="flex flex-wrap justify-between items-start gap-2"><div><p className="font-semibold text-gray-900">{a.client?.name||'Client'}</p><p className="text-gray-400 text-xs font-mono mt-1">{a.tracking_number} · {a.date} · {a.time}</p></div><StatusBadge status={a.status}/></div><div className="flex justify-between gap-3 flex-wrap items-center mt-4"><p className="text-xs text-gray-500">{a.package?.name||'Photography'} · {money(a.total_price)}</p><span className="bg-gray-100 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full">{labels[a.photoWorkflow?.stage] || (a.status==='completed'?'Editing Photos':'Awaiting Session')}</span></div></button>)}</div>
      <div className="xl:sticky xl:top-24 rounded-2xl border bg-white p-5 sm:p-6 studio-panel">{!selected?<div className="text-center py-16 text-gray-500"><p className="text-4xl mb-3">📸</p><p className="font-medium text-gray-800">Select a booking</p><p className="text-sm mt-2">Assign a photographer, track editing and release photos.</p></div>:<div className="space-y-4"><div><p className="text-xs uppercase font-semibold tracking-widest text-amber-600 mb-1">Photo Workflow</p><h2 className="font-semibold text-lg">{selected.client?.name||'Client'}</h2><p className="text-xs text-gray-500 mt-1">{selected.tracking_number}</p></div><div className="grid grid-cols-2 gap-2"><div className="rounded-xl bg-gray-50 p-3"><p className="text-[11px] text-gray-400">Session</p><p className="text-sm font-semibold capitalize">{selected.status==='now_serving'?'Taking Pictures':selected.status.replaceAll('_',' ')}</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-[11px] text-gray-400">Photo Status</p><p className="text-sm font-semibold">{labels[workflow.stage]||(selected.status==='completed'?'Editing Photos':'Awaiting Session')}</p></div></div>
      <label className="block"><span className="text-xs font-semibold text-gray-600">Assigned Photographer</span>{admin?<select disabled={busy} className="w-full mt-1.5 border rounded-xl p-3 bg-white text-sm disabled:bg-gray-50" value={assigned||''} onChange={e=>change('Photographer assignment updated',()=>photoWorkflowApi.assign(selected.id,e.target.value||null))}><option value="">Unassigned</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}{s.is_active===false?' (inactive)':''}</option>)}</select>:<div className="w-full mt-1.5 border rounded-xl p-3 bg-gray-50 text-sm">{workflow.photographer?.name||'No photographer assigned yet'}</div>}{!admin&&<p className="text-xs text-gray-400 mt-1">Only Admin can assign photographers.</p>}</label>
      {selected.status!=='completed'&&<p className="rounded-xl bg-blue-50 border border-blue-100 text-blue-800 p-3 text-xs">Photo editing becomes available after the session is completed in the QR scanner or appointments dashboard.</p>}
      {selected.status==='completed'&&<><label className="block"><span className="text-xs font-semibold text-gray-600">Secure HTTPS Gallery Link</span><input value={gallery} onChange={e=>setGallery(e.target.value)} disabled={!canEdit||busy||workflow.stage==='released'} placeholder="https://your-private-gallery.example/..." className="w-full mt-1.5 border rounded-xl p-3 text-sm disabled:bg-gray-50" /></label><label className="block"><span className="text-xs font-semibold text-gray-600">Internal Editing Notes</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} disabled={!canEdit||busy||workflow.stage==='released'} rows={3} className="w-full mt-1.5 border rounded-xl p-3 text-sm disabled:bg-gray-50" placeholder="Editing tasks / release checklist…"/></label>{canEdit&&workflow.stage!=='released'&&<button disabled={busy} onClick={()=>change('Gallery and notes saved',()=>photoWorkflowApi.details(selected.id,{gallery_url:gallery,internal_notes:notes}))} className="w-full rounded-xl border py-2.5 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">Save Gallery & Notes</button>}
      <div className="space-y-2">{allowed.filter(stage=>admin||stage!=='released').map(stage=><button key={stage} disabled={!canEdit||busy||(stage==='released'&&!gallery.trim())} onClick={()=>{if(!window.confirm(`Change ${selected.tracking_number} photo status to ${labels[stage]}?`))return;change('Photo workflow updated',()=>photoWorkflowApi.stage(selected.id,stage,{gallery_url:gallery,internal_notes:notes}))}} className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold text-sm rounded-xl py-3 disabled:opacity-40">{busy?'Updating…':stage==='released'?'Release Photo Gallery':`Mark ${labels[stage]}`}</button>)}</div>
      {workflow.stage==='released'&&workflow.gallery_url&&<a href={workflow.gallery_url} target="_blank" rel="noreferrer" className="block text-center rounded-xl border border-emerald-300 bg-emerald-50 py-3 font-semibold text-sm text-emerald-800">View Released Gallery ↗</a>}
      {!canEdit&&<p className="text-xs text-gray-500">Only the assigned photographer or Admin can update this session.</p>}</>}
      </div>}</div>
    </div>
  </div>;
}
