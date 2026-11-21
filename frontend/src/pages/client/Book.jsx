import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { QRCodeSVG } from "qrcode.react";
import { packagesApi, settingsApi, clientBookingApi } from "../../services/api";
import { studioToday } from "../../utils/date";

const STEP_LABELS = ["Package", "Date & Time", "Details", "Add-ons", "Summary", "Confirmation"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Step Indicator ─────────────────────────────────────────────────────────

function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-0 mb-10 overflow-x-auto pb-1">
      {STEP_LABELS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex items-center shrink-0">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${done ? "bg-emerald-500 text-white" : active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-400"}`}
              >
                {done ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (i + 1)}
              </div>
              <span
                className={`text-xs mt-1.5 font-medium whitespace-nowrap ${active ? "text-gray-900" : done ? "text-emerald-600" : "text-gray-400"}`}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`h-0.5 w-8 mx-1 mb-5 transition-all ${done ? "bg-emerald-400" : "bg-gray-100"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Package Step ───────────────────────────────────────────────────────────

function PackageStep({ selected, onSelect }) {
  const { toast } = useToast();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    packagesApi.getAll()
      .then(setPackages)
      .catch((err) => {
        setPackages([]);
        toast(err.message || "Could not load packages.", "error");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400 text-sm">Loading packages…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Choose a Package</h2>
        <p className="text-gray-500 text-sm">Select the photography package that best fits your needs.</p>
      </div>
      {packages.length === 0 && (
        <div className="text-center text-sm text-gray-500 bg-gray-50 rounded-xl border border-gray-200 px-4 py-7">
          No photography packages are available yet. Please check again after the studio publishes its packages.
        </div>
      )}
      {packages.map((pkg) => (
        <button
          key={pkg.id}
          onClick={() => onSelect(pkg)}
          className={`w-full text-left rounded-2xl border-2 overflow-hidden transition-all ${selected?.id === pkg.id ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
        >
          <div className="grid sm:grid-cols-[150px_1fr]">
            {(pkg.image_data || pkg.image_url) && <div className="bg-gray-100"><img src={pkg.image_data || pkg.image_url} alt={pkg.name} className="w-full h-full min-h-[150px] object-cover" /></div>}
            <div className="p-5">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="font-semibold text-gray-900">{pkg.name}</h3>
              <p className="text-gray-500 text-sm mt-0.5">{pkg.description}</p>
            </div>
            <div className="text-right ml-4 shrink-0">
              <div className="text-lg font-bold text-gray-900">₱{pkg.price.toLocaleString()}</div>
              <div className="text-xs text-gray-400">{pkg.duration} min session</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
            <span>Up to {pkg.max_people} people</span>
            <span>{pkg.edited_photos} edited photos</span>
            {pkg.printed_photos > 0 && <span>{pkg.printed_photos} prints</span>}
          </div>
          {pkg.services && (
            <div className="flex flex-wrap gap-1.5">
              {pkg.services.map((s) => (
                <span key={s} className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-lg">{s}</span>
              ))}
            </div>
          )}
          {selected?.id === pkg.id && (
            <div className="mt-3 flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Selected
            </div>
          )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Schedule Step ─────────────────────────────────────────────────────────

function ScheduleStep({ selectedDate, selectedTime, onSelectDate, onSelectTime, refreshToken, onRefresh }) {
  const now = new Date();
  const todayKey = studioToday();
  const [currentMonth, setCurrentMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [monthDays, setMonthDays] = useState({});
  const [selectedAvailability, setSelectedAvailability] = useState(null);
  const [loadingCal, setLoadingCal] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

  const year = currentMonth.getFullYear();
  const monthIndex = currentMonth.getMonth();
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, monthIndex, 1).getDay();
  const getDateStr = (day) => `${monthKey}-${String(day).padStart(2, "0")}`;

  useEffect(() => {
    let active = true;
    setLoadingCal(true);
    clientBookingApi.getMonthAvailability(monthKey)
      .then((result) => {
        if (!active) return;
        setMonthDays(Object.fromEntries((result.days || []).map((day) => [day.date, day])));
      })
      .catch(() => {
        if (!active) return;
        setMonthDays({});
        setAvailabilityError("Could not load the studio calendar. Try Refresh availability.");
      })
      .finally(() => { if (active) setLoadingCal(false); });
    return () => { active = false; };
  }, [monthKey, refreshToken]);

  useEffect(() => {
    if (!selectedDate) {
      setSelectedAvailability(null);
      return;
    }
    let active = true;
    setLoadingSlots(true);
    setSelectedAvailability(null);
    setAvailabilityError("");
    clientBookingApi.getDateAvailability(selectedDate)
      .then((result) => {
        if (!active) return;
        setSelectedAvailability(result);
        if (selectedTime && !result.slots?.some(slot => slot.time === selectedTime && slot.available)) {
          onSelectTime("");
          setAvailabilityError("That slot is no longer available. Please select another time.");
        }
      })
      .catch((err) => {
        if (!active) return;
        setSelectedAvailability(null);
        setAvailabilityError(err.message || "Could not refresh available time slots.");
      })
      .finally(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [selectedDate, refreshToken]);

  const isCurrentOrPastMonth = monthKey <= todayKey.slice(0, 7);
  const prevMonth = () => {
    if (isCurrentOrPastMonth) return;
    setCurrentMonth(new Date(year, monthIndex - 1, 1));
  };
  const nextMonth = () => setCurrentMonth(new Date(year, monthIndex + 1, 1));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Select Date & Time</h2>
        <p className="text-gray-500 text-sm">Availability comes directly from studio hours, capacity, bookings, and Admin schedule overrides.</p>
        <button type="button" onClick={onRefresh} disabled={loadingCal || loadingSlots}
          className="mt-3 text-xs font-semibold underline text-gray-700 hover:text-gray-900 disabled:opacity-50">
          Refresh availability
        </button>
        {availabilityError && <p role="alert" className="mt-2 text-sm text-red-600">{availabilityError}</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-5">
        <div className="flex items-center justify-between mb-5">
          <button type="button" onClick={prevMonth} disabled={isCurrentOrPastMonth} aria-label="Previous month"
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="font-semibold text-gray-900 text-sm">{MONTH_NAMES[monthIndex]} {year}</span>
          <button type="button" onClick={nextMonth} aria-label="Next month"
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map((d) => <div key={d} className="text-center text-[10px] sm:text-xs text-gray-400 font-medium py-1">{d}</div>)}
        </div>

        {loadingCal ? (
          <div className="text-center text-gray-400 text-sm py-8">Loading availability…</div>
        ) : (
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const dateStr = getDateStr(day);
              const info = monthDays[dateStr];
              const status = info?.status || "closed";
              const disabled = dateStr < todayKey || status === "closed" || status === "full";
              const isSel = selectedDate === dateStr;
              const statusClass = status === "full"
                ? "bg-red-50 text-red-300"
                : status === "limited"
                  ? "bg-yellow-50 text-gray-800 hover:bg-yellow-100"
                  : status === "available"
                    ? "text-gray-800 hover:bg-gray-100"
                    : "text-gray-300";
              const dotColor = status === "full" ? "bg-red-400" : status === "limited" ? "bg-yellow-400" : status === "available" ? "bg-emerald-400" : "";
              return (
                <button type="button" key={day} disabled={disabled}
                  title={disabled ? (dateStr < todayKey ? "Past date" : status === "full" ? "Fully booked" : "Studio closed") : "Choose this date"}
                  onClick={() => { setAvailabilityError(""); onSelectDate(dateStr); onSelectTime(""); }}
                  className={`min-h-[46px] sm:min-h-[52px] rounded-lg sm:rounded-xl flex flex-col items-center justify-center text-xs transition-all ${isSel ? "bg-gray-900 text-white font-semibold" : `${statusClass} ${disabled ? "cursor-not-allowed" : "cursor-pointer font-medium"}`}`}>
                  <span>{day}</span>
                  {!isSel && dotColor && <span className={`w-1.5 h-1.5 rounded-full mt-1 ${dotColor}`} />}
                  {!isSel && status === "closed" && dateStr >= todayKey && <span className="hidden sm:block text-[9px] mt-0.5">Closed</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-x-4 gap-y-2 mt-4 pt-4 border-t border-gray-100 flex-wrap">
          {[{ color: "bg-emerald-400", label: "Available" }, { color: "bg-yellow-400", label: "Limited" }, { color: "bg-red-400", label: "Full" }].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-gray-500"><span className={`w-2 h-2 rounded-full ${color}`} />{label}</div>
          ))}
          <div className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2 h-2 rounded-full bg-gray-200" />Closed / Past</div>
        </div>
      </div>

      {selectedDate && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Times for {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })}
            </h3>
            {selectedAvailability && <span className="text-xs text-gray-400">{selectedAvailability.daily_remaining} daily booking slot(s) left</span>}
          </div>
          {loadingSlots ? (
            <div className="text-sm text-gray-400 py-5">Loading time slots…</div>
          ) : !selectedAvailability ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Availability could not be confirmed. Refresh before continuing.</div>
          ) : selectedAvailability.closed || selectedAvailability.slots.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">The studio is closed or has no time slots on this date.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {selectedAvailability.slots.map((slot) => {
                const isSel = selectedTime === slot.time;
                return (
                  <button type="button" key={slot.time} disabled={!slot.available} onClick={() => onSelectTime(slot.time)}
                    className={`min-h-[52px] px-3 py-2 rounded-xl border-2 text-sm text-center transition-all font-semibold ${isSel ? "border-gray-900 bg-gray-900 text-white" : slot.available ? "border-gray-200 bg-white hover:border-gray-400 text-gray-800" : "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"}`}>
                    <span className="block">{slot.time}</span>
                    <span className={`block text-[10px] mt-0.5 ${isSel ? "text-white/70" : slot.available ? "text-gray-400" : "text-gray-300"}`}>
                      {slot.reason === "elapsed" || slot.reason === "past" ? "Time passed" : slot.reason === "blocked" ? "Blocked" : slot.reason === "closed" ? "Closed" : slot.available ? `${slot.remaining} left` : "Fully booked"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Details Step ───────────────────────────────────────────────────────────

function DetailsStep({ pkg, numPeople, setNumPeople, specialRequests, setSpecialRequests, errors }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Session Details</h2>
        <p className="text-gray-500 text-sm">Tell us more about your group and any special requests.</p>
      </div>
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm">
        <div className="font-medium text-gray-900 mb-1">{pkg.name}</div>
        <div className="text-gray-500">Up to {pkg.max_people} people · {pkg.duration} min</div>
      </div>
      <div>
        <label className="text-gray-500 text-xs uppercase tracking-wider block mb-2">Number of People</label>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setNumPeople(Math.max(1, numPeople - 1))}
            className="w-10 h-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-lg transition-colors"
          >
            −
          </button>
          <span className="w-12 text-center text-gray-900 font-semibold text-lg">{numPeople}</span>
          <button
            onClick={() => setNumPeople(Math.min(pkg.max_people, numPeople + 1))}
            className="w-10 h-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-lg transition-colors"
          >
            +
          </button>
          <span className="text-gray-400 text-sm">/ {pkg.max_people} max</span>
        </div>
        {errors.numPeople && <p className="text-red-500 text-xs mt-1">{errors.numPeople}</p>}
      </div>
      <div>
        <label className="text-gray-500 text-xs uppercase tracking-wider block mb-2">
          Special Requests <span className="normal-case">(optional)</span>
        </label>
        <textarea
          value={specialRequests}
          onChange={(e) => setSpecialRequests(e.target.value)}
          placeholder="Backdrop preference, props, styling notes, accessibility needs..."
          rows={4}
          className="w-full bg-gray-50 border border-gray-200 focus:border-gray-400 text-gray-900 placeholder:text-gray-400 px-4 py-3 rounded-xl outline-none text-sm transition-colors resize-none"
        />
      </div>
    </div>
  );
}

// ── Addon Step ─────────────────────────────────────────────────────────────

function AddonStep({ selected, onToggle }) {
  const { toast } = useToast();
  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    packagesApi.getAddons()
      .then(setAddons)
      .catch((err) => {
        setAddons([]);
        toast(err.message || "Could not load add-ons.", "error");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400 text-sm">Loading add-ons…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Add-ons</h2>
        <p className="text-gray-500 text-sm">Enhance your session with optional extras.</p>
      </div>
      {addons.length === 0 ? (
        <div className="text-gray-400 text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-5 text-center">
          No add-ons available at this time.
        </div>
      ) : (
        addons.map((addon) => {
          const isSelected = selected.includes(addon.id);
          return (
            <button
              key={addon.id}
              onClick={() => onToggle(addon.id, addon)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between
                ${isSelected ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? "border-gray-900 bg-gray-900" : "border-gray-300"}`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div>
                  <div className="font-medium text-gray-900 text-sm">{addon.name}</div>
                  <div className="text-gray-500 text-xs mt-0.5">{addon.description}</div>
                </div>
              </div>
              <div className="text-gray-900 font-semibold text-sm ml-4 shrink-0">+₱{addon.price.toLocaleString()}</div>
            </button>
          );
        })
      )}
    </div>
  );
}

// ── Summary Step ───────────────────────────────────────────────────────────

function SummaryRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-900 text-right">{value}</span>
    </div>
  );
}

