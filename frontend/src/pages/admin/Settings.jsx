import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { settingsApi, authApi } from "../../services/api";
import StudioPaymentQR from "../../components/common/StudioPaymentQR";

const TABS = [
  { value: "profile", label: "My Profile" },
  { value: "studio", label: "Studio Info" },
  { value: "availability", label: "Hours & Capacity" },
  { value: "booking", label: "Payment Policy" },
  { value: "cancellation", label: "Cancellation" },
  { value: "payment", label: "QR Payment" },
];

const DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function InputField({ label, value, onChange, type = "text", disabled = false, hint = "" }) {
  return (
    <div>
      <label className="text-gray-500 text-xs uppercase tracking-wider block mb-2">
        {label}
      </label>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange && onChange(e.target.value)}
        className={`w-full border px-4 py-3 rounded-xl outline-none text-sm transition-colors ${
          disabled
            ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
            : "bg-white border-gray-200 focus:border-gray-400 text-gray-900"
        }`}
      />
      {hint && <p className="text-gray-400 text-xs mt-1">{hint}</p>}
    </div>
  );
}

export default function AdminSettings() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState("profile");
  const [form, setForm] = useState({ name: user?.name || "", mobile: user?.mobile || "" });
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [qrUploading, setQrUploading] = useState(false);
  const [qrRefresh, setQrRefresh] = useState(0);

  useEffect(() => {
    settingsApi
      .get()
      .then((data) => setSettings(data))
      .catch((err) => { setLoadError(err.message || "Failed to load settings."); toast(err.message || "Failed to load settings.", "error"); })
      .finally(() => setLoading(false));
  }, []);

  const saveSettings = async (partial) => {
    try {
      const updated = await settingsApi.update(partial);
      setSettings(updated);
      toast("Settings saved.", "success");
    } catch (err) {
      toast(err.message || "Failed to save settings.", "error");
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      await authApi.updateProfile({ name: form.name, mobile: form.mobile });
      toast("Profile saved.", "success");
    } catch (err) {
      toast(err.message || "Failed to save profile.", "error");
    }
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    if (passwords.next.length < 8) {
      toast("Password must be at least 8 characters.", "error");
      return;
    }
    if (passwords.next !== passwords.confirm) {
      toast("Passwords do not match.", "error");
      return;
    }
    try {
      await authApi.changePassword(passwords.current, passwords.next);
      setPasswords({ current: "", next: "", confirm: "" });
      toast("Password updated.", "success");
    } catch (err) {
      toast(err.message || "Failed to update password.", "error");
    }
  };

  if (!loading && loadError && !settings) return (
    <div role="alert" className="max-w-xl rounded-xl bg-red-50 border border-red-200 text-red-800 p-6">
      <h1 className="font-semibold text-lg">Could not load studio settings</h1>
      <p className="text-sm mt-2">{loadError}</p>
      <button type="button" onClick={() => window.location.reload()} className="mt-4 underline text-sm font-semibold">Retry</button>
    </div>
  );
  if (loading || !settings) {
    return (
      <div className="animate-fade-in max-w-2xl">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-semibold text-gray-900">Settings</h1>
        </div>
        <div className="h-32 flex items-center justify-center text-gray-400 text-sm">
          Loading settings…
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-2xl">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage your account and studio configuration.
        </p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.value
                ? "bg-gray-900 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* My Profile */}
      {tab === "profile" && (
        <div className="flex flex-col gap-6">
          <div className="bg-white rounded-2xl border border-gray-200 card-shadow p-6">
            <h2 className="font-semibold text-gray-900 mb-5">Admin Profile</h2>
            <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
              <InputField
                label="Full Name"
                value={form.name}
                onChange={(v) => setForm((p) => ({ ...p, name: v }))}
              />
              <InputField
                label="Mobile"
                value={form.mobile}
                onChange={(v) => setForm((p) => ({ ...p, mobile: v }))}
                type="tel"
              />
              <InputField label="Email" value={user?.email || ""} disabled />
              <button
                type="submit"
                className="self-start bg-gray-900 hover:bg-gray-800 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors"
              >
                Save Profile
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 card-shadow p-6">
            <h2 className="font-semibold text-gray-900 mb-5">Change Password</h2>
            <form onSubmit={handlePassword} className="flex flex-col gap-4">
              {[
                { label: "Current Password", field: "current" },
                { label: "New Password", field: "next" },
                { label: "Confirm New Password", field: "confirm" },
              ].map((f) => (
                <div key={f.field}>
                  <label className="text-gray-500 text-xs uppercase tracking-wider block mb-2">
                    {f.label}
                  </label>
                  <input
                    type="password"
                    value={passwords[f.field]}
                    onChange={(e) =>
                      setPasswords((p) => ({ ...p, [f.field]: e.target.value }))
                    }
                    placeholder="••••••••"
                    className="w-full bg-white border border-gray-200 focus:border-gray-400 text-gray-900 placeholder:text-gray-400 px-4 py-3 rounded-xl outline-none text-sm"
                  />
                </div>
              ))}
              <button
                type="submit"
                className="self-start border border-gray-200 hover:border-gray-400 text-gray-700 px-8 py-3 rounded-xl text-sm transition-colors"
              >
                Update Password
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Studio Info */}
      {tab === "studio" && (
        <div className="bg-white rounded-2xl border border-gray-200 card-shadow p-6">
          <h2 className="font-semibold text-gray-900 mb-5">Studio Information</h2>
          <div className="flex flex-col gap-4">
            <InputField
              label="Studio Name"
              value={settings.studio_name}
              onChange={(v) => setSettings((s) => ({ ...s, studio_name: v }))}
            />
            <InputField
              label="Address"
              value={settings.studio_address}
              onChange={(v) => setSettings((s) => ({ ...s, studio_address: v }))}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField
                label="Latitude"
                value={String(settings.studio_lat)}
                onChange={(v) =>
                  setSettings((s) => ({ ...s, studio_lat: parseFloat(v) || s.studio_lat }))
                }
                type="number"
              />
              <InputField
                label="Longitude"
                value={String(settings.studio_lng)}
                onChange={(v) =>
                  setSettings((s) => ({ ...s, studio_lng: parseFloat(v) || s.studio_lng }))
                }
                type="number"
              />
            </div>
            <InputField
              label="Phone Number"
              value={settings.studio_phone}
              onChange={(v) => setSettings((s) => ({ ...s, studio_phone: v }))}
              type="tel"
            />
            <InputField
              label="Email"
              value={settings.studio_email}
              onChange={(v) => setSettings((s) => ({ ...s, studio_email: v }))}
              type="email"
            />
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 leading-relaxed">
              Studio address and coordinates are shown on the public landing page for clients to
              find the studio.
            </div>
            <button
              onClick={() =>
                saveSettings({
                  studio_name: settings.studio_name,
                  studio_address: settings.studio_address,
                  studio_lat: settings.studio_lat,
                  studio_lng: settings.studio_lng,
                  studio_phone: settings.studio_phone,
                  studio_email: settings.studio_email,
                })
              }
              className="self-start bg-gray-900 hover:bg-gray-800 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors"
            >
              Save Studio Info
            </button>
          </div>
        </div>
      )}

      {/* Operating hours and capacity */}
      {tab === "availability" && (
        <div className="bg-white rounded-2xl border border-gray-200 card-shadow p-4 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Default Operating Rules</h2>
          <p className="text-gray-500 text-sm mb-6">These rules generate client booking slots automatically. Admin Schedules only overrides specific dates or times.</p>

          <div className="space-y-3 mb-7">
            {DAY_KEYS.map((day) => {
              const hours = settings.business_hours?.[day] || { open: "09:00", close: "17:00", closed: day === "Sun" };
              const updateHours = (changes) => setSettings((current) => ({
                ...current,
                business_hours: {
                  ...(current.business_hours || {}),
                  [day]: { ...hours, ...changes },
                },
              }));
              return (
                <div key={day} className="grid grid-cols-1 sm:grid-cols-[70px_1fr_1fr_auto] gap-2 sm:gap-3 items-center rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="font-semibold text-sm text-gray-800">{day}</div>
                  <label className="text-xs text-gray-500">
                    <span className="block mb-1">Open</span>
                    <input type="time" value={hours.open || "09:00"} disabled={hours.closed}
                      onChange={(e) => updateHours({ open: e.target.value })}
                      className="w-full bg-white border border-gray-200 px-3 py-2 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-400" />
                  </label>
                  <label className="text-xs text-gray-500">
                    <span className="block mb-1">Close</span>
                    <input type="time" value={hours.close || "17:00"} disabled={hours.closed}
                      onChange={(e) => updateHours({ close: e.target.value })}
                      className="w-full bg-white border border-gray-200 px-3 py-2 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-400" />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-600 sm:pt-5">
                    <input type="checkbox" checked={Boolean(hours.closed)} onChange={(e) => updateHours({ closed: e.target.checked })} className="w-4 h-4 accent-gray-900" />
                    Closed
                  </label>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <InputField label="Daily Capacity" type="number" value={settings.daily_capacity}
              onChange={(v) => setSettings((s) => ({ ...s, daily_capacity: Math.max(1, parseInt(v) || 1) }))}
              hint="Maximum active bookings for one date." />
            <InputField label="Slot Capacity" type="number" value={settings.slot_capacity}
              onChange={(v) => setSettings((s) => ({ ...s, slot_capacity: Math.max(1, parseInt(v) || 1) }))}
              hint="Maximum bookings at the same time." />
            <InputField label="Slot Interval (minutes)" type="number" value={settings.slot_interval_minutes || 60}
              onChange={(v) => setSettings((s) => ({ ...s, slot_interval_minutes: Math.max(15, parseInt(v) || 60) }))}
              hint="15–240 minutes between generated start times." />
          </div>

          <button onClick={() => saveSettings({
            business_hours: settings.business_hours,
            daily_capacity: settings.daily_capacity,
            slot_capacity: settings.slot_capacity,
            slot_interval_minutes: settings.slot_interval_minutes || 60,
          })}
            className="bg-gray-900 hover:bg-gray-800 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors">
            Save Operating Rules
          </button>
        </div>
      )}

      {/* Booking Policy */}
      {tab === "booking" && (
        <div className="bg-white rounded-2xl border border-gray-200 card-shadow p-6">
          <h2 className="font-semibold text-gray-900 mb-5">Payment & Check-in Policy</h2>
          <div className="flex flex-col gap-5">
            <div>
              <label className="text-gray-500 text-xs uppercase tracking-wider block mb-2">
                Down Payment Type
              </label>
              <div className="flex gap-3">
                {["fixed", "percentage"].map((type) => (
                  <button
                    key={type}
                    onClick={() => setSettings((s) => ({ ...s, down_payment_type: type }))}
                    className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      settings.down_payment_type === type
                        ? "border-gray-900 bg-gray-50 text-gray-900"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {type === "fixed" ? "Fixed Amount (₱)" : "Percentage (%)"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-gray-500 text-xs uppercase tracking-wider block mb-2">
                {settings.down_payment_type === "fixed"
                  ? "Down Payment Amount (₱)"
                  : "Down Payment Percentage (%)"}
              </label>
              <input
                type="number"
                value={settings.down_payment_value}
                min="1"
                max={settings.down_payment_type === "percentage" ? "100" : undefined}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    down_payment_value: parseFloat(e.target.value) || 0,
                  }))
                }
                className="w-full bg-white border border-gray-200 focus:border-gray-400 text-gray-900 px-4 py-3 rounded-xl outline-none text-sm"
              />
              <p className="text-gray-400 text-xs mt-1">
                {settings.down_payment_type === "fixed"
                  ? `Clients pay ₱${Number(settings.down_payment_value).toLocaleString()} upon booking regardless of total price.`
                  : `Clients pay ${settings.down_payment_value}% of their total booking upon booking.`}
              </p>
            </div>

            <div>
              <label className="text-gray-500 text-xs uppercase tracking-wider block mb-2">
                Check-in Grace Period (minutes)
              </label>
              <input
                type="number"
                value={settings.grace_period_minutes}
                min="0"
                max="60"
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    grace_period_minutes: parseInt(e.target.value) || 0,
                  }))
                }
                className="w-full bg-white border border-gray-200 focus:border-gray-400 text-gray-900 px-4 py-3 rounded-xl outline-none text-sm"
              />
              <p className="text-gray-400 text-xs mt-1">
                Clients arriving within this window after their scheduled time are not marked
                no-show.
              </p>
            </div>

            <button
              onClick={() =>
                saveSettings({
                  down_payment_type: settings.down_payment_type,
                  down_payment_value: settings.down_payment_value,
                  grace_period_minutes: settings.grace_period_minutes,
                })
              }
              className="self-start bg-gray-900 hover:bg-gray-800 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors"
            >
              Save Booking Policy
            </button>
          </div>
        </div>
      )}

      {/* Cancellation Policy */}
      {tab === "cancellation" && (
        <div className="bg-white rounded-2xl border border-gray-200 card-shadow p-6">
          <h2 className="font-semibold text-gray-900 mb-5">
            Cancellation & Reschedule Policy
          </h2>
          <div className="flex flex-col gap-5">
            <div>
              <label className="text-gray-500 text-xs uppercase tracking-wider block mb-2">
                Cancellation Window (hours before appointment)
              </label>
              <input
                type="number"
                value={settings.cancellation_hours}
                min="0"
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    cancellation_hours: parseInt(e.target.value) || 0,
                  }))
                }
                className="w-full bg-white border border-gray-200 focus:border-gray-400 text-gray-900 px-4 py-3 rounded-xl outline-none text-sm"
              />
              <p className="text-gray-400 text-xs mt-1">
                Clients can only request cancellation if their appointment is at least this many
                hours away. Currently: {settings.cancellation_hours} hours.
              </p>
            </div>

            <div>
              <label className="text-gray-500 text-xs uppercase tracking-wider block mb-2">
                Reschedule Window (hours before appointment)
              </label>
              <input
                type="number"
                value={settings.reschedule_hours}
                min="0"
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    reschedule_hours: parseInt(e.target.value) || 0,
                  }))
                }
                className="w-full bg-white border border-gray-200 focus:border-gray-400 text-gray-900 px-4 py-3 rounded-xl outline-none text-sm"
              />
              <p className="text-gray-400 text-xs mt-1">
                Clients can only request reschedule if their appointment is at least this many
                hours away.
              </p>
            </div>

            <div className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl">
              <input
                type="checkbox"
                id="noShowForfeits"
                checked={settings.no_show_forfeits_downpayment}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    no_show_forfeits_downpayment: e.target.checked,
                  }))
                }
                className="mt-0.5 w-4 h-4 accent-gray-900"
              />
              <div>
                <label
                  htmlFor="noShowForfeits"
                  className="text-gray-900 text-sm font-medium cursor-pointer"
                >
                  No-shows forfeit their down payment
                </label>
                <p className="text-gray-500 text-xs mt-0.5">
                  When enabled, clients are notified their down payment is non-refundable if
                  they don't show up.
                </p>
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-xs text-orange-700 leading-relaxed">
              These policy rules are displayed to clients during cancellation/reschedule requests
              and in their booking confirmation notifications.
            </div>

            <button
              onClick={() =>
                saveSettings({
                  cancellation_hours: settings.cancellation_hours,
                  reschedule_hours: settings.reschedule_hours,
                  no_show_forfeits_downpayment: settings.no_show_forfeits_downpayment,
                })
              }
              className="self-start bg-gray-900 hover:bg-gray-800 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors"
            >
              Save Cancellation Policy
            </button>
          </div>
        </div>
      )}

      {/* QR Payment */}
      {tab === "payment" && (
        <div className="bg-white rounded-2xl border border-gray-200 card-shadow p-6">
          <h2 className="font-semibold text-gray-900 mb-5">QR Ph Payment Numbers</h2>
          <div className="flex flex-col gap-5">
            <div>
              <label className="text-gray-500 text-xs uppercase tracking-wider block mb-2">
                GCash Number
              </label>
              <input
                type="text"
                value={settings.qr_gcash_number ?? ""}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, qr_gcash_number: e.target.value }))
                }
                placeholder="09XXXXXXXXX"
                className="w-full bg-white border border-gray-200 focus:border-gray-400 text-gray-900 placeholder:text-gray-400 px-4 py-3 rounded-xl outline-none text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-gray-500 text-xs uppercase tracking-wider block mb-2">
                Maya Number
              </label>
              <input
                type="text"
                value={settings.qr_paymaya_number ?? ""}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, qr_paymaya_number: e.target.value }))
                }
                placeholder="09XXXXXXXXX"
                className="w-full bg-white border border-gray-200 focus:border-gray-400 text-gray-900 placeholder:text-gray-400 px-4 py-3 rounded-xl outline-none text-sm font-mono"
              />
            </div>

            <div className="border border-gray-200 rounded-2xl p-5 flex flex-col items-center gap-4">
              <p className="text-sm font-semibold text-gray-800">Official Bank / E-wallet QR Ph Image</p>
              <StudioPaymentQR cacheKey={qrRefresh} size={220} />
              <label className={`cursor-pointer text-sm rounded-xl px-5 py-3 border border-gray-200 bg-white hover:bg-gray-50 ${qrUploading ? "opacity-60 pointer-events-none" : ""}`}>
                {qrUploading ? "Uploading..." : "Upload Official Payment QR (JPG/PNG/WebP, max 5 MB)"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={qrUploading} onChange={async e => {
                  const file=e.target.files?.[0];
                  if(!file) return;
                  if(file.size > 5*1024*1024) { toast("Image is larger than 5 MB", "error"); e.target.value=""; return; }
                  setQrUploading(true);
                  try { await settingsApi.uploadPaymentQr(file); setQrRefresh(Date.now()); toast("Official payment QR uploaded successfully", "success"); }
                  catch(err) { toast(err.message || "Payment QR upload failed", "error"); }
                  finally { setQrUploading(false); e.target.value=""; }
                }} />
              </label>
              <p className="text-xs text-gray-500 text-center">Upload the QR image issued by the studio's bank or verified e-wallet. A QR generated from a phone number is not the same as a QR Ph merchant payment code.</p>
            </div>

            <button
              onClick={() =>
                saveSettings({
                  qr_gcash_number: settings.qr_gcash_number,
                  qr_paymaya_number: settings.qr_paymaya_number,
                })
              }
              className="self-start bg-gray-900 hover:bg-gray-800 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors"
            >
              Save Payment Numbers
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
