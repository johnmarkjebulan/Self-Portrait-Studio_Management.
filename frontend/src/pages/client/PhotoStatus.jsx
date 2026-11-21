import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { clientPhotoStatusApi } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";

const PRESENTATION = {
  pending: { label: "Awaiting Confirmation", description: "Your booking is being prepared by the studio.", step: 0 },
  scheduled: { label: "Session Scheduled", description: "Your photo session is booked. The studio will update the status as it progresses.", step: 0 },
  waiting: { label: "Checked In / Waiting", description: "You're checked in. Please wait until your session starts.", step: 0 },
  in_progress: { label: "Session In Progress", description: "Your photos are being taken.", step: 1 },
  session_completed: { label: "Session Completed", description: "Your photography session is finished. Editing updates will appear here.", step: 2 },
  editing: { label: "Editing Your Photos", description: "The studio is working on your pictures.", step: 3 },
  ready_for_release: { label: "Ready for Final Release", description: "The studio is preparing your photos for release. The gallery is not available yet.", step: 4 },
  released: { label: "Photos Released", description: "Your final photo gallery is available when a secure gallery link has been provided.", step: 5 },
  unavailable: { label: "Session Not Completed", description: "This booking was cancelled, rejected, or marked as a no-show.", step: -1 },
};
const STEPS = ["Booked", "In Progress", "Completed", "Editing", "Ready", "Released"];
const formatDate = (value) => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
  : "Date pending";

function StatusCard({ item }) {
  const info = PRESENTATION[item.photo_status] || PRESENTATION.pending;
  return (
    <article className="rounded-2xl border border-gray-200 bg-white card-shadow overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 p-5 border-b border-gray-100">
        <div className="min-w-0">
          <p className="text-xs font-mono text-gray-400 break-all">{item.tracking_number}</p>
          <h2 className="font-semibold text-gray-900 text-lg mt-1 break-words">{item.package_name}</h2>
          <p className="text-sm text-gray-500 mt-1">{formatDate(item.date)} · {item.time || "Time pending"}</p>
        </div>
        <span className="self-start max-w-full bg-indigo-50 text-indigo-800 border border-indigo-100 px-3 py-2 rounded-xl text-xs font-semibold">{info.label}</span>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-gray-600">{info.description}</p>
        {info.step >= 0 && (
          <div aria-label={`Progress: ${info.label}`}>
            <div className="grid grid-cols-6 gap-1 sm:gap-2" aria-hidden="true">
              {STEPS.map((step, index) => <div key={step} className={`h-2 rounded-full ${index <= info.step ? "bg-amber-500" : "bg-gray-200"}`} />)}
            </div>
            <div className="flex justify-between gap-2 mt-2 text-[10px] sm:text-xs text-gray-400">
              <span>Booked</span><span>Photo Session</span><span>Gallery Release</span>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          {item.gallery_available && item.gallery_url ? (
            <a href={item.gallery_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-gray-900 text-white hover:bg-gray-800 text-sm font-semibold">
              Open Released Gallery
            </a>
          ) : item.photo_status === "released" ? (
            <span className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Gallery link is not available. Please contact the studio.</span>
          ) : null}
          <Link to="/client/bookings" className="inline-flex px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-semibold">My Bookings</Link>
        </div>
      </div>
    </article>
  );
}

export default function ClientPhotoStatus() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const rows = await clientPhotoStatusApi.getAll();
      setItems(rows);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load photo statuses.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    const interval = window.setInterval(() => {
      if (!document.hidden) load({ quiet: true });
    }, 30000);
    return () => window.clearInterval(interval);
  }, [user?.id, load]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Photo Status</h1>
          <p className="text-sm text-gray-500 mt-1">Track your photo session, editing progress, and final gallery release.</p>
        </div>
        <button type="button" onClick={() => load({ quiet: true })} disabled={loading || refreshing} className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-semibold text-gray-700 disabled:opacity-50">{refreshing ? "Refreshing…" : "Refresh Status"}</button>
      </div>
      {error && <div role="alert" className="border border-red-200 bg-red-50 text-red-700 rounded-xl p-4 text-sm">{error} <button type="button" onClick={() => load()} className="font-semibold underline ml-2">Retry</button></div>}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-500" role="status">Loading photo status…</div>
      ) : items.length === 0 && !error ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <p className="font-semibold text-gray-800">No photo sessions yet</p>
          <p className="text-gray-500 text-sm mt-2 mb-4">After you book, your photo status will appear here.</p>
          <Link to="/client/book" className="inline-flex px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold">Book a Session</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {items.map((item) => <StatusCard key={item.appointment_id} item={item} />)}
        </div>
      )}
      <p className="text-xs text-gray-400">Photo status is read-only. Your photographer or studio administrator updates each stage.</p>
    </div>
  );
}
