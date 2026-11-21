import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { clientAccountApi } from "../../services/api";

const emptyStats = { totalBookings: 0, completed: 0, cancelled: 0, totalSpent: 0 };
const money = (value) => `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ClientProfile() {
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: user?.name || "", mobile: user?.mobile || "" });
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingPass, setChangingPass] = useState(false);
  const [stats, setStats] = useState(emptyStats);
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setForm({ name: user?.name || "", mobile: user?.mobile || "" });
  }, [user?.id, user?.name, user?.mobile]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    setLoadingStats(true);
    setStatsError("");
    clientAccountApi.getOverview().then((result) => {
      if (active) setStats(result.summary || emptyStats);
    }).catch((err) => {
      if (active) setStatsError(err.message || "Profile statistics are unavailable.");
    }).finally(() => {
      if (active) setLoadingStats(false);
    });
    return () => { active = false; };
  }, [user?.id, retry]);

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    if (saving) return;
    const name = form.name.trim().replace(/\s+/g, " ");
    const mobile = form.mobile.replace(/\s/g, "");
    if (!name || name.length > 150) {
      toast("Enter your full name (up to 150 characters).", "error");
      return;
    }
    if (mobile && !/^09\d{9}$/.test(mobile)) {
      toast("Use a valid PH mobile number (09XXXXXXXXX).", "error");
      return;
    }
    setSaving(true);
    try {
      // AuthContext uses the client-only API for Client accounts and keeps
      // Admin/Staff profile updates on their existing authentication route.
      await updateProfile({ name, mobile });
      toast("Profile updated successfully.", "success");
    } catch (err) {
      toast(err.message || "Failed to update profile.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    if (changingPass) return;
    if (!passwords.current) { toast("Enter your current password.", "error"); return; }
    if (passwords.next.length < 8 || new TextEncoder().encode(passwords.next).length > 72) {
      toast("New password must be at least 8 characters and no more than 72 UTF-8 bytes.", "error");
      return;
    }
    if (passwords.current === passwords.next) { toast("Choose a different password.", "error"); return; }
    if (passwords.next !== passwords.confirm) { toast("New passwords do not match.", "error"); return; }
    setChangingPass(true);
    try {
      await clientAccountApi.changePassword(passwords.current, passwords.next);
      setPasswords({ current: "", next: "", confirm: "" });
      setShowPass(false);
      toast("Password updated successfully.", "success");
    } catch (err) {
      toast(err.message || "Could not change your password.", "error");
    } finally {
      setChangingPass(false);
    }
  };

  const inputClass = "w-full bg-gray-50 border border-gray-200 focus:border-gray-500 focus:bg-white text-gray-900 placeholder:text-gray-400 px-4 py-3 rounded-xl outline-none text-sm transition-colors";
  const displayStats = [
    { label: "Total Bookings", value: stats.totalBookings ?? 0 },
    { label: "Completed", value: stats.completed ?? 0 },
    { label: "Cancelled", value: stats.cancelled ?? 0 },
    { label: "Total Spent", value: money(stats.totalSpent) },
  ];

  return (
    <div className="animate-fade-in max-w-4xl">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold text-gray-900">My Profile</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your personal information and account security.</p>
      </div>

      {statsError && <div role="alert" className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-amber-800 text-sm">{statsError} <button type="button" className="underline font-semibold ml-2" onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-7" aria-label="Your booking statistics">
        {displayStats.map((item) => <div key={item.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center card-shadow min-w-0">
          <p className="text-lg sm:text-2xl font-bold text-gray-900 break-words">{loadingStats ? "…" : item.value}</p>
          <p className="text-gray-500 text-xs mt-1">{item.label}</p>
        </div>)}
      </div>

      <section className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 mb-6 card-shadow">
        <h2 className="font-semibold text-gray-900 mb-4">Account Details</h2>
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100 min-w-0">
          <div className="shrink-0 w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center text-white font-bold text-xl">{user?.name?.charAt(0)?.toUpperCase() || "C"}</div>
          <div className="min-w-0">
            <p className="text-gray-900 font-semibold break-words">{user?.name || "Client"}</p>
            <p className="text-gray-500 text-sm break-all">{user?.email}</p>
            <p className="text-gray-400 text-xs mt-1">Client Account</p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="flex flex-col gap-5">
          <div>
            <label htmlFor="client-profile-name" className="text-gray-500 text-xs uppercase tracking-wider block mb-2">Full Name</label>
            <input id="client-profile-name" required maxLength={150} autoComplete="name" type="text" value={form.name} onChange={event => setForm(data => ({ ...data, name: event.target.value }))} className={inputClass} />
          </div>
          <div>
            <label htmlFor="client-profile-email" className="text-gray-500 text-xs uppercase tracking-wider block mb-2">Email Address</label>
            <input id="client-profile-email" type="email" autoComplete="email" value={user?.email || ""} disabled className="w-full bg-gray-50 border border-gray-100 text-gray-500 px-4 py-3 rounded-xl text-sm cursor-not-allowed" />
            <p className="text-gray-400 text-xs mt-1">Email cannot be changed here.</p>
          </div>
          <div>
            <label htmlFor="client-profile-mobile" className="text-gray-500 text-xs uppercase tracking-wider block mb-2">Mobile Number</label>
            <input id="client-profile-mobile" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={form.mobile} onChange={event => setForm(data => ({ ...data, mobile: event.target.value }))} placeholder="09XXXXXXXXX" className={inputClass} />
            <p className="text-gray-400 text-xs mt-1">Enter 11 digits beginning with 09, or leave blank.</p>
          </div>
          <button type="submit" disabled={saving} className="self-start bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors">{saving ? "Saving…" : "Save Changes"}</button>
        </form>
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 card-shadow">
        <h2 className="font-semibold text-gray-900 mb-4">Change Password</h2>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          {[
            ["current", "Current Password", "current-password"],
            ["next", "New Password", "new-password"],
            ["confirm", "Confirm New Password", "new-password"],
          ].map(([field, label, autoComplete]) => <div key={field}>
            <label htmlFor={`client-profile-${field}`} className="text-gray-500 text-xs uppercase tracking-wider block mb-2">{label}</label>
            <input id={`client-profile-${field}`} type={showPass ? "text" : "password"} value={passwords[field]} onChange={event => setPasswords(data => ({ ...data, [field]: event.target.value }))} required autoComplete={autoComplete} placeholder="••••••••" className={inputClass} />
          </div>)}
          <label className="flex items-center gap-2 text-gray-500 text-xs cursor-pointer self-start">
            <input type="checkbox" checked={showPass} onChange={event => setShowPass(event.target.checked)} className="accent-gray-900" />
            Show passwords
          </label>
          <p className="text-gray-500 text-xs">Use at least 8 characters. Your new password must differ from your current one.</p>
          <button type="submit" disabled={changingPass} className="self-start border border-gray-200 hover:border-gray-400 text-gray-700 font-semibold px-8 py-3 rounded-xl text-sm transition-colors disabled:opacity-60">{changingPass ? "Updating…" : "Update Password"}</button>
        </form>
      </section>
    </div>
  );
}
