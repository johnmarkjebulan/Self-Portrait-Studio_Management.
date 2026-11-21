import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { appointmentsApi } from "../../services/api";
import { StatusBadge } from "../../components/common/StatusBadge";

const text = (value, fallback = "Not provided") => {
  const result = value === null || value === undefined ? "" : String(value).trim();
  return result || fallback;
};

const statusLabel = (value) =>
  String(value || "Unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

function Detail({ label, children }) {
  return (
    <div className="min-w-0 rounded-xl bg-gray-50 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-gray-900">{children}</dd>
    </div>
  );
}

function AppointmentDetails({ appointment, onClose }) {
  useEffect(() => {
    const handleKeydown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onClose]);

  const client = appointment.client || {};
  const packageName = appointment.package?.name;
  const workflow = appointment.photoWorkflow || {};

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-950/60 p-4"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-appointment-details-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Booking information</p>
            <h2 id="staff-appointment-details-title" className="mt-1 text-xl font-bold text-gray-900">Appointment details</h2>
            <p className="mt-1 break-all font-mono text-xs text-gray-500">{text(appointment.tracking_number)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close appointment details" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge status={appointment.status} />
          {workflow.stage && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">Photo stage: {statusLabel(workflow.stage)}</span>}
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <Detail label="Client name">{text(client.name)}</Detail>
          <Detail label="Email">{text(client.email)}</Detail>
          <Detail label="Mobile">{text(client.mobile || client.phone)}</Detail>
          <Detail label="Package">{text(packageName)}</Detail>
          <Detail label="Appointment date">{text(appointment.date)}</Detail>
          <Detail label="Appointment time">{text(appointment.time)}</Detail>
          <Detail label="Assigned photographer">{text(workflow.photographer?.name)}</Detail>
          <Detail label="Tracking number">{text(appointment.tracking_number)}</Detail>
        </dl>
        <p className="mt-4 text-xs text-gray-500">Staff information view only. Use the QR scanner or Photo Sessions module for session actions.</p>
      </section>
    </div>
  );
}

export default function StaffAppointments() {
  const mounted = useRef(false);
  const requestInProgress = useRef(false);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const reload = useCallback(async () => {
    if (!mounted.current || requestInProgress.current) return;
    requestInProgress.current = true;
    setRefreshing(true);
    setError("");
    try {
      const result = await appointmentsApi.getAll();
      if (!mounted.current) return;
      setRows(Array.isArray(result) ? result : []);
      setUpdatedAt(new Date());
    } catch (err) {
      if (mounted.current) setError(err?.message || "Could not load appointments.");
    } finally {
      requestInProgress.current = false;
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    reload();
    const timer = window.setInterval(() => { if (!document.hidden) reload(); }, 60000);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, [reload]);

  const statuses = useMemo(
    () => [...new Set(rows.map((item) => item.status).filter(Boolean))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((appointment) => {
        const haystack = [
          appointment.tracking_number,
          appointment.client?.name,
          appointment.client?.email,
          appointment.package?.name,
        ].map((item) => String(item || "")).join(" ").toLowerCase();
        return (!needle || haystack.includes(needle))
          && (statusFilter === "all" || appointment.status === statusFilter)
          && (!dateFilter || appointment.date === dateFilter);
      })
      .sort((a, b) => `${b.date || ""} ${b.time || ""}`.localeCompare(`${a.date || ""} ${a.time || ""}`));
  }, [rows, query, statusFilter, dateFilter]);

  const resetFilters = () => { setQuery(""); setStatusFilter("all"); setDateFilter(""); };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
          <p className="mt-1 text-sm text-gray-500">Review bookings and client information before each studio session.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={reload} disabled={refreshing} className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <Link to="/staff/scanner" className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800">Scan Booking QR</Link>
        </div>
      </header>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5" aria-label="Appointment filters">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block min-w-0 text-xs font-semibold text-gray-600">
            Search booking or client
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tracking, name, email, or package" className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm font-normal text-gray-900 outline-none focus:border-amber-500" />
          </label>
          <label className="block min-w-0 text-xs font-semibold text-gray-600">
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1.5 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal text-gray-900">
              <option value="all">All statuses</option>
              {statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
            </select>
          </label>
          <label className="block min-w-0 text-xs font-semibold text-gray-600">
            Appointment date
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm font-normal text-gray-900" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-500" role="status">Showing {filtered.length} of {rows.length} appointments</p>
          <button type="button" onClick={resetFilters} className="text-xs font-semibold text-amber-700 hover:underline">Clear filters</button>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} {updatedAt ? "Showing the last available information." : ""} <button type="button" onClick={reload} className="ml-2 font-semibold underline">Retry</button></div>}

      {loading ? (
        <div role="status" className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading appointments...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="font-semibold text-gray-800">{rows.length ? "No appointments match your filters." : "No appointments available."}</p>
          <p className="mt-1 text-sm text-gray-500">{rows.length ? "Try another search, status, or date." : "Bookings will appear here when available."}</p>
          {rows.length > 0 && <button type="button" onClick={resetFilters} className="mt-3 text-sm font-semibold text-amber-700 underline">Clear filters</button>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>{["Tracking", "Client", "Schedule", "Package", "Status", "Details"].map((heading) => <th key={heading} scope="col" className="px-4 py-3 font-semibold">{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((appointment) => (
                <tr key={appointment.id || appointment.tracking_number} className="hover:bg-gray-50/70">
                  <td className="px-4 py-4 font-mono text-xs text-gray-700">{text(appointment.tracking_number, "-")}</td>
                  <td className="px-4 py-4"><div className="font-semibold text-gray-900">{text(appointment.client?.name, "-")}</div><div className="mt-0.5 max-w-[200px] truncate text-xs text-gray-500">{text(appointment.client?.email, "")}</div></td>
                  <td className="px-4 py-4"><div className="font-medium text-gray-900">{text(appointment.date, "-")}</div><div className="mt-0.5 text-xs text-gray-500">{text(appointment.time, "-")}</div></td>
                  <td className="px-4 py-4 text-gray-700">{text(appointment.package?.name, "-")}</td>
                  <td className="px-4 py-4"><StatusBadge status={appointment.status} /></td>
                  <td className="px-4 py-4"><button type="button" onClick={() => setSelected(appointment)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100" aria-label={`View details for booking ${text(appointment.tracking_number, "unknown")}`}>View details</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {updatedAt && <p className="text-right text-xs text-gray-400">Last updated: {updatedAt.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" })} (PH time)</p>}
      {selected && <AppointmentDetails appointment={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
