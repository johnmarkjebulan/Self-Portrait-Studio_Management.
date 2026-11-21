import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { appointmentsApi } from "../../services/api";
import { StatusBadge } from "../../components/common/StatusBadge";
import { studioToday } from "../../utils/date";

const READY = ["confirmed", "rescheduled", "waiting", "checked_in"];
const PAID = ["verified", "partially_paid", "fully_paid"];

export default function BookingScanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const video = useRef(null);
  const canvas = useRef(null);
  const stream = useRef(null);
  const frame = useRef(null);
  const busy = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [booking, setBooking] = useState(null);
  const [method, setMethod] = useState("qr");
  const [tracking, setTracking] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [history, setHistory] = useState([]);
  const [confirming, setConfirming] = useState("");

  function stopCamera() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (stream.current) stream.current.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setScanning(false);
  }
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (stream.current) stream.current.getTracks().forEach((t) => t.stop());
  }, []);

  async function lookup(payload) {
    if (busy.current) return;
    busy.current = true;
    stopCamera();
    setWorking(true);
    setError("");
    setConfirming("");
    try {
      const { appointment, method: foundMethod } = await appointmentsApi.scan(payload);
      setBooking(appointment);
      setMethod(foundMethod);
      setTracking(appointment.tracking_number);
      const scans = await appointmentsApi.scanHistory(appointment.id).catch(() => []);
      setHistory(scans);
      if (appointment.status === "now_serving") toast("This booking is already Taking Pictures.", "info");
      else if (appointment.status === "completed") toast("This session is already completed.", "info");
      else toast("QR/booking verified. Review the details before starting the session.", "success");
    } catch (err) {
      setBooking(null);
      setHistory([]);
      setError(err.message || "Unable to verify this booking.");
    } finally {
      setWorking(false);
      busy.current = false;
    }
  }

  async function startCamera() {
    setError("");
    setBooking(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera unavailable. Please use manual booking lookup (HTTPS or localhost is required for camera access).");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      stream.current = media;
      setScanning(true);
      // Video element is rendered even before the camera starts.
      const element = video.current;
      if (!element) { stopCamera(); setError("Camera preview unavailable."); return; }
      element.srcObject = media;
      await element.play();
      const scanFrame = () => {
        if (!video.current || !canvas.current || busy.current || !stream.current) return;
        const v = video.current;
        if (v.readyState >= 2 && v.videoWidth) {
          const c = canvas.current;
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(v, 0, 0);
            const pixels = ctx.getImageData(0, 0, c.width, c.height);
            const qr = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
            if (qr?.data) { lookup({ qr_payload: qr.data }); return; }
          }
        }
        frame.current = requestAnimationFrame(scanFrame);
      };
      frame.current = requestAnimationFrame(scanFrame);
    } catch (err) {
      stopCamera();
      setError(err.name === "NotAllowedError" ? "Camera permission denied. Allow camera access or use manual lookup." : "Camera could not start. Try manual lookup.");
    }
  }

  function reset() {
    stopCamera();
    busy.current = false;
    setBooking(null);
    setTracking("");
    setError("");
    setHistory([]);
    setConfirming("");
  }

  async function changeSession(action) {
    if (!booking || working) return;
    setWorking(true);
    setError("");
    try {
      const updated = action === "start"
        ? await appointmentsApi.startSession(booking.id, method)
        : await appointmentsApi.completeSession(booking.id, method);
      setBooking(updated);
      setConfirming("");
      setHistory(await appointmentsApi.scanHistory(updated.id).catch(() => []));
      toast(action === "start" ? "Session started — Taking Pictures is visible to Client, Admin and Staff." : "Photo session completed.", "success");
    } catch (err) {
      setError(err.message || "Unable to update this session.");
      const fresh = await appointmentsApi.find(booking.id).catch(() => null);
      if (fresh) setBooking(fresh);
    } finally { setWorking(false); }
  }

  const today = studioToday();
  const startEligible = booking && READY.includes(booking.status) && booking.date === today
    && PAID.includes(booking.payment_status) && Number(booking.amount_paid || 0) >= Number(booking.down_payment || 0);
  const isOngoing = booking?.status === "now_serving";
  const canComplete = isOngoing;

  return <div className="animate-fade-in max-w-3xl mx-auto">
    <div className="mb-6">
      <h1 className="text-2xl font-semibold text-gray-900">QR Booking Check-In</h1>
      <p className="text-sm text-gray-500 mt-1">{user?.role === "staff" ? "Staff" : "Admin"} scanner · Scan, verify booking details, then confirm <strong>Start Photo Session</strong>. Scanning alone does not start the session.</p>
    </div>
    {!booking && <div className="space-y-4">
      <div className="bg-gray-950 rounded-2xl overflow-hidden relative aspect-video flex items-center justify-center">
        <video ref={video} playsInline muted className={`w-full h-full object-cover ${scanning ? "block" : "hidden"}`} />
        <canvas ref={canvas} className="hidden" />
        {scanning ? <>
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center"><div className="w-48 h-48 border-2 border-amber-400/80 rounded-2xl overflow-hidden flex items-center justify-center"><div className="studio-scan-line w-full" /></div></div>
          <button type="button" onClick={stopCamera} className="absolute top-3 right-3 rounded-lg bg-black/70 text-white py-2 px-4 text-sm">Stop Camera</button>
        </> : <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
          <span className="text-4xl">▣</span>
          <p className="text-sm text-center px-3">Point your camera at the client's unique booking QR code.</p>
          <button type="button" disabled={working} onClick={startCamera} className="bg-amber-500 text-gray-950 font-semibold rounded-xl px-6 py-2.5 text-sm disabled:opacity-50">Open Camera</button>
        </div>}
      </div>
      <form className="bg-white rounded-2xl border border-gray-200 p-5" onSubmit={(e)=>{e.preventDefault();lookup({tracking_number:tracking})}}>
        <p className="font-semibold text-sm text-gray-800 mb-2">Manual lookup (camera fallback)</p>
        <p className="text-xs text-gray-500 mb-3">Use the tracking number on the client's booking card. Review the result before starting.</p>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Booking tracking number" value={tracking} onChange={(e)=>setTracking(e.target.value.toUpperCase())} placeholder="SP-2026-0001" className="min-w-0 flex-1 border border-gray-200 rounded-xl py-3 px-4 text-sm font-mono" />
          <button type="submit" disabled={working || !tracking.trim()} className="rounded-xl bg-gray-900 text-white px-5 py-3 text-sm font-semibold disabled:opacity-50">{working ? "Checking..." : "Look Up"}</button>
        </div>
      </form>
    </div>}

    {booking && <div className="space-y-4">
      <div className={`rounded-2xl border p-5 studio-lift ${isOngoing ? "bg-emerald-50 border-emerald-200" : booking.status === "completed" ? "bg-gray-50 border-gray-200" : "bg-amber-50 border-amber-200"}`}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2">{isOngoing ? "● Taking Pictures — photo session active" : booking.status === "completed" ? "✓ Session Completed" : "Booking Found — Verify Details"}</p>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="tracking-number text-xl sm:text-2xl font-bold">{booking.tracking_number}</h2>
          <div className="flex items-center gap-2 flex-wrap"><StatusBadge status={booking.status} /><StatusBadge status={booking.payment_status} /></div>
        </div>
        <p className="text-gray-600 text-sm mt-2">{booking.client?.name || "Client"} · {booking.package?.name || "Photography session"}</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 grid grid-cols-2 gap-5">
        <div><p className="text-xs text-gray-400 mb-1">Session Date</p><p className="font-semibold text-sm">{booking.date}</p></div>
        <div><p className="text-xs text-gray-400 mb-1">Schedule</p><p className="font-semibold text-sm">{booking.time}</p></div>
        <div><p className="text-xs text-gray-400 mb-1">Guests</p><p className="font-semibold text-sm">{booking.num_people}</p></div>
        <div><p className="text-xs text-gray-400 mb-1">Verified Amount Paid</p><p className="font-semibold text-sm">₱{Number(booking.amount_paid || 0).toLocaleString()}</p></div>
        {booking.service_start_at && <div className="col-span-2"><p className="text-xs text-gray-400 mb-1">Session Started</p><p className="font-semibold text-sm">{new Date(booking.service_start_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}</p></div>}
      </div>
      {!startEligible && !isOngoing && booking.status !== "completed" && <div className="bg-orange-50 text-orange-800 border border-orange-200 p-4 rounded-xl text-sm">
        {booking.date !== today ? `This booking is scheduled for ${booking.date}. It cannot start today.` : !READY.includes(booking.status) ? "Only confirmed bookings can start a photo session." : "Admin must verify the required down payment before the session can start."}
      </div>}
      {(startEligible || canComplete) && <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        {confirming === "" ? <button type="button" onClick={()=>setConfirming(isOngoing ? "complete" : "start")} disabled={working} className="w-full bg-gray-900 hover:bg-gray-800 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-50">{isOngoing ? "Complete Photo Session" : "Start Photo Session"}</button> : <>
          <p className="text-sm font-medium">{confirming === "start" ? `Confirm that ${booking.client?.name || 'this client'} is ready to start taking pictures?` : `Mark ${booking.tracking_number} as Session Completed?`}</p>
          <div className="flex gap-2"><button type="button" disabled={working} onClick={()=>changeSession(confirming)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-3 py-3 text-sm font-semibold disabled:opacity-50">{working ? "Saving..." : "Yes, Confirm"}</button><button type="button" onClick={()=>setConfirming("")} className="px-5 border border-gray-200 rounded-xl text-sm font-semibold">Cancel</button></div>
        </>}
      </div>}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-sm mb-3">Scan / Session History</h3>
        {history.length === 0 ? <p className="text-sm text-gray-400">No scan activity yet.</p> : <div className="space-y-3 max-h-52 overflow-auto">{history.map((h)=><div key={h.id} className="border-b border-gray-100 last:border-b-0 pb-2 text-xs flex flex-wrap justify-between gap-2"><div><p className="font-medium capitalize text-gray-800">{h.event.replace(/_/g," ")} · {h.method.toUpperCase()}</p><p className="text-gray-500">{h.actor?.name || "Team member"} ({h.actor?.role || "staff"})</p></div><p className="text-gray-500">{new Date(h.created_at).toLocaleString("en-PH", { timeZone:"Asia/Manila" })}</p></div>)}</div>}
      </div>
      <button type="button" onClick={reset} className="w-full border border-gray-200 bg-white rounded-xl px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">Scan Another Booking</button>
    </div>}
    {error && <div role="alert" className="bg-red-50 text-red-700 border border-red-200 p-4 mt-4 rounded-xl text-sm">{error}</div>}
  </div>;
}
