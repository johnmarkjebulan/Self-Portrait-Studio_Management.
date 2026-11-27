import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import NotificationBell from '../common/NotificationBell';
import './workspace.css';

const paths = {
 menu:'M4 6h16M4 12h16M4 18h16', close:'M6 6l12 12M18 6L6 18', chevron:'m9 18 6-6-6-6', down:'m6 9 6 6 6-6',
 camera:'M4 7h4l2-3h4l2 3h4a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z M16 14a4 4 0 11-8 0 4 4 0 018 0z',
 expand:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5', shrink:'M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5',
 logout:'M10 17l5-5-5-5m5 5H3m10-8h6a2 2 0 012 2v12a2 2 0 01-2 2h-6', profile:'M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21a8 8 0 0116 0',
};
export function WorkspaceIcon({d, name, size=19}) {return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d || paths[name]}/></svg>}
const roleNames={admin:'Owner workspace',staff:'Studio operations',client:'Client experience'};
const roleCopy={admin:'Studio management',staff:'Daily operations',client:'Your photography journey'};
export default function WorkspaceLayout({role, groups}) {
 const {user,authReady,logout}=useAuth();
 const location=useLocation(); const navigate=useNavigate();
 const collapsed=false;
 const [mobile,setMobile]=useState(false); const [profile,setProfile]=useState(false);
 const [full,setFull]=useState(false); const [clock,setClock]=useState(()=>new Date());
 const profileRef=useRef(null); const contentRef=useRef(null);
 
 useEffect(()=>{setMobile(false);setProfile(false);contentRef.current?.scrollTo(0,0)},[location.pathname]);
 useEffect(()=>{const id=setInterval(()=>setClock(new Date()),30000);const sync=()=>setFull(Boolean(document.fullscreenElement));const close=e=>{if(e.key==='Escape'){setMobile(false);setProfile(false)}};const outside=e=>{if(!profileRef.current?.contains(e.target))setProfile(false)};document.addEventListener('fullscreenchange',sync);document.addEventListener('keydown',close);document.addEventListener('pointerdown',outside);return()=>{clearInterval(id);document.removeEventListener('fullscreenchange',sync);document.removeEventListener('keydown',close);document.removeEventListener('pointerdown',outside)}},[]);
 if(!authReady&&!user)return <div className="workspace-wait" role="status">Opening your workspace…</div>;
 if(!user)return <Navigate to="/login" replace/>;
 if(user.role!==role)return <Navigate to={`/${['admin','staff','client'].includes(user.role)?user.role:'client'}/dashboard`} replace/>;
 const currentPath=location.pathname==='/client/appointments'?'/client/bookings':location.pathname;
 const current=groups.flatMap(g=>g.items).find(i=>i.path===currentPath);
 const title=current?.label || (location.pathname.endsWith('/activity-logs')?'Activity history':location.pathname.endsWith('/settings')?'Studio settings':location.pathname.endsWith('/notifications')?'Notifications':location.pathname.endsWith('/profile')?'My Profile':roleCopy[role]);
 const toggleFull=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{ /* sidebar collapse remains available when browser fullscreen is blocked */ }};
 const signOut=()=>{logout();navigate('/',{replace:true})};
 const initial=(user.name||role).trim().charAt(0).toUpperCase();
 return <div className={`pose-workspace role-${role} ${collapsed?'is-collapsed':''} ${mobile?'mobile-open':''}`}>
   {mobile&&<button className="workspace-overlay" aria-label="Close navigation" onClick={()=>setMobile(false)}/>}
   <aside className="workspace-sidebar" aria-label={`${role} navigation`}>
     <Link to={`/${role}/dashboard`} className="workspace-brand" title="Pose and Pics dashboard"><span className="workspace-logo"><WorkspaceIcon name="camera" size={24}/></span><span className="workspace-brand-text"><strong>Pose &amp; Pics</strong><small>PHOTOGRAPHY STUDIO</small></span></Link>
     <div className="workspace-role"><span className="workspace-live-dot"/><span>{roleNames[role]}</span></div>
     <nav className="workspace-nav">{groups.map((g,i)=><div className="workspace-group" key={g.label||i}>{g.label&&<div className="workspace-group-label">{g.label}</div>}{g.items.map(item=>{const active=currentPath===item.path;return <Link key={item.path} to={item.path} className={`workspace-link ${active?'active':''}`} aria-current={active?'page':undefined} title={item.label} onClick={()=>setMobile(false)}><WorkspaceIcon d={item.d}/><span>{item.label}</span>{active&&<i className="workspace-active-mark"/>}</Link>})}</div>)}</nav>
     <div className="workspace-side-foot"><span className="workspace-live-dot"/><span>Studio workspace</span></div>
   </aside>
   <section className="workspace-main">
    <header className="workspace-header">
     <div className="workspace-heading"><small>{roleCopy[role]} <span>/</span></small><strong>{title}</strong></div>
     <div className="workspace-date"><span>{new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',weekday:'short',month:'short',day:'numeric'}).format(clock)}</span><small>{new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit',hour12:true}).format(clock)}</small></div>
     {document.fullscreenEnabled&&<button className="workspace-icon-button workspace-fullscreen" type="button" onClick={toggleFull} aria-label={full?'Exit fullscreen':'Enter fullscreen'} title={full?'Exit fullscreen':'Fullscreen'}><WorkspaceIcon name={full?'shrink':'expand'}/></button>}
     <NotificationBell role={role}/>
     <div className="workspace-profile" ref={profileRef}><button className="workspace-profile-button" type="button" onClick={()=>setProfile(v=>!v)} aria-expanded={profile} aria-label="Account menu"><span className="workspace-avatar">{initial}</span><span className="workspace-profile-text"><strong>{user.name||role}</strong><small>{role==='admin'?'Administrator':role==='staff'?'Staff':'Client'}</small></span><WorkspaceIcon name="down" size={14}/></button>
       {profile&&<div className="workspace-profile-menu"><div className="workspace-profile-info"><strong>{user.name}</strong><small>{user.email||roleNames[role]}</small></div>{role==='client'&&<Link to="/client/profile" onClick={()=>setProfile(false)}><WorkspaceIcon name="profile" size={17}/>My Profile</Link>}{role==='admin'&&<Link to="/admin/settings" onClick={()=>setProfile(false)}>Studio settings</Link>}{role==='admin'&&<Link to="/admin/activity-logs" onClick={()=>setProfile(false)}>Activity history</Link>}<button type="button" onClick={signOut}><WorkspaceIcon name="logout" size={17}/>Log out</button></div>}
     </div>
    </header>
    <main className="portal-canvas workspace-content" ref={contentRef}><div className="workspace-page" key={location.pathname}><Outlet/></div></main>
   </section>
 </div>
}
