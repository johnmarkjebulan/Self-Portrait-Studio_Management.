import { useEffect, useMemo, useState } from "react";
import { feedbackApi } from "../../services/api";
import { useToast } from "../../contexts/ToastContext";

const safeRating = (value) => Math.max(0, Math.min(5, Math.round(Number(value) || 0)));

function displayDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function RatingStars({ value }) {
  const rating = safeRating(value);
  return <span aria-label={`${rating} out of 5 stars`} className="whitespace-nowrap text-sm text-amber-500">
    {"★".repeat(rating)}<span className="text-gray-200">{"★".repeat(5 - rating)}</span>
  </span>;
}

export default function StaffFeedback() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [drafts, setDrafts] = useState({});
  const [replyingId, setReplyingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    feedbackApi.getAll()
      .then((items) => { if (active) setRows(Array.isArray(items) ? items : []); })
      .catch((err) => { if (active) setError(err?.message || "Could not load client feedback."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const stats = useMemo(() => {
    const total = rows.length;
    const needsReply = rows.filter((row) => !String(row.staff_reply || "").trim()).length;
    const average = total ? rows.reduce((sum, row) => sum + safeRating(row.rating), 0) / total : 0;
    return { total, needsReply, average };
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((item) => {
      const hasReply = Boolean(String(item.staff_reply || "").trim());
      if (filter === "pending" && hasReply) return false;
      if (filter === "replied" && !hasReply) return false;
      if (q && ![item.client?.name, item.client?.email, item.appointment?.tracking_number, item.comment, item.staff_reply]
        .some((value) => String(value || "").toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => {
      if (sort === "highest") return safeRating(b.rating) - safeRating(a.rating);
      if (sort === "lowest") return safeRating(a.rating) - safeRating(b.rating);
      const aTime = new Date(a.created_at || 0).getTime() || 0;
      const bTime = new Date(b.created_at || 0).getTime() || 0;
      return sort === "oldest" ? aTime - bTime : bTime - aTime;
    });
  }, [rows, search, filter, sort]);

  async function sendReply(item) {
    if (replyingId !== null || String(item.staff_reply || "").trim()) return;
    const reply = String(drafts[item.id] || "").trim();
    if (!reply) {
      toast("Write a reply before sending.", "warning");
      return;
    }
    if (reply.length > 4000) {
      toast("Reply must not exceed 4,000 characters.", "warning");
      return;
    }
    if (!window.confirm("Send this response to the client?")) return;
    setReplyingId(item.id);
    try {
      const updated = await feedbackApi.reply(item.id, reply);
      setRows((previous) => previous.map((row) => row.id === item.id ? { ...row, ...updated, staff_reply: reply } : row));
      setDrafts((previous) => ({ ...previous, [item.id]: "" }));
      toast("Studio reply sent successfully.", "success");
    } catch (err) {
      toast(err?.message || "Could not send the reply.", "error");
    } finally {
      setReplyingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Client Feedback</h1>
          <p className="mt-1 text-sm text-gray-500">Review client ratings and reply to feedback using your Staff account.</p>
        </div>
        <button type="button" onClick={() => setReloadKey((key) => key + 1)} disabled={loading || replyingId !== null}
          className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50">
          {loading ? "Loading..." : "Refresh feedback"}
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Total feedback", stats.total],
          ["Average rating", stats.average.toFixed(1) + " / 5"],
          ["Needs reply", stats.needsReply],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-gray-200 bg-white p-5 card-shadow">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900 tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <section aria-label="Feedback filters" className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_170px]">
          <label className="min-w-0">
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">Search feedback</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Client, booking, or comment" className="w-full min-w-0 rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100" />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">Reply status</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm">
              <option value="all">All feedback</option>
              <option value="pending">Needs reply</option>
              <option value="replied">Replied</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="highest">Highest rating</option>
              <option value="lowest">Lowest rating</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-gray-500">Showing {visible.length} of {rows.length} feedback entries</p>
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error} <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="ml-2 font-semibold underline">Try again</button>
      </div>}

      {loading ? (
        <div role="status" className="rounded-2xl border bg-white p-10 text-center text-sm text-gray-500">Loading client feedback...</div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          {error ? "Feedback could not be displayed right now." : rows.length ? "No feedback matches your filters." : "No client feedback yet."}
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((item) => {
            const replied = Boolean(String(item.staff_reply || "").trim());
            const sending = replyingId === item.id;
            return (
              <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 card-shadow">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words font-semibold text-gray-900">{item.client?.name || "Client"}</h2>
                    <p className="mt-1 break-words text-xs text-gray-500">{item.appointment?.tracking_number || "General Studio Feedback"} | {displayDate(item.created_at)}</p>
                  </div>
                  <RatingStars value={item.rating} />
                </div>
                {item.comment && <p className="mt-4 whitespace-pre-line break-words text-sm leading-6 text-gray-700">{item.comment}</p>}
                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                  {[
                    ["Booking", item.booking_experience],
                    ["Staff service", item.staff_service],
                    ["Studio", item.studio_experience],
                    ["Cleanliness", item.cleanliness],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-gray-50 p-3 text-xs">
                      <p className="text-gray-500">{label}</p>
                      <p className="mt-1 font-semibold text-gray-800">{value == null ? "Not rated" : `${safeRating(value)} / 5`}</p>
                    </div>
                  ))}
                </div>
                {replied ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Studio reply sent</p>
                    <p className="mt-2 whitespace-pre-line break-words text-sm text-emerald-900">{item.staff_reply}</p>
                    {item.replied_at && <p className="mt-2 text-xs text-emerald-700">{displayDate(item.replied_at)}</p>}
                  </div>
                ) : (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <label htmlFor={`reply-${item.id}`} className="mb-2 block text-xs font-semibold text-gray-600">Write a Staff reply</label>
                    <textarea id={`reply-${item.id}`} rows={3} maxLength={4000} disabled={replyingId !== null}
                      value={drafts[item.id] || ""} onChange={(event) => setDrafts((previous) => ({ ...previous, [item.id]: event.target.value }))}
                      placeholder="Write a professional response to the client's feedback..."
                      className="w-full resize-y rounded-xl border border-gray-300 px-3.5 py-3 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 disabled:opacity-60" />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-gray-500">{(drafts[item.id] || "").length} / 4,000 characters</p>
                      <button type="button" disabled={replyingId !== null || !(drafts[item.id] || "").trim()} onClick={() => sendReply(item)}
                        className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50">
                        {sending ? "Sending..." : "Send reply"}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
