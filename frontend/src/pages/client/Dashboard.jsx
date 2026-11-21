import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { clientAccountApi } from "../../services/api";
import { StatusBadge } from "../../components/common/StatusBadge";

const money = (value) => `₱${Number(value || 0).toLocaleString("en-PH", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
const formatDate = (date) => {
  if (!date) return "Date to be confirmed";
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? "Date to be confirmed" :
    parsed.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
};

export default function ClientDashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    async function load() {
      try {
        const data = await clientAccountApi.getOverview();
        if (active) {
          setOverview(data);
          setError("");
        }
      } catch (err) {
        if (active) setError(err.message || "Could not load your dashboard.");
      } finally {
        if (active) setLoading(false);
      }
    }

    setOverview(null);
    setLoading(true);
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [user?.id, retry]);

  const summary = overview?.summary || {};
  const nextSession = overview?.nextSession;
  const queueSession = overview?.queueSession;
  const paymentReminder = overview?.paymentReminder;
  const recent = overview?.recentBookings || [];
  const notifications = overview?.recentNotifications || [];

  if (loading && !overview) {
    return <div role="status" className="bg-white border border-gray-200 rounded-2xl p-8 text-sm text-gray-500 card-shadow">Loading your dashboard…</div>;
  }

  if (!overview) {
    return (
      <div role="alert" className="bg-white rounded-2xl border border-red-200 p-8 card-shadow">
        <h1 className="text-gray-900 font-semibold">Dashboard temporarily unavailable</h1>
        <p className="text-sm text-red-600 mt-2">{error || "Please check your connection and try again."}</p>
        <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-5 bg-gray-900 text-white text-sm font-semibold rounded-xl px-5 py-2.5">Try again</button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-gray-900">Welcome back, {(user?.name || "Client").trim().split(/\s+/)[0]} 👋</h1>
          <p className="text-gray-500 text-sm mt-1">Here is everything happening with your bookings.</p>
        </div>
        <Link to="/client/profile" className="text-sm font-semibold text-gray-700 border border-gray-200 hover:border-gray-400 bg-white rounded-xl px-4 py-2.5 transition-colors">My Profile</Link>
      </div>

      {error && <div role="alert" className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">Could not refresh the latest data: {error}</div>}

      {paymentReminder && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
          <div className="min-w-0">
            <p className="text-amber-800 text-sm font-semibold">💳 Payment required</p>
            <p className="text-amber-700 text-xs mt-1 break-words">Booking {paymentReminder.tracking_number} is awaiting payment.</p>
          </div>
          <Link to="/client/payments" className="shrink-0 text-center bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors">View Payments</Link>
        </div>
      )}

      {nextSession && (
        <section className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 card-shadow">
          <h2 className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-4">Your Next Session</h2>
          <div className="flex flex-col sm:flex-row sm:justify-between gap-4">
            <div className="min-w-0">
              <p className="text-gray-900 font-semibold text-lg break-words">{nextSession.package?.name || "Photography Session"}</p>
              <p className="text-gray-500 text-sm mt-1">{formatDate(nextSession.date)} · {nextSession.time || "Time to be confirmed"}</p>
              <div className="flex flex-wrap gap-2 mt-3"><StatusBadge status={nextSession.status} /><StatusBadge status={nextSession.payment_status} /></div>
            </div>
            <div className="sm:text-right shrink-0">
              <p className="text-gray-400 text-xs">Total</p>
              <p className="font-mono text-xl font-bold text-gray-900">{money(nextSession.total_price)}</p>
              {nextSession.remaining_balance > 0 && <p className="text-gray-500 text-xs mt-1">Balance: {money(nextSession.remaining_balance)}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-5 pt-4 border-t border-gray-100">
            <Link to="/client/bookings" className="text-center bg-gray-900 hover:bg-gray-800 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors">View Booking</Link>
            {nextSession.payment_status === "payment_required" && <Link to="/client/payments" className="text-center border border-gray-200 hover:border-gray-400 text-gray-700 font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors">View Payments</Link>}
          </div>
        </section>
      )}

      {queueSession && (
        <section className="bg-purple-50 border border-purple-200 rounded-2xl p-5">
          <p className="text-purple-800 text-sm font-bold">{queueSession.status === "now_serving" ? "Your photo session is active" : "You are checked in"}</p>
          <div className="flex flex-wrap items-center gap-4 mt-3">
            <div><p className="text-gray-500 text-xs">Queue Number</p><p className="text-2xl font-bold font-mono text-purple-800">{queueSession.queue_number ? `#${queueSession.queue_number}` : "Not assigned"}</p></div>
            <StatusBadge status={queueSession.status} />
          </div>
          <p className="text-gray-500 text-xs mt-3">Queue position and estimated waiting time are not shown without confirmed live queue data.</p>
        </section>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Upcoming Bookings", value: summary.upcomingBookings ?? 0, hint: "Scheduled sessions", href: "/client/bookings" },
          { label: "Pending Payments", value: summary.pendingPayments ?? 0, hint: "Need your attention", href: "/client/payments" },
          { label: "Completed Sessions", value: summary.completed ?? 0, hint: "Photography sessions", href: "/client/bookings" },
          { label: "Unread Notifications", value: summary.unreadNotifications ?? 0, hint: "Latest studio updates", href: null },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-xl border border-gray-200 p-5 card-shadow min-w-0">
            <p className="text-2xl font-bold text-gray-900">{item.value}</p>
            <p className="text-gray-700 text-xs font-medium mt-1">{item.label}</p>
            <p className="text-gray-400 text-xs mt-0.5">{item.hint}</p>
            {item.href && <Link className="inline-block text-gray-600 underline underline-offset-2 text-xs mt-3 hover:text-gray-900" to={item.href}>View details</Link>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <section className="lg:col-span-2 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-gray-900 font-semibold text-sm">Recent Bookings</h2>
            <Link to="/client/bookings" className="text-gray-500 hover:text-gray-800 text-xs">View all</Link>
          </div>
          {recent.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center card-shadow">
              <p className="text-gray-600 font-semibold">No bookings yet</p>
              <p className="text-gray-500 text-sm my-3">Your future photography sessions will appear here.</p>
              <Link to="/client/book" className="inline-flex bg-gray-900 text-white font-semibold px-5 py-3 rounded-xl text-sm hover:bg-gray-800">Book a Session</Link>
            </div>
          ) : <div className="flex flex-col gap-3">
            {recent.map((appt) => (
              <Link key={appt.id} to="/client/bookings" className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 card-shadow hover:border-gray-300 transition-colors">
                <div className="min-w-0">
                  <p className="text-gray-900 font-semibold text-sm break-words">{appt.package?.name || "Photography Session"}</p>
                  <p className="text-gray-500 text-xs mt-1">{formatDate(appt.date)} · {appt.time || "Time pending"}</p>
                  <p className="text-gray-400 font-mono text-xs mt-1">{appt.tracking_number}</p>
                </div>
                <StatusBadge status={appt.status} />
              </Link>
            ))}
          </div>}
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-5 card-shadow min-w-0" aria-label="Recent studio notifications">
          <h2 className="text-gray-900 font-semibold text-sm mb-4">Studio Updates</h2>
          {notifications.length === 0 ? <p className="text-gray-500 text-sm">No notifications yet.</p> : (
            <div className="space-y-4">
              {notifications.map((notification) => (
                <div key={notification.id} className="border-b border-gray-100 last:border-b-0 pb-3 last:pb-0">
                  <p className="text-gray-900 text-sm font-semibold break-words">{!notification.read && <span className="inline-block bg-amber-400 w-2 h-2 rounded-full mr-2" aria-label="Unread" />}{notification.title}</p>
                  <p className="text-gray-500 text-xs mt-1 break-words">{notification.message}</p>
                </div>
              ))}
            </div>
          )}
          <p className="text-gray-400 text-xs mt-4">Read and notification-management tools are part of the upcoming notifications feature.</p>
        </section>
      </div>
    </div>
  );
}
