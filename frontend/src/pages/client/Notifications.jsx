import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notificationLink } from "../../utils/notificationLink";
import { useAuth } from "../../contexts/AuthContext";
import { clientNotificationsApi } from "../../services/api";

const typeIcon = {
  booking: "📋", payment: "💳", queue: "🔢", system: "🔔", feedback: "⭐",
};

export default function ClientNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      setItems(await clientNotificationsApi.getAll(100));
    } catch (err) {
      setError(err.message || "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const openNotification = async (notification) => {
    if (working) return;
    setWorking(true);
    try {
      if (!notification.read) {
        await clientNotificationsApi.markRead(notification.id);
        setItems(previous => previous.map(n => n.id === notification.id ? { ...n, read: true } : n));
      }
      navigate(notificationLink(notification, "client"));
    } catch (err) {
      setError(err.message || "Could not open notification.");
    } finally {
      setWorking(false);
    }
  };

  const markAllRead = async () => {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      await clientNotificationsApi.markAllRead();
      setItems(previous => previous.map(n => ({ ...n, read: true })));
    } catch (err) {
      setError(err.message || "Could not mark notifications as read.");
    } finally {
      setWorking(false);
    }
  };

  const unread = items.filter(n => !n.read).length;

  return (
    <div className="animate-fade-in max-w-2xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
          <p className="text-gray-500 text-sm mt-1">
            {loading ? "Checking your notifications…" : `${unread} unread notification${unread === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={load} disabled={loading || working}
            className="text-sm text-gray-500 hover:text-gray-900 disabled:opacity-50">Refresh</button>
          {unread > 0 && (
            <button type="button" onClick={markAllRead} disabled={loading || working}
              className="text-sm font-semibold text-gray-900 hover:text-gray-600 disabled:opacity-50">
              Mark all as read
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-white border border-gray-200 p-10 text-center text-sm text-gray-500" role="status">Loading notifications…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-200 py-16 text-center">
          <p className="text-4xl mb-3">🔔</p>
          <p className="text-gray-700 font-medium">No notifications yet</p>
          <p className="text-gray-400 text-sm mt-1">Updates about your bookings and payments will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(n => (
            <button key={n.id} type="button" onClick={() => openNotification(n)} disabled={working}
              className={`w-full text-left flex items-start gap-4 p-4 rounded-xl border transition-all disabled:opacity-60 ${n.read
                ? "bg-gray-50 border-gray-100"
                : "bg-white border-gray-200 shadow-sm hover:border-amber-300"}`}>
              <span aria-hidden="true" className="text-xl shrink-0 mt-0.5">{typeIcon[n.type] || "🔔"}</span>
              <span className="flex-1 min-w-0">
                <span className="flex items-start justify-between gap-2">
                  <span className={`block text-sm font-semibold ${n.read ? "text-gray-500" : "text-gray-900"}`}>{n.title}</span>
                  {!n.read && <span className="shrink-0 w-2 h-2 rounded-full bg-amber-500 mt-1.5" aria-label="Unread" />}
                </span>
                <span className={`block text-xs mt-1 whitespace-pre-line leading-relaxed ${n.read ? "text-gray-500" : "text-gray-600"}`}>{n.message}</span>
                <span className="block text-gray-400 text-xs mt-2">
                  {n.created_at && !Number.isNaN(Date.parse(n.created_at))
                    ? new Date(n.created_at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                    : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
