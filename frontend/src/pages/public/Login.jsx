import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const [form, setForm] = useState({ email: location.state?.email || "", password: "" });
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
    const email = form.email.trim();
    if (!email) next.email = "Email is required.";
    else if (!emailPattern.test(email)) next.email = "Enter a valid email address.";
    if (!form.password) next.password = "Password is required.";
    return next;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      if (nextErrors.email) emailRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }

    setLoading(true);
    setErrors({});
    try {
      const result = await login(form.email.trim().toLowerCase(), form.password);
      if (result?.success) {
        toast("Welcome back!", "success");
        const path = result.user?.role === "admin"
          ? "/admin/dashboard"
          : result.user?.role === "staff"
            ? "/staff/dashboard"
            : "/client/dashboard";
        navigate(path, { replace: true });
      } else {
        const message = result?.message || "Unable to sign in. Please try again.";
        setErrors({ general: message });
        toast(message, "error");
      }
    } catch (err) {
      // AuthContext normally returns { success: false }, but guard unexpected errors too.
      const message = err?.message || "Could not connect to the studio. Please try again.";
      setErrors({ general: message });
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-gray-50 border border-gray-200 focus:border-gray-400 focus:bg-white text-gray-900 placeholder:text-gray-400 px-4 py-3 rounded-xl outline-none text-sm transition-colors focus-visible:ring-2 focus-visible:ring-gray-300";

  return (
    <div className="min-h-screen flex">
      <div className="auth-photo-panel hidden lg:flex flex-1 relative overflow-hidden">
        <img src="/studio-media/hero-main.jpg" alt="Studio portrait" className="auth-photo-motion absolute inset-0 w-full h-full object-cover" />
        <div className="auth-light-leak" />
        <div className="absolute bottom-16 left-12 right-12">
          <p className="font-display text-3xl font-light text-white leading-snug mb-3">
            "Every portrait is a story waiting to be told."
          </p>
          <p className="text-white/50 text-sm">- Pose and Pics Photography Studio</p>
        </div>
        <div className="absolute top-8 left-8">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
              <span className="text-white font-bold text-xs">SP</span>
            </div>
            <span className="text-white/80 font-semibold text-sm">Pose and Pics Photography Studio</span>
          </Link>
        </div>
      </div>

      <div className="auth-form-panel flex-1 bg-white flex items-center justify-center px-4 sm:px-8 py-10 sm:py-16">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center">
                <span className="text-white font-bold text-xs">SP</span>
              </div>
              <span className="font-semibold text-gray-900 text-sm">Pose and Pics Photography Studio</span>
            </Link>
          </div>

          <h1 className="font-display text-3xl font-light text-gray-900 mb-1">Welcome back</h1>
          <p className="text-gray-500 text-sm mb-8">One login for Owner, Staff, and Client accounts.</p>

          {errors.general && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-6">
              {errors.general}
            </div>
          )}
          {location.state?.registered && (
            <div role="status" className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-xl mb-5">
              Account created successfully. Please log in.
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            <div>
              <label htmlFor="login-email" className="text-gray-500 text-xs uppercase tracking-wider block mb-2">Email Address</label>
              <input
                ref={emailRef}
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={form.email}
                onChange={updateField("email")}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "login-email-error" : undefined}
                placeholder="you@example.com"
                className={inputClass}
              />
              {errors.email && <p id="login-email-error" role="alert" className="text-red-600 text-xs mt-1.5">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="login-password" className="text-gray-500 text-xs uppercase tracking-wider block mb-2">Password</label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  id="login-password"
                  name="password"
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={updateField("password")}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "login-password-error" : undefined}
                  placeholder="Enter your password"
                  className={`${inputClass} pr-16`}
                />
                <button
                  type="button"
                  aria-label={showPass ? "Hide password" : "Show password"}
                  aria-pressed={showPass}
                  onClick={() => setShowPass((previous) => !previous)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
              {errors.password && <p id="login-password-error" role="alert" className="text-red-600 text-xs mt-1.5">{errors.password}</p>}
            </div>

            <button type="submit" disabled={loading} aria-busy={loading} className="studio-cta bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-all text-sm">
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="text-gray-500 text-sm text-center mt-8">
            Don't have an account?{" "}
            <Link to="/register" className="text-gray-900 hover:text-gray-700 font-semibold transition-colors">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
