import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { appointmentsApi, photoWorkflowApi } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { StatusBadge } from "../../components/common/StatusBadge";

const STAGE_LABELS = {
  awaiting_session: "Awaiting session",
  editing: "Editing photos",
  ready_for_release: "Ready for admin release",
  released: "Photos released",
};
const CLOSED_STATUSES = new Set(["cancelled", "rejected", "no_show"]);

function photoStage(appointment) {
  return appointment.photoWorkflow?.stage ||
    (appointment.status === "completed" ? "editing" : "awaiting_session");
}
function isAssigned(appointment, staffId) {
  const assignedId = appointment.photoWorkflow?.assigned_staff_id;
  return assignedId !== null && assignedId !== undefined && String(assignedId) === String(staffId);
}
function statLabel(status) {
  return String(status || "unknown").replaceAll("_", " ");
}
function Metric({ label, value, note }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-gray-400">{note}</p>
    </div>
  );
}

export default function StaffPhotoSessions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const mounted = useRef(false);
  const [appointments, setAppointments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("mine");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [gallery, setGallery] = useState("");
  const [notes, setNotes] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useCallback(async (silent = false) => {
    if (!mounted.current) return;
    if (!silent) setRefreshing(true);
    try {
      const result = await appointmentsApi.getAll();
      if (!mounted.current) return;
      setAppointments(Array.isArray(result) ? result : []);
      setError("");
      setLastUpdated(new Date());
    } catch (err) {
      if (mounted.current && !silent) setError(err?.message || "Unable to load photo sessions.");
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) refresh(true);
    }, 30000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  const selected = useMemo(
    () => appointments.find((item) => String(item.id) === String(selectedId)) || null,
    [appointments, selectedId]
  );
  const selectedStage = selected ? photoStage(selected) : "awaiting_session";
  const canEdit = Boolean(selected && isAssigned(selected, user?.id) && selected.status === "completed" && selectedStage !== "released");

  function selectSession(appointment) {
    setSelectedId(appointment.id);
    setGallery(appointment.photoWorkflow?.gallery_url || "");
    setNotes(appointment.photoWorkflow?.internal_notes || "");
  }

  const metrics = useMemo(() => {
    const mine = appointments.filter((item) => isAssigned(item, user?.id));
    return {
      assigned: mine.length,
      taking: mine.filter((item) => item.status === "now_serving").length,
      editing: mine.filter((item) => item.status === "completed" && photoStage(item) === "editing").length,
      ready: mine.filter((item) => photoStage(item) === "ready_for_release").length,
    };
  }, [appointments, user?.id]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return appointments.filter((item) => {
      if (query) {
        const text = [item.tracking_number, item.client?.name, item.package?.name, item.date]
          .filter(Boolean).join(" ").toLowerCase();
        if (!text.includes(query)) return false;
      }
      switch (filter) {
        case "mine": return isAssigned(item, user?.id);
        case "unassigned": return !item.photoWorkflow?.assigned_staff_id && !CLOSED_STATUSES.has(item.status);
        case "active": return !CLOSED_STATUSES.has(item.status) && photoStage(item) !== "released";
        case "shooting": return item.status === "now_serving";
        case "editing": return item.status === "completed" && photoStage(item) === "editing";
        case "ready": return photoStage(item) === "ready_for_release";
        case "released": return photoStage(item) === "released";
        default: return true;
      }
    }).sort((a, b) =>
      `${b.date || ""} ${b.time || ""}`.localeCompare(`${a.date || ""} ${a.time || ""}`)
    );
  }, [appointments, filter, search, user?.id]);

  async function saveDetails() {
    if (!selected || !canEdit || saving) return;
    const url = gallery.trim();
    if (url && !/^https:\/\//i.test(url)) {
      setError("Gallery URL must use HTTPS.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await photoWorkflowApi.details(selected.id, { gallery_url: url, internal_notes: notes });
      toast("Gallery link and editing notes saved.", "success");
      await refresh();
    } catch (err) {
      setError(err?.message || "Could not save editing details.");
      toast(err?.message || "Could not save editing details.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function markReady() {
    if (!selected || !canEdit || saving || selectedStage !== "editing") return;
    if (!window.confirm(`Mark booking ${selected.tracking_number || selected.id} ready for Admin release?`)) return;
    const url = gallery.trim();
    if (url && !/^https:\/\//i.test(url)) {
      setError("Gallery URL must use HTTPS.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await photoWorkflowApi.stage(selected.id, "ready_for_release", {
        gallery_url: url,
        internal_notes: notes,
      });
      toast("Photos marked ready. Admin can review and release them.", "success");
      await refresh();
    } catch (err) {
      setError(err?.message || "Could not update photo workflow.");
      toast(err?.message || "Could not update photo workflow.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Photo Sessions</h1>
          <p className="mt-1 text-sm text-gray-500">Monitor assigned photo shoots, editing progress, and photo delivery handoff.</p>
        </div>
        <button type="button" onClick={() => refresh()} disabled={refreshing || saving}
          className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50">
          {refreshing ? "Refreshing..." : "Refresh sessions"}
        </button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="My assigned sessions" value={metrics.assigned} note="Bookings assigned to your account" />
        <Metric label="Taking photos" value={metrics.taking} note="Assigned sessions in progress" />
        <Metric label="Editing photos" value={metrics.editing} note="Assigned jobs awaiting completion" />
        <Metric label="Ready for release" value={metrics.ready} note="Waiting for Admin approval" />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Search sessions</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Client, booking number, or package"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-amber-400 focus:outline-none" />
          </label>
          <label className="min-w-[170px]">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Filter sessions</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm">
              <option value="mine">My assignments</option>
              <option value="active">Active sessions</option>
              <option value="shooting">Taking photos</option>
              <option value="editing">Editing</option>
              <option value="ready">Ready for Admin</option>
              <option value="released">Released</option>
              <option value="unassigned">Unassigned sessions</option>
              <option value="all">All sessions</option>
            </select>
          </label>
          <Link to="/staff/scanner" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100">
            Scan Booking QR
          </Link>
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section aria-label="Photo session list" className="space-y-3">
          {loading ? (
            <p role="status" className="rounded-2xl border bg-white p-8 text-center text-sm text-gray-500">Loading photo sessions...</p>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border bg-white p-8 text-center">
              <p className="font-semibold text-gray-800">No sessions found</p>
              <p className="mt-2 text-sm text-gray-500">Try another filter or search term. Only Admin assigns photographers.</p>
              {filter === "mine" && <button type="button" onClick={() => setFilter("all")} className="mt-3 text-sm font-semibold text-amber-700 underline">View all sessions</button>}
            </div>
          ) : visible.map((item) => {
            const mine = isAssigned(item, user?.id);
            return (
              <button type="button" key={item.id} onClick={() => selectSession(item)}
                aria-pressed={String(item.id) === String(selectedId)}
                className={`w-full rounded-2xl border bg-white p-4 text-left transition-colors sm:p-5 ${String(item.id) === String(selectedId) ? "border-amber-400 ring-2 ring-amber-100" : "border-gray-200 hover:border-amber-300"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-gray-900">{item.client?.name || "Client"}</p>
                    <p className="mt-1 break-words font-mono text-xs text-gray-500">{item.tracking_number || `#${item.id}`}</p>
                    <p className="mt-1 text-xs text-gray-600">{item.date || "No date"} at {item.time || "No time"} | {item.package?.name || "Photography package"}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-gray-100 px-3 py-1.5 font-semibold text-gray-700">{STAGE_LABELS[photoStage(item)] || statLabel(photoStage(item))}</span>
                  {mine && <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-800">Assigned to me</span>}
                  {!mine && <span className="text-gray-500">Photographer: {item.photoWorkflow?.photographer?.name || "Unassigned"}</span>}
                </div>
              </button>
            );
          })}
        </section>

        <aside aria-label="Selected photo session" className="rounded-2xl border border-gray-200 bg-white p-5 xl:sticky xl:top-24">
          {!selected ? (
            <div className="py-12 text-center">
              <p className="text-3xl">📷</p>
              <p className="mt-3 font-semibold text-gray-900">Select a photo session</p>
              <p className="mt-2 text-sm text-gray-500">Review assignment and editing progress here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Session details</p>
                <h2 className="mt-1 break-words text-lg font-semibold text-gray-900">{selected.client?.name || "Client"}</h2>
                <p className="mt-1 break-words font-mono text-xs text-gray-500">{selected.tracking_number || `#${selected.id}`}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Appointment</p>
                  <p className="mt-1 text-sm font-semibold capitalize">{statLabel(selected.status)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Photo progress</p>
                  <p className="mt-1 text-sm font-semibold">{STAGE_LABELS[selectedStage] || statLabel(selectedStage)}</p>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 p-3 text-sm">
                <p className="text-xs font-semibold text-gray-500">Assigned photographer</p>
                <p className="mt-1 font-medium text-gray-900">{selected.photoWorkflow?.photographer?.name || "Unassigned"}</p>
                <p className="mt-1 text-xs text-gray-500">Only Admin can change photographer assignments.</p>
              </div>
              {selected.status !== "completed" ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
                  Photo editing is available after this booking's session is marked completed.
                  <Link to="/staff/scanner" className="mt-2 block font-semibold underline">Open Staff QR Scanner</Link>
                </div>
              ) : selectedStage === "released" ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  Photos have been released by Admin. This workflow is now read-only.
                </div>
              ) : (
                <>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-600">Secure gallery link (HTTPS)</span>
                    <input type="url" value={canEdit ? gallery : ""} onChange={(event) => setGallery(event.target.value)}
                      disabled={!canEdit || saving} placeholder={canEdit ? "https://gallery.example/..." : "Available to assigned staff only"}
                      className="mt-1.5 w-full rounded-xl border border-gray-300 p-3 text-sm disabled:bg-gray-50" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-600">Internal editing notes</span>
                    <textarea value={canEdit ? notes : ""} onChange={(event) => setNotes(event.target.value)}
                      disabled={!canEdit || saving} rows={4} maxLength={2000} placeholder={canEdit ? "Editing work and delivery checklist" : "Available to assigned staff only"}
                      className="mt-1.5 w-full rounded-xl border border-gray-300 p-3 text-sm disabled:bg-gray-50" />
                  </label>
                  {canEdit ? (
                    <div className="grid gap-2">
                      <button type="button" onClick={saveDetails} disabled={saving}
                        className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">
                        {saving ? "Saving..." : "Save gallery and notes"}
                      </button>
                      {selectedStage === "editing" && (
                        <button type="button" onClick={markReady} disabled={saving}
                          className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50">
                          Mark ready for Admin review
                        </button>
                      )}
                      {selectedStage === "ready_for_release" && (
                        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Awaiting Admin review and release. You can still update notes and the gallery link.</p>
                      )}
                    </div>
                  ) : (
                    <p className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">Only the assigned photographer may edit this session. Contact Admin if assignment needs to change.</p>
                  )}
                </>
              )}
            </div>
          )}
        </aside>
      </div>
      {lastUpdated && <p className="text-right text-xs text-gray-400">Last refreshed: {lastUpdated.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" })} (PH time)</p>}
    </div>
  );
}
