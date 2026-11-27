import {useEffect,useState} from 'react';
export default function SessionClock({appointment}){
 const [now,setNow]=useState(Date.now);
 const active=appointment?.status==='now_serving';
 useEffect(()=>{if(!active)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[active,appointment?.id]);
 if(!active)return null;
 const start=Date.parse(appointment.service_start_at),end=Date.parse(appointment.service_end_at);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return null;
 const seconds=Math.max(0,Math.ceil((end-now)/1000));const progress=Math.min(100,Math.max(0,(now-start)/(end-start)*100));
 return <div className="session-clock"><div><span><i className="booking-state-dot is-live"/> {seconds?'Session time remaining':'Scheduled time elapsed'}</span><strong>{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</strong></div><div className="session-track" role="progressbar" aria-label="Session time elapsed" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${progress}%`}}/></div>{!seconds&&<small>Awaiting studio completion.</small>}</div>
}
