import { useCallback, useEffect, useState } from "react";
import { appointmentsApi, feedbackApi } from "../../services/api";
import { useToast } from "../../contexts/ToastContext";
import { FEEDBACK_CATEGORIES as categories, RATING_LABELS as ratingLabels, missingFeedbackRatings } from "../../utils/feedbackRatings";

const emptyForm = () => ({
  appointment_id: "", rating: 0, booking_experience: 0,
  staff_service: 0, studio_experience: 0, cleanliness: 0, comment: "",
});

function RatingStars({ title, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`${title} rating`}>
      {[1, 2, 3, 4, 5].map((number) => (
        <button
          key={number}
          type="button"
          className={`pose-rating-star text-3xl leading-none ${number <= value ? "text-amber-400" : "text-gray-300"}`}
          onClick={() => onChange(number)}
          aria-label={`${title}: ${number} ${number === 1 ? "star" : "stars"}`}
          aria-pressed={value === number}
          title={`${number} stars — ${ratingLabels[number]}`}
        >★</button>
      ))}
      <span className="ml-1 text-sm text-gray-500" aria-live="polite">{ratingLabels[value] || "Choose a rating"}</span>
    </div>
  );
}

export default function ClientFeedback() {
  const { toast } = useToast();
  const [appointments, setAppointments] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const [appointmentResult, feedbackResult] = await Promise.allSettled([
      appointmentsApi.getAll(), feedbackApi.getAll(),
    ]);
    const failures = [];
    if (appointmentResult.status === "fulfilled") {
      setAppointments(appointmentResult.value.filter((a) => a.status === "completed"));
    } else {
      failures.push(`Appointments: ${appointmentResult.reason?.message || "Unable to load"}`);
    }
    if (feedbackResult.status === "fulfilled") {
      setFeedback(feedbackResult.value);
    } else {
      failures.push(`My feedback: ${feedbackResult.reason?.message || "Unable to load"}`);
    }
    setLoadError(failures.join(" "));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  const reviewed = new Set(feedback.filter((item) => item.appointment_id).map((item) => item.appointment_id));
  const options = appointments.filter((item) => !reviewed.has(item.id));

  function updateRating(field, value) {
    setForm((old) => ({ ...old, [field]: value }));
    setFormError("");
  }

  async function submit(event) {
    event.preventDefault();
    const missing = missingFeedbackRatings(form);
    if (missing.length) {
      const labels = { rating: "Overall Rating", ...Object.fromEntries(categories) };
      const message = `Please rate: ${missing.map((key) => labels[key]).join(", ")}.`;
      setFormError(message);
      toast(message, "warning");
      return;
    }
    if (!form.comment.trim() && !form.appointment_id) {
      setFormError("Please write a short comment for general studio feedback.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      // The legacy optional overall_satisfaction field is intentionally NOT sent.
      await feedbackApi.create({ ...form, comment: form.comment.trim(), appointment_id: form.appointment_id || null });
      toast("Thank you! Your feedback was sent.", "success");
      setForm(emptyForm());
      await load();
    } catch (error) {
      const message = error.message || "Failed to submit feedback. Please retry.";
      setFormError(message);
      toast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto pose-appear">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold text-gray-900">Feedback</h1>
        <p className="text-sm text-gray-500 mt-1">Tell us what went well and what we can improve.</p>
      </div>
      {loadError && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex flex-wrap items-center justify-between gap-3" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={load} disabled={loading} className="font-semibold underline disabled:opacity-50">Retry loading</button>
        </div>
      )}
      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 card-shadow mb-8 pose-feedback-panel">
        <div className="mb-5">
          <label htmlFor="feedback-appointment" className="text-xs uppercase tracking-wider text-gray-500 block mb-2">Feedback For</label>
          <select id="feedback-appointment" value={form.appointment_id} onChange={(event) => setForm((old) => ({ ...old, appointment_id: event.target.value }))} className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-3 text-sm">
            <option value="">General Studio Feedback</option>
            {options.map((item) => <option key={item.id} value={item.id}>{item.tracking_number} · {item.package?.name || "Session"} · {item.date}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-2">Completed appointments can be reviewed once. General feedback can be sent anytime.</p>
        </div>
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider text-gray-500 block mb-3">Overall Rating</p>
          <RatingStars title="Overall Rating" value={form.rating} onChange={(value) => updateRating("rating", value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-5 mb-5">
          {categories.map(([key, title]) => (
            <div key={key} className="rounded-xl bg-gray-50 border border-gray-100 p-4 pose-rating-card">
              <p className="text-sm font-medium text-gray-700 mb-2">{title}</p>
              <RatingStars title={title} value={form[key]} onChange={(value) => updateRating(key, value)} />
            </div>
          ))}
        </div>
        <div className="mb-5">
          <label htmlFor="feedback-comment" className="text-xs uppercase tracking-wider text-gray-500 block mb-2">Comments / Suggestions</label>
          <textarea id="feedback-comment" rows={5} maxLength={4000} value={form.comment} onChange={(event) => setForm((old) => ({ ...old, comment: event.target.value }))} placeholder="Share your experience, suggestions, or concerns…" className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-3 text-sm resize-none outline-none focus:border-amber-400" />
        </div>
        {formError && <div role="alert" className="mb-4 text-sm text-red-700 rounded-xl border border-red-200 bg-red-50 px-4 py-3">{formError}</div>}
        <button disabled={saving} type="submit" className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-xl text-sm font-semibold disabled:opacity-60 pose-action">{saving ? "Sending…" : "Send Feedback"}</button>
      </form>
      <h2 className="font-semibold text-gray-900 mb-4">My Feedback</h2>
      {loading ? <p className="text-sm text-gray-500">Loading feedback…</p> : feedback.length === 0 ? (
        <div className="bg-white border rounded-2xl p-8 text-center text-gray-500">You have not sent feedback yet.</div>
      ) : (
        <div className="space-y-4">
          {feedback.map((item) => (
            <div key={item.id} className="bg-white border rounded-2xl p-5 card-shadow pose-feedback-panel">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">{item.appointment?.tracking_number || "General Studio Feedback"}</p>
                  <p className="text-xs text-gray-400 mt-1">{item.created_at ? new Date(item.created_at).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }) : ""}</p>
                </div>
                <span className="text-amber-400" aria-label={`${item.rating} out of 5 stars`}>{"★".repeat(Math.max(0, Math.min(5, Number(item.rating) || 0)))}<span className="text-gray-200">{"★".repeat(Math.max(0, 5 - (Number(item.rating) || 0)))}</span></span>
              </div>
              {item.comment && <p className="text-sm text-gray-600 mt-3 whitespace-pre-line">{item.comment}</p>}
              {item.staff_reply && <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-xl p-4"><p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Studio Reply</p><p className="text-sm text-emerald-900 mt-1 whitespace-pre-line">{item.staff_reply}</p></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
