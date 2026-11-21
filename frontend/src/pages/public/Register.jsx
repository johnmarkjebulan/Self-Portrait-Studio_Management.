import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

export default function Register() {
  const { register } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', mobile: '', password: '', confirmPassword: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Full name is required.';
    if (!form.email.trim()) e.email = 'Gmail address is required.';
    else if (!/^[a-z0-9._%+-]+@gmail\.com$/i.test(form.email.trim())) e.email = 'Use a valid Gmail address (example@gmail.com).';
    if (!form.mobile) e.mobile = 'Mobile number is required.';
    else if (!/^09\d{9}$/.test(form.mobile.replace(/\s/g, ''))) e.mobile = 'Enter a valid PH mobile (09XXXXXXXXX).';
    if (!form.password) e.password = 'Password is required.';
    else if (form.password.length < 8) e.password = 'Password must be at least 8 characters.';
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match.';
    return e;
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      const result = await register({ name: form.name, email: form.email.trim(), mobile: form.mobile, password: form.password });
      if (!result.success) {
        setErrors({ general: result.message });
        toast(result.message, 'error');
        return;
      }
      toast('Account created! Please log in to continue.', 'success');
      navigate('/login', { replace: true, state: { registered: true, email: form.email.trim() } });
    } finally { setLoading(false); }
  }

  const input = 'w-full bg-gray-50 border border-gray-200 focus:border-gray-400 focus:bg-white text-gray-900 placeholder:text-gray-400 px-4 py-3 rounded-xl outline-none text-sm transition-colors';
  const set = (field) => (e) => { setForm({ ...form, [field]: e.target.value }); setErrors((prev) => ({ ...prev, [field]: undefined, general: undefined })); };

  return <div className="min-h-screen flex">
    <div className="auth-photo-panel hidden lg:flex flex-1 relative overflow-hidden">
      <img src="/studio-media/hero-main.jpg" alt="Pose and Pics" className="auth-photo-motion absolute inset-0 w-full h-full object-cover" />
      <div className="auth-light-leak" />
      <div className="absolute bottom-14 left-12 right-12 text-white">
        <h2 className="font-display text-4xl font-light">Your account. Your session.</h2>
        <p className="text-white/70 mt-3 text-sm">Create an account, log in, and manage your appointments online.</p>
      </div>
    </div>
    <div className="auth-form-panel flex-1 bg-white flex items-center justify-center px-4 sm:px-8 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-900">← Back to studio</Link>
        <h1 className="font-display text-3xl font-light text-gray-900 mt-6">Create your account</h1>
        <p className="text-gray-500 text-sm mt-1 mb-6">Register with your Gmail address. No email code is required; log in after registration.</p>
        {errors.general && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{errors.general}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="text-xs uppercase tracking-wider text-gray-500 block mb-2">Full Name</label><input value={form.name} onChange={set('name')} className={input} placeholder="Maria Santos" />{errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}</div>
          <div><label className="text-xs uppercase tracking-wider text-gray-500 block mb-2">Gmail Address</label><input type="email" value={form.email} onChange={set('email')} className={input} placeholder="yourname@gmail.com" />{errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}</div>
          <div><label className="text-xs uppercase tracking-wider text-gray-500 block mb-2">Mobile Number</label><input value={form.mobile} onChange={set('mobile')} className={input} placeholder="09XXXXXXXXX" />{errors.mobile && <p className="text-red-500 text-xs mt-1">{errors.mobile}</p>}</div>
          <div><label className="text-xs uppercase tracking-wider text-gray-500 block mb-2">Password</label><div className="relative"><input type={showPass ? 'text' : 'password'} value={form.password} onChange={set('password')} className={`${input} pr-16`} placeholder="Minimum 8 characters" /><button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500">{showPass ? 'Hide' : 'Show'}</button></div>{errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}</div>
          <div><label className="text-xs uppercase tracking-wider text-gray-500 block mb-2">Confirm Password</label><input type={showPass ? 'text' : 'password'} value={form.confirmPassword} onChange={set('confirmPassword')} className={input} />{errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}</div>
          <button disabled={loading} className="studio-cta w-full bg-gray-900 text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-60 transition-all">{loading ? 'Creating account…' : 'Create Account'}</button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-6">Already registered? <Link to="/login" className="font-semibold text-gray-900">Log in</Link></p>
      </div>
    </div>
  </div>;
}
