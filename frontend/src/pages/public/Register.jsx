import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";

const gmailPattern = /^[a-z0-9._%+-]+@gmail\.com$/i;
const mobilePattern = /^09\d{9}$/;
const fieldOrder = ["name", "email", "mobile", "password", "confirmPassword"];

export default function Register() {
  const { register } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const formRefs = useRef({});
  const [form, setForm] = useState({ name: "", email: "", mobile: "", password: "", confirmPassword: "" });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const updateField = (field) => (event) => {
    const value = event.target.value;
    setForm((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined, general: undefined }));
  };

  const validate = () => {
    const next = {};
    const name = form.name.trim().replace(/\s+/g, " ");
    const email = form.email.trim();
    const mobile = form.mobile.replace(/[\s-]/g, "");

    if (!name) next.name = "Full name is required.";
    else if (name.length > 150) next.name = "Full name must be 150 characters or fewer.";

    if (!email) next.email = "Gmail address is required.";
    else if (!gmailPattern.test(email)) next.email = "Use a valid Gmail address (example@gmail.com).";

    if (!mobile) next.mobile = "Mobile number is required.";
    else if (!mobilePattern.test(mobile)) next.mobile = "Enter a valid PH mobile number (09XXXXXXXXX).";

    if (!form.password) next.password = "Password is required.";
    else if (form.password.length < 8) next.password = "Password must be at least 8 characters.";

    if (!form.confirmPassword) next.confirmPassword = "Please confirm your password.";
    else if (form.password !== form.confirmPassword) next.confirmPassword = "Passwords do not match.";
    return next;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const firstInvalid = fieldOrder.find((field) => nextErrors[field]);
      if (firstInvalid) formRefs.current[firstInvalid]?.focus();
      return;
    }

    const normalized = {
      name: form.name.trim().replace(/\s+/g, " "),
      email: form.email.trim().toLowerCase(),
      mobile: form.mobile.replace(/[\s-]/g, ""),
      password: form.password,
    };

    setLoading(true);
    setErrors({});
    try {
      const result = await register(normalized);
      if (!result?.success) {
        const message = result?.message || "Could not create your account. Please try again.";
        setErrors({ general: message });
        toast(message, "error");
        return;
      }
      toast("Account created! Please log in to continue.", "success");
      navigate("/login", { replace: true, state: { registered: true, email: normalized.email } });
    } catch (err) {
      const message = err?.message || "Could not connect to the studio. Please try again.";
      setErrors({ general: message });
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-gray-50 border border-gray-200 focus:border-gray-400 focus:bg-white text-gray-900 placeholder:text-gray-400 px-4 py-3 rounded-xl outline-none text-sm transition-colors focus-visible:ring-2 focus-visible:ring-gray-300";
  const fieldError = (field) => errors[field]
    ? <p id={`register-${field}-error`} role="alert" className="text-red-600 text-xs mt-1.5">{errors[field]}</p>
    : null;
  const describe = (field) => errors[field] ? `register-${field}-error` : undefined;

  return (
    <div className="min-h-screen flex">
      <div className="auth-photo-panel hidden lg:flex flex-1 relative overflow-hidden">
        <img src="/studio-media/hero-main.jpg" alt="Pose and Pics studio" className="auth-photo-motion absolute inset-0 w-full h-full object-cover" />
        <div className="auth-light-leak" />
        <div className="absolute bottom-14 left-12 right-12 text-white">
          <h2 className="font-display text-4xl font-light">Your account. Your session.</h2>
          <p className="text-white/70 mt-3 text-sm">Create an account, log in, and manage your appointments online.</p>
        </div>
      </div>

      <div className="auth-form-panel flex-1 bg-white flex items-center justify-center px-4 sm:px-8 py-12">
        <div className="w-full max-w-md">
          <Link to="/" className="text-sm text-gray-500 hover:text-gray-900">&larr; Back to studio</Link>
          <h1 className="font-display text-3xl font-light text-gray-900 mt-6">Create your account</h1>
          <p className="text-gray-500 text-sm mt-1 mb-6">Register with your Gmail address. No email code is required; log in after registration.</p>
          {errors.general && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-5">{errors.general}</div>}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="register-name" className="text-xs uppercase tracking-wider text-gray-500 block mb-2">Full Name</label>
              <input ref={(node) => { formRefs.current.name = node; }} id="register-name" name="name" autoComplete="name" maxLength={150} value={form.name} onChange={updateField("name")} aria-invalid={Boolean(errors.name)} aria-describedby={describe("name")} className={inputClass} placeholder="Maria Santos" />
              {fieldError("name")}
            </div>
            <div>
              <label htmlFor="register-email" className="text-xs uppercase tracking-wider text-gray-500 block mb-2">Gmail Address</label>
              <input ref={(node) => { formRefs.current.email = node; }} id="register-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={form.email} onChange={updateField("email")} aria-invalid={Boolean(errors.email)} aria-describedby={describe("email")} className={inputClass} placeholder="yourname@gmail.com" />
              {fieldError("email")}
            </div>
            <div>
              <label htmlFor="register-mobile" className="text-xs uppercase tracking-wider text-gray-500 block mb-2">Mobile Number</label>
              <input ref={(node) => { formRefs.current.mobile = node; }} id="register-mobile" name="mobile" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={15} value={form.mobile} onChange={updateField("mobile")} aria-invalid={Boolean(errors.mobile)} aria-describedby={describe("mobile")} className={inputClass} placeholder="09XXXXXXXXX" />
              {fieldError("mobile")}
            </div>
            <div>
              <label htmlFor="register-password" className="text-xs uppercase tracking-wider text-gray-500 block mb-2">Password</label>
              <div className="relative">
                <input ref={(node) => { formRefs.current.password = node; }} id="register-password" name="password" type={showPass ? "text" : "password"} autoComplete="new-password" minLength={8} value={form.password} onChange={updateField("password")} aria-invalid={Boolean(errors.password)} aria-describedby={describe("password") || "register-password-hint"} className={`${inputClass} pr-16`} placeholder="Minimum 8 characters" />
                <button type="button" aria-label={showPass ? "Hide passwords" : "Show passwords"} aria-pressed={showPass} onClick={() => setShowPass((previous) => !previous)} className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700">{showPass ? "Hide" : "Show"}</button>
              </div>
              <p id="register-password-hint" className="mt-1 text-xs text-gray-400">Use at least 8 characters.</p>
              {fieldError("password")}
            </div>
            <div>
              <label htmlFor="register-confirm" className="text-xs uppercase tracking-wider text-gray-500 block mb-2">Confirm Password</label>
              <input ref={(node) => { formRefs.current.confirmPassword = node; }} id="register-confirm" name="confirmPassword" type={showPass ? "text" : "password"} autoComplete="new-password" value={form.confirmPassword} onChange={updateField("confirmPassword")} aria-invalid={Boolean(errors.confirmPassword)} aria-describedby={describe("confirmPassword")} className={inputClass} placeholder="Repeat your password" />
              {fieldError("confirmPassword")}
            </div>
            <button type="submit" disabled={loading} aria-busy={loading} className="studio-cta w-full bg-gray-900 text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-60 transition-all">{loading ? "Creating account..." : "Create Account"}</button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-6">Already registered? <Link to="/login" className="font-semibold text-gray-900">Log in</Link></p>
        </div>
      </div>
    </div>
  );
}
