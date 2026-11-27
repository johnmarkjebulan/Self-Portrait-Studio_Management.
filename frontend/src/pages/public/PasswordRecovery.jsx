import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../services/api';
export default function PasswordRecovery({reset=false}) {
  const navigate=useNavigate();
  const [token]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  useEffect(()=>{if(reset && window.location.hash) window.history.replaceState(window.history.state,'',window.location.pathname);},[reset]);
  async function submit(e) {
    e.preventDefault();setError('');setMessage('');
    if(reset && (!token || password!==confirm)){setError(!token?'Open the link from your email or request another one.':'Passwords must match.');return;}
    setBusy(true);
    try {const result=reset?await authApi.resetPassword(token,password):await authApi.forgotPassword(email);setMessage(result.message);if(reset){setPassword('');setConfirm('');navigate('/login',{replace:true,state:{reset:true}});}}
    catch(err){setError(err.message || 'Please try again.');}finally{setBusy(false);}
  }
  const input='w-full min-w-0 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base';
  return <main className="min-h-dvh flex items-center justify-center p-4 sm:p-8 bg-[#f8f3ef]"><section className="w-full max-w-md bg-white border border-[#ebdcd1] rounded-3xl p-5 sm:p-9 shadow-sm"><Link to="/" className="text-xs font-semibold tracking-widest text-[#805b4b]">POSE &amp; PICS STUDIO</Link><h1 className="font-display text-3xl mt-5 mb-2 text-gray-900">{reset?'Create a new password':'Forgot password?'}</h1><p className="text-sm text-gray-600 mb-6">{reset?'Choose a new password for your account.':'Enter your registered email address. We will send a secure reset link if your account is eligible.'}</p>
    {error&&<p role="alert" className="p-3 rounded-xl bg-red-50 text-red-700 text-sm mb-3">{error}</p>}{message&&<p role="status" className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm mb-3">{message}</p>}
    <form onSubmit={submit} className="space-y-4">{reset?<><label className="block text-sm">New password<input required minLength={8} autoComplete="new-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} className={input}/></label><label className="block text-sm">Confirm password<input required minLength={8} autoComplete="new-password" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} className={input}/></label></>:<label className="block text-sm">Email address<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className={input} placeholder="you@example.com"/></label>}
    <button disabled={busy||(reset&&!token)} className="w-full rounded-xl bg-[#795449] text-white py-3 font-semibold disabled:opacity-50" type="submit">{busy?'Please wait…':reset?'Reset password':'Send reset link'}</button></form><div className="flex justify-between gap-2 mt-6 text-sm"><Link to="/login" className="text-[#795449] font-semibold">Back to login</Link>{reset&&<Link to="/forgot-password" className="text-[#795449]">New reset link</Link>}</div></section></main>;
}