function SummaryStep({ pkg, selectedDate, selectedTime, numPeople, specialRequests, selectedAddonIds, addonObjects, total, downPayment, settings }) {
  const dateDisplay = new Date(selectedDate + "T12:00:00").toLocaleDateString("en-PH", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  const dpLabel =
    settings?.down_payment_type === "percentage"
      ? `Down Payment (${settings.down_payment_value}%)`
      : "Down Payment (Required)";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Booking Summary</h2>
        <p className="text-gray-500 text-sm">Review your details before confirming.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-3.5">
          <div className="text-gray-900 font-semibold">{pkg.name}</div>
          <div className="text-gray-500 text-sm">{dateDisplay} · {selectedTime}</div>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3 text-sm">
          <SummaryRow label="Date" value={dateDisplay} />
          <SummaryRow label="Time" value={selectedTime} />
          <SummaryRow label="People" value={`${numPeople} person${numPeople !== 1 ? "s" : ""}`} />
          {specialRequests && <SummaryRow label="Special Requests" value={specialRequests} />}
        </div>

        <div className="border-t border-gray-200 px-5 py-4 flex flex-col gap-2 text-sm">
          <SummaryRow label="Package Price" value={`₱${pkg.price.toLocaleString()}`} />
          {addonObjects.map((a) => (
            <SummaryRow key={a.id} label={a.name} value={`+₱${a.price.toLocaleString()}`} />
          ))}
          <div className="border-t border-gray-100 pt-2 mt-1 flex justify-between font-semibold text-gray-900">
            <span>Total</span>
            <span>₱{total.toLocaleString()}</span>
          </div>
        </div>

        <div className="border-t border-gray-200 px-5 py-4 bg-amber-50">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-gray-700 font-medium">{dpLabel}</span>
            <span className="text-gray-900 font-bold">₱{downPayment.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>Remaining Balance</span>
            <span>₱{(total - downPayment).toLocaleString()}</span>
          </div>
          <p className="text-xs text-amber-700 mt-2.5 leading-relaxed">
            Pay the down payment via QR Ph on the next step. The balance is due on session day.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Confirmation Step ──────────────────────────────────────────────────────

function ConfirmationStep({ appt }) {
  const navigate = useNavigate();
  const dateDisplay = new Date(appt.date + "T12:00:00").toLocaleDateString("en-PH", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const qrValue = appt.qr_payload; // Signed QR supplied by the backend; never construct locally.

  return (
    <div className="text-center flex flex-col items-center gap-6 py-4">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
        <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Booking Submitted!</h2>
        <p className="text-gray-500 text-sm max-w-sm mx-auto">
          Your booking request is saved. Payment is still required before the studio can confirm your session.
          Keep your tracking number for reference.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5 w-full max-w-xs">
        <div className="text-gray-500 text-xs uppercase tracking-wider mb-2">Tracking Number</div>
        <div className="tracking-number text-xl font-bold text-gray-900 mb-4">{appt.tracking_number}</div>
        <div className="text-gray-500 text-sm mb-1">{dateDisplay}</div>
        <div className="text-gray-500 text-sm">{appt.time}</div>
        <div className="text-sm text-amber-700 mt-3">Payment pending · Required down payment: ₱{Number(appt.down_payment || 0).toLocaleString()}</div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col items-center gap-3 w-full max-w-xs">
        <div className="text-gray-500 text-xs uppercase tracking-wider">Booking Check-in</div>
        {appt.status !== "confirmed" && <p className="text-sm text-amber-700 text-center">The scannable QR will appear in My Bookings once the studio confirms your booking and payment.</p>}
        {appt.status === "confirmed" && qrValue && <div className="bg-white border border-gray-100 rounded-xl p-3"><QRCodeSVG value={qrValue} size={140} fgColor="#111827" bgColor="#ffffff" level="M" /></div>}
        <p className="text-gray-400 text-xs text-center leading-relaxed">Open My Bookings on session day for your current, verified QR code. Do not use an old screenshot after an account security reset.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <button
          onClick={() => navigate("/client/dashboard")}
          className="flex-1 bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
        >
          View Dashboard
        </button>
        <button
          onClick={() => navigate("/client/book")}
          className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold py-3 rounded-xl text-sm transition-colors"
        >
          New Booking
        </button>
      </div>
    </div>
  );
}

// ── Main Booking Wizard ────────────────────────────────────────────────────

export default function BookingWizard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [numPeople, setNumPeople] = useState(1);
  const [specialRequests, setSpecialRequests] = useState("");
  const [selectedAddonIds, setSelectedAddonIds] = useState([]);
  const [addonObjects, setAddonObjects] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [createdAppt, setCreatedAppt] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    settingsApi.get()
      .then(setSettings)
      .catch((err) => toast(err.message || "Could not load studio payment settings.", "error"));
  }, []);

  const total = selectedPackage
    ? selectedPackage.price + addonObjects.reduce((s, a) => s + a.price, 0)
    : 0;

  const downPayment = settings
    ? settings.down_payment_type === "percentage"
      ? Math.round(total * (settings.down_payment_value / 100))
      : (settings.down_payment_value || 0)
    : 0;

  const toggleAddon = (id, addonObj) => {
    setSelectedAddonIds((prev) => {
      if (prev.includes(id)) {
        setAddonObjects((objs) => objs.filter((a) => a.id !== id));
        return prev.filter((a) => a !== id);
      } else {
        if (addonObj) setAddonObjects((objs) => [...objs, addonObj]);
        return [...prev, id];
      }
    });
  };

  const canNext = () => {
    if (step === 0) return !!selectedPackage;
    if (step === 1) return !!(selectedDate && selectedTime);
    return true;
  };

  const verifySelectedTime = async () => {
    const data = await clientBookingApi.getDateAvailability(selectedDate);
    const slot = data.slots?.find(item => item.time === selectedTime);
    if (data.closed || data.full || !slot?.available) {
      setSelectedTime("");
      setBookingError("The selected date or time is now unavailable. Choose another slot.");
      setAvailabilityRefresh(value => value + 1);
      setStep(1);
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    if (step === 1) {
      if (!selectedDate || !selectedTime || checkingAvailability) return;
      setCheckingAvailability(true);
      setBookingError("");
      try {
        if (!(await verifySelectedTime())) return;
      } catch (err) {
        setBookingError(err.message || "Could not verify availability. Try again.");
        return;
      } finally {
        setCheckingAvailability(false);
      }
    }
    if (step === 2) {
      const e = {};
      if (numPeople < 1) e.numPeople = "At least 1 person required.";
      if (selectedPackage && numPeople > selectedPackage.max_people)
        e.numPeople = `Max ${selectedPackage.max_people} people for this package.`;
      if (Object.keys(e).length) { setFieldErrors(e); return; }
      setFieldErrors({});
    }
    setStep((s) => s + 1);
  };

  const handleCreateAppointment = async () => {
    if (!user || !selectedPackage || !selectedDate || !selectedTime) return;
    if (submitting) return;
    setSubmitting(true);
    setBookingError("");

    try {
      if (!(await verifySelectedTime())) return;
      const appt = await clientBookingApi.create({
        package_id: selectedPackage.id,
        date: selectedDate,
        time: selectedTime,
        num_people: numPeople,
        special_requests: specialRequests,
        addon_ids: selectedAddonIds,
      });

      setCreatedAppt(appt);
      setStep(5);
      toast("Booking saved. Payment is pending studio verification.", "success");
    } catch (err) {
      if (err.status === 409) {
        setSelectedTime("");
        setStep(1);
        setAvailabilityRefresh(value => value + 1);
        setBookingError("Another booking or studio schedule change made that slot unavailable. Please select a new time.");
      } else {
        setBookingError(err.message || "Failed to create booking. Please try again.");
      }
      toast(err.message || "Failed to create booking. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep = () => {
    if (step === 5 && createdAppt) return <ConfirmationStep appt={createdAppt} />;
    if (step === 4 && selectedPackage && selectedDate && selectedTime) {
      return (
        <SummaryStep
          pkg={selectedPackage}
          selectedDate={selectedDate}
          selectedTime={selectedTime}
          numPeople={numPeople}
          specialRequests={specialRequests}
          selectedAddonIds={selectedAddonIds}
          addonObjects={addonObjects}
          total={total}
          downPayment={downPayment}
          settings={settings}
        />
      );
    }
    if (step === 3) {
      return (
        <AddonStep
          selected={selectedAddonIds}
          onToggle={toggleAddon}
        />
      );
    }
    if (step === 2 && selectedPackage) {
      return (
        <DetailsStep
          pkg={selectedPackage}
          numPeople={numPeople}
          setNumPeople={setNumPeople}
          specialRequests={specialRequests}
          setSpecialRequests={setSpecialRequests}
          errors={fieldErrors}
        />
      );
    }
    if (step === 1) {
      return (
        <ScheduleStep
          selectedDate={selectedDate}
          selectedTime={selectedTime}
          onSelectDate={setSelectedDate}
          onSelectTime={(time) => { setSelectedTime(time); setBookingError(""); }}
          refreshToken={availabilityRefresh}
          onRefresh={() => setAvailabilityRefresh(value => value + 1)}
        />
      );
    }
    return (
      <PackageStep
        selected={selectedPackage}
        onSelect={(p) => { setSelectedPackage(p); setSelectedAddonIds([]); setAddonObjects([]); }}
      />
    );
  };

  const showNav = step < 5;
  const studioAddress = settings?.studio_address || "";

  return (
    <div className="animate-fade-in max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">New Booking</h1>
        <p className="text-gray-500 text-sm mt-1">
          Book your portrait session{studioAddress ? ` at ${studioAddress}` : ""}.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 card-shadow">
        <StepIndicator current={step} />
        {bookingError && <div role="alert" className="mb-5 border border-red-200 bg-red-50 rounded-xl p-3 text-sm text-red-700">{bookingError}</div>}
        <div className="min-h-[360px]">
          {renderStep()}
        </div>

        {showNav && (
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 mt-8 pt-6 border-t border-gray-100">
            <button
              onClick={() => step === 0 ? navigate("/client/dashboard") : setStep((s) => s - 1)}
              className="w-full sm:w-auto px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-sm transition-colors"
            >
              {step === 0 ? "Cancel" : "Back"}
            </button>

            {step < 4 ? (
              <button
                onClick={handleNext}
                disabled={!canNext() || checkingAvailability}
                className="w-full sm:w-auto px-6 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white font-semibold rounded-xl text-sm transition-colors"
              >
                {checkingAvailability ? "Checking slot…" : "Next"}
              </button>
            ) : (
              <button
                onClick={handleCreateAppointment}
                disabled={submitting}
                className="w-full sm:w-auto px-6 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors"
              >
                {submitting ? "Creating…" : "Confirm Booking"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
