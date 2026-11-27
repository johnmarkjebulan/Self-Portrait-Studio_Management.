import { useEffect, useState } from "react";
import { settingsApi } from "../../services/api";

// This is the official QR image uploaded by Admin, not a text/phone-number QR.
export default function StudioPaymentQR({ cacheKey = "", size = 210 }) {
  const [missing, setMissing] = useState(false);
  useEffect(() => setMissing(false), [cacheKey]);
  if (missing) return (
    <div className="max-w-xs text-center rounded-xl border border-amber-200 bg-amber-50 text-amber-800 p-4 text-sm leading-relaxed">
      <p className="font-semibold">Official payment QR not uploaded yet</p>
      <p className="mt-1">Ask the studio for verified payment details. Do not scan a phone-number QR as though it were an official QR Ph payment code.</p>
    </div>
  );
  return <img
    key={cacheKey}
    src={`${settingsApi.paymentQrUrl()}${cacheKey ? `?v=${encodeURIComponent(cacheKey)}` : ""}`}
    alt="Official studio payment QR uploaded by Admin"
    width={size} height={size}
    className="object-contain max-w-full h-auto rounded-xl bg-white p-2 border border-gray-200"
    onError={() => setMissing(true)}
  />;
}
