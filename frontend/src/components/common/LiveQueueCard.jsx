import SessionClock from "./SessionClock";
export default function LiveQueueCard({appointment}) {
  const q=appointment?.live_queue;
  if(!q) return null;
  const active=q.isNowServing;
  const items=[['Your queue',q.queueNumber ? `#${q.queueNumber}`:'Awaiting number']];
  if(!active) items.push(['Now serving',q.nowServingNumbers?.length ? q.nowServingNumbers.map(n=>`#${n}`).join(', '):q.activeCount?'Session active':'No active session'],['Ahead of you',String(q.ahead)],['Estimated wait',q.ahead===0?'Next in line':q.estimated==null?'Awaiting update':`~${q.estimated} min`]);
  return <section className={`rounded-2xl border p-5 ${active?'bg-emerald-50 border-emerald-200':'bg-purple-50 border-purple-200'}`} aria-live="polite">
    <div className="flex items-center gap-2 mb-4"><span className={`w-2.5 h-2.5 rounded-full animate-pulse ${active?'bg-emerald-500':'bg-purple-500'}`}/><h3 className={`font-semibold ${active?'text-emerald-800':'text-purple-800'}`}>{active?"It's your turn! Taking pictures":q.ahead===0?'You are next in line':"You're in the queue"}</h3></div>
    <div className={`grid gap-3 ${active?'grid-cols-1':'grid-cols-2 sm:grid-cols-4'}`}>{items.map(([label,value])=><div key={label} className="bg-white/70 rounded-xl p-3 text-center"><p className="text-lg font-bold text-gray-900">{value}</p><p className="text-xs text-gray-500">{label}</p></div>)}</div>
    {active?<SessionClock appointment={appointment}/>:<p className="text-xs text-gray-500 mt-3">Updates automatically. Waiting time is an estimate; please wait for staff confirmation.</p>}
  </section>;
}
