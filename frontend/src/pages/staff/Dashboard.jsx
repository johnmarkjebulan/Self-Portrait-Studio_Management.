import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../../components/common/StatusBadge";
import { useAuth } from "../../contexts/AuthContext";
import { appointmentsApi, feedbackApi, postsApi, usersApi } from "../../services/api";
import { studioToday } from "../../utils/date";

const ACTIVE_STATUSES = new Set(["confirmed", "rescheduled", "checked_in", "waiting", "now_serving"]);
const UPCOMING_STATUSES = new Set(["pending", "confirmed", "rescheduled", "checked_in", "waiting"]);

function SummaryCard({ label, value, note }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{note}</p>
    </section>
  );
}

function SessionList({ title, subtitle, appointments, emptyMessage, link }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
        </div>
        {link && <Link className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50" to={link}>View appointments</Link>}
      </div>
      {appointments.length ? (
        <div className="mt-4 space-y-3">
          {appointments.map((appointment) => (
            <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-gray-900">{appointment.client?.name || "Client"} <span className="font-normal text-gray-500">· {appointment.tracking_number || "No tracking number"}</span></p>
                <p className="mt-1 text-xs text-gray-600">{appointment.date || "—"} at {appointment.time || "—"} · {appointment.package?.name || "Package unavailable"}</p>
                {appointment.photoWorkflow?.photographer?.name && (
                  <p className="mt-1 text-xs text-gray-500">Assigned photographer: {appointment.photoWorkflow.photographer.name}</p>
                )}
              </div>
              <StatusBadge status={appointment.status} />
            </div>
          ))}
        </div>
      ) : <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">{emptyMessage}</p>}
    </section>
  );
}

export default function StaffDashboard() {
  const { user } = useAuth();
  const isMounted = useRef(false);
  const [data, setData] = useState({ appointments: [], clients: [], feedback: [], posts: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useCallback(async () => {
    if (!isMounted.current) return;
    setRefreshing(true);
    setError("");
    try {
      const [appointments, clients, feedback, posts] = await Promise.all([
        appointmentsApi.getAll(),
        usersApi.getAll("client"),
        feedbackApi.getAll(),
        postsApi.getAll(),
      ]);
      if (!isMounted.current) return;
      setData({
        appointments: Array.isArray(appointments) ? appointments : [],
        clients: Array.isArray(clients) ? clients : [],
        feedback: Array.isArray(feedback) ? feedback : [],
        posts: Array.isArray(posts) ? posts : [],
      });
      setLastUpdated(new Date());
    } catch (err) {
      if (isMounted.current) setError(err?.message || "Could not load staff dashboard information.");
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    refresh();
    // Refresh less frequently than the original dashboard to reduce repeated API requests.
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    return () => { isMounted.current = false; window.clearInterval(timer); };
  }, [refresh]);

  const today = studioToday();
  const view = useMemo(() => {
    const todays = data.appointments.filter((item) => item.date === today);
    const upcoming = data.appointments
      .filter((item) => item.date >= today && UPCOMING_STATUSES.has(item.status))
      .sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`))
      .slice(0, 5);
    const live = todays.filter((item) => item.status === "now_serving");
    const assigned = todays.filter((item) => String(item.photoWorkflow?.assigned_staff_id || "") === String(user?.id || "") && item.photoWorkflow?.assigned_staff_id);
    return {
      todays,
      upcoming,
      live,
      assigned,
      waiting: todays.filter((item) => ["waiting", "checked_in"].includes(item.status)),
      completed: todays.filter((item) => item.status === "completed"),
    };
  }, [data.appointments, today, user?.id]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Operations Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Daily studio activity, assigned sessions, and upcoming appointments.</p>
        </div>
        <button type="button" onClick={refresh} disabled={refreshing} className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60">
          {refreshing ? "Refreshing…" : "Refresh dashboard"}
        </button>
      </header>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error} {lastUpdated ? "Showing the last available data." : ""}</span>
          <button type="button" className="font-semibold underline" onClick={refresh}>Try again</button>
        </div>
      )}
      {loading ? (
        <div role="status" className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading staff dashboard…</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Today's appointments" value={view.todays.length} note="Scheduled for today" />
            <SummaryCard label="Waiting or checked in" value={view.waiting.length} note="Clients awaiting a session" />
            <SummaryCard label="Live sessions" value={view.live.length} note="Currently taking pictures" />
            <SummaryCard label="Completed today" value={view.completed.length} note="Sessions marked completed" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard label="Registered clients" value={data.clients.length} note="Client records visible to staff" />
            <SummaryCard label="Studio posts" value={data.posts.length} note="Posts in the studio system" />
            <SummaryCard label="Client feedback" value={data.feedback.length} note="Feedback records available to staff" />
          </div>

          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-emerald-900">Daily operations</h2>
                <p className="mt-1 text-sm text-emerald-800">Open a module without leaving the Staff portal.</p>
              </div>
              <Link to="/staff/scanner" className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800">Scan Booking QR</Link>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/staff/appointments" className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50">Appointments</Link>
              <Link to="/staff/photo-sessions" className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50">Photo sessions</Link>
              <Link to="/staff/clients" className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50">Client records</Link>
              <Link to="/staff/posts" className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50">Studio posts</Link>
              <Link to="/staff/feedback" className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50">Feedback</Link>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <SessionList title="Live photography sessions" subtitle="Sessions currently in progress" appointments={view.live} emptyMessage="No sessions currently taking pictures." link="/staff/appointments" />
            <SessionList title="Assigned work today" subtitle="Sessions assigned to your staff account" appointments={view.assigned} emptyMessage="No sessions are assigned to your account for today." link="/staff/photo-sessions" />
          </div>
          <SessionList title="Upcoming appointments" subtitle="Next five bookings from today onward" appointments={view.upcoming} emptyMessage="No upcoming appointments at this time." link="/staff/appointments" />
        </>
      )}
      {lastUpdated && <p className="text-right text-xs text-gray-400">Last updated: {lastUpdated.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" })} (PH time)</p>}
    </div>
  );
}
