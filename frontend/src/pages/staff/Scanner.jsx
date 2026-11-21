import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import jsQR from "jsqr";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { StatusBadge } from "../../components/common/StatusBadge";
import { appointmentsApi } from "../../services/api";
import { studioToday } from "../../utils/date";

const READY_STATUSES = new Set(["confirmed", "rescheduled", "waiting", "checked_in"]);
const PAID_STATUSES = new Set(["verified", "partially_paid", "fully_paid"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function Detail({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-gray-900">{children || "Not available"}</dd>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not available";
  return parsed.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function StaffScanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const cameraTokenRef = useRef(0);
  const previousFrameRef = useRef(0);
  const busyRef = useRef(false);

  const [scanning, setScanning] = useState(false);
  const [working, setWorking] = useState(false);
  const [imageWorking, setImageWorking] = useState(false);
  const [booking, setBooking] = useState(null);
  const [method, setMethod] = useState("qr");
  const [tracking, setTracking] = useState("");
  const [history, setHistory] = useState([]);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    cameraTokenRef.current += 1;
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) stopCamera();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      cameraTokenRef.current += 1;
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [stopCamera]);

  const lookup = useCallback(async (payload) => {
    if (busyRef.current) return;
    busyRef.current = true;
    stopCamera();
    setWorking(true);
    setConfirmation("");
    setError("");
    try {
      const result = await appointmentsApi.scan(payload);
      const found = result?.appointment;
      if (!found) throw new Error("Booking details are unavailable. Please retry.");
      setBooking(found);
      setMethod(result.method === "manual" ? "manual" : "qr");
      setTracking(found.tracking_number || "");
      const records = await appointmentsApi.scanHistory(found.id).catch(() => []);
      setHistory(Array.isArray(records) ? records : []);
      if (found.status === "now_serving") {
        toast("This photo session is already in progress.", "info");
      } else if (found.status === "completed") {
        toast("This photo session has already been completed.", "info");
      } else {
        toast("Booking verified. Review the details before starting a session.", "success");
      }
    } catch (err) {
      setBooking(null);
      setHistory([]);
      setError(err?.message || "Could not verify the booking. Try again.");
    } finally {
      setWorking(false);
      busyRef.current = false;
    }
  }, [stopCamera, toast]);

  async function startCamera() {
    if (working || imageWorking || scanning) return;
    setError("");
    setBooking(null);
    setHistory([]);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access requires localhost or HTTPS. Use manual tracking lookup or upload a QR image.");
      return;
    }
    stopCamera();
    const token = cameraTokenRef.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (token !== cameraTokenRef.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = media;
      const video = videoRef.current;
      if (!video) {
        stopCamera();
        setError("Camera preview is unavailable. Use manual tracking lookup.");
        return;
      }
      video.srcObject = media;
      setScanning(true);
      await video.play();
      if (token !== cameraTokenRef.current) return;
      previousFrameRef.current = 0;

      const scanFrame = (now) => {
        if (token !== cameraTokenRef.current || !streamRef.current || busyRef.current) return;
        if (now - previousFrameRef.current >= 180) {
          previousFrameRef.current = now;
          const source = videoRef.current;
          const canvas = canvasRef.current;
          if (source?.readyState >= 2 && source.videoWidth && canvas) {
            const scale = Math.min(1, 1000 / Math.max(source.videoWidth, source.videoHeight));
            canvas.width = Math.max(1, Math.round(source.videoWidth * scale));
            canvas.height = Math.max(1, Math.round(source.videoHeight * scale));
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
              const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const result = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
              if (result?.data) {
                lookup({ qr_payload: result.data });
                return;
              }
            }
          }
        }
        frameRef.current = requestAnimationFrame(scanFrame);
      };
      frameRef.current = requestAnimationFrame(scanFrame);
    } catch (err) {
      if (token !== cameraTokenRef.current) return;
      stopCamera();
      setError(err?.name === "NotAllowedError"
        ? "Camera permission was denied. Enable camera access or use manual lookup / QR image upload."
        : "Unable to open camera. Use manual lookup or upload an image of the booking QR.");
    }
  }

  async function scanImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || working || imageWorking) return;
    if (!file.type.startsWith("image/")) {
      setError("Select an image containing the client's booking QR code.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("QR image is too large. Select an image smaller than 10 MB.");
      return;
    }
    stopCamera();
    setError("");
    setImageWorking(true);
    const imageUrl = URL.createObjectURL(file);
    try {
      const picture = new Image();
      await new Promise((resolve, reject) => {
        picture.onload = resolve;
        picture.onerror = () => reject(new Error("Unable to read that image."));
        picture.src = imageUrl;
      });
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("QR image reader is unavailable.");
      const scale = Math.min(1, 1600 / Math.max(picture.naturalWidth, picture.naturalHeight));
      canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("QR image reader is unavailable.");
      ctx.drawImage(picture, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
      if (!decoded?.data) throw new Error("No readable QR code was found. Try a clearer image or manual lookup.");
      await lookup({ qr_payload: decoded.data });
    } catch (err) {
      setError(err?.message || "Could not read the QR image.");
    } finally {
      URL.revokeObjectURL(imageUrl);
      setImageWorking(false);
    }
  }

  function reset() {
    stopCamera();
    setBooking(null);
    setHistory([]);
    setTracking("");
    setError("");
    setConfirmation("");
    setMethod("qr");
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
      setConfirmation("");
      const records = await appointmentsApi.scanHistory(updated.id).catch(() => []);
      setHistory(Array.isArray(records) ? records : []);
      toast(action === "start" ? "Photo session started." : "Photo session completed.", "success");
    } catch (err) {
      setError(err?.message || "Could not update the session. Please try again.");
      const fresh = await appointmentsApi.find(booking.id).catch(() => null);
      if (fresh) setBooking(fresh);
    } finally {
      setWorking(false);
    }
  }

  const today = studioToday();
  const canStart = Boolean(booking && booking.date === today && READY_STATUSES.has(booking.status)
    && PAID_STATUSES.has(booking.payment_status)
    && Number(booking.amount_paid || 0) >= Number(booking.down_payment || 0));
  const canComplete = booking?.status === "now_serving";
  const isCompleted = booking?.status === "completed";
  const cannotStartReason = booking?.date !== today
    ? `This booking is scheduled for ${booking?.date || "another date"}, not today.`
    : !READY_STATUSES.has(booking?.status)
      ? "This booking status is not eligible to start a photo session."
      : "Admin must verify the required down payment before the session starts.";

  return (
    <div className="mx-auto max-w-5xl space-y-5 animate-fade-in">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff QR Booking Scanner</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Verify a client's booking before starting a photography session. Scanning a QR code does not start the session automatically.
          </p>
          <p className="mt-1 text-xs text-gray-500">Signed in as {user?.name || "Staff member"} · Studio date: {today}</p>
        </div>
        <Link to="/staff/appointments" className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          View appointments
        </Link>
      </header>

      {!booking && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["1. Scan", "Open the camera or choose a QR image."],
              ["2. Verify", "Check the client, schedule, package and payment."],
              ["3. Confirm", "Start the photo session only when eligible."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
                <p className="mt-1 text-xs text-gray-500">{description}</p>
              </div>
            ))}
          </div>

          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="bg-gray-950">
              <div className="relative flex aspect-video min-h-48 items-center justify-center overflow-hidden">
                <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${scanning ? "block" : "hidden"}`} />
                <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
                {scanning ? (
                  <>
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="flex h-48 w-48 items-center justify-center overflow-hidden rounded-2xl border-2 border-amber-400/90">
                        <div className="studio-scan-line w-full" />
                      </div>
                    </div>
                    <button type="button" onClick={stopCamera} className="absolute right-3 top-3 rounded-xl bg-black/75 px-4 py-2 text-sm font-semibold text-white">
                      Stop camera
                    </button>
                  </>
                ) : (
                  <div className="px-5 py-8 text-center text-white">
                    <div className="text-4xl text-amber-400" aria-hidden="true">▣</div>
                    <p className="mt-3 text-sm text-gray-200">Position the client's booking QR code inside the camera frame.</p>
                    <button type="button" onClick={startCamera} disabled={working || imageWorking}
                      className="mt-4 rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-gray-950 hover:bg-amber-400 disabled:opacity-50">
                      {working ? "Verifying..." : "Open camera"}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-xs text-gray-500">Camera requires HTTPS or localhost. Use the alternatives below if camera access is blocked.</p>
              <label className="cursor-pointer rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100">
                {imageWorking ? "Reading image..." : "Upload QR image"}
                <input type="file" accept="image/*" className="sr-only" disabled={working || imageWorking} onChange={scanImage} aria-label="Upload booking QR image" />
              </label>
            </div>
          </section>

          <form className="rounded-2xl border border-gray-200 bg-white p-5" onSubmit={(event) => {
            event.preventDefault();
            if (!tracking.trim()) return;
            lookup({ tracking_number: tracking.trim() });
          }}>
            <h2 className="text-base font-semibold text-gray-900">Manual booking lookup</h2>
            <p className="mt-1 text-xs text-gray-500">Enter the tracking number shown on the client's booking confirmation.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input type="text" autoComplete="off" value={tracking} onChange={(event) => setTracking(event.target.value.toUpperCase())}
                aria-label="Booking tracking number" placeholder="SP-2026-0001"
                className="min-w-0 flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm font-mono focus:border-amber-400 focus:outline-none" />
              <button type="submit" disabled={working || imageWorking || !tracking.trim()}
                className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50">
                {working ? "Verifying..." : "Verify booking"}
              </button>
            </div>
          </form>
        </>
      )}

      {booking && (
        <>
          <section className={`rounded-2xl border p-5 ${canComplete ? "border-emerald-200 bg-emerald-50" : isCompleted ? "border-gray-200 bg-gray-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                  {canComplete ? "Photo session in progress" : isCompleted ? "Session completed" : "Booking found — review details"}
                </p>
                <h2 className="mt-1 break-all text-xl font-bold text-gray-900">{booking.tracking_number}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={booking.status} />
                <StatusBadge status={booking.payment_status} />
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-600">Verified using {method === "manual" ? "manual tracking lookup" : "booking QR"}. No session status was changed by scanning.</p>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
            <h3 className="mb-4 text-base font-semibold text-gray-900">Booking details</h3>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Client">{booking.client?.name || "Client"}</Detail>
              <Detail label="Package">{booking.package?.name || "Photography session"}</Detail>
              <Detail label="Date">{booking.date}</Detail>
              <Detail label="Schedule">{booking.time}</Detail>
              <Detail label="Guests">{booking.num_people}</Detail>
              <Detail label="Verified amount paid">₱{Number(booking.amount_paid || 0).toLocaleString("en-PH")}</Detail>
              <Detail label="Required down payment">₱{Number(booking.down_payment || 0).toLocaleString("en-PH")}</Detail>
              {booking.service_start_at && <Detail label="Session started">{formatDateTime(booking.service_start_at)}</Detail>}
            </dl>
          </section>

          {!canStart && !canComplete && !isCompleted && (
            <div role="status" className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
              {cannotStartReason}
            </div>
          )}

          {(canStart || canComplete) && (
            <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
              <h3 className="font-semibold text-gray-900">Session action</h3>
              {confirmation === "" ? (
                <button type="button" disabled={working} onClick={() => setConfirmation(canComplete ? "complete" : "start")}
                  className="w-full rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50">
                  {canComplete ? "Complete photo session" : "Start photo session"}
                </button>
              ) : (
                <>
                  <p className="text-sm text-gray-700">
                    {confirmation === "start"
                      ? `Confirm that ${booking.client?.name || "the client"} is ready to start the photography session?`
                      : `Mark booking ${booking.tracking_number} as completed?`}
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button type="button" disabled={working} onClick={() => changeSession(confirmation)}
                      className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                      {working ? "Saving..." : "Yes, confirm"}
                    </button>
                    <button type="button" disabled={working} onClick={() => setConfirmation("")}
                      className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                      Cancel
                    </button>
                  </div>
                </>
              )}
              <p className="text-xs text-gray-500">The server validates eligibility before changing the session status.</p>
            </section>
          )}

          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <h3 className="text-base font-semibold text-gray-900">Scan and session history</h3>
            {history.length ? (
              <div className="mt-3 max-h-60 space-y-3 overflow-y-auto">
                {history.map((record) => (
                  <div key={record.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 pb-3 text-xs last:border-0">
                    <div>
                      <p className="font-semibold capitalize text-gray-800">{String(record.event || "activity").replace(/_/g, " ")} · {String(record.method || "qr").toUpperCase()}</p>
                      <p className="mt-1 text-gray-500">{record.actor?.name || "Team member"} ({record.actor?.role || "staff"})</p>
                    </div>
                    <span className="text-gray-500">{formatDateTime(record.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-3 text-sm text-gray-500">No scan activity is available yet.</p>}
          </section>

          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={working} onClick={reset}
              className="flex-1 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50">
              Scan another booking
            </button>
            <Link to="/staff/photo-sessions" className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50">
              Photo sessions
            </Link>
          </div>
        </>
      )}

      {(working || imageWorking) && <p role="status" className="text-xs font-medium text-gray-600">{imageWorking ? "Reading QR image..." : "Checking booking information..."}</p>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    </div>
  );
}
