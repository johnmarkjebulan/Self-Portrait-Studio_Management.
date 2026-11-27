import { useEffect, useState } from "react";
import { analyticsApi } from "../../services/api";
import { studioToday, studioMonthStart } from "../../utils/date";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const AMBER = "#f59e0b";
const CHART_COLORS = ["#f59e0b", "#6366f1", "#10b981", "#ef4444", "#8b5cf6"];
const tooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "0.5rem",
  color: "#111827",
  fontSize: 12,
};

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 card-shadow p-5">
      <p className="font-display text-2xl font-semibold text-gray-900">
        {value}
      </p>
      <p className="text-gray-500 text-sm mt-0.5">{label}</p>
      {sub && <p className="text-gray-400 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminAnalytics() {
  const [from, setFrom] = useState(studioMonthStart);
  const [to, setTo] = useState(studioToday);
  const [range, setRange] = useState(() => ({ from: studioMonthStart(), to: studioToday() }));
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const valid = Boolean(from && to && from <= to);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    setLoading(true);
    analyticsApi.get(range.from, range.to)
      .then(d => { if (active) setData(d); })
      .catch(e => { if (active) setError(e.message || "Failed to load analytics."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range]);

  const formatDate = value => new Intl.DateTimeFormat('en-PH', {dateStyle:'medium', timeZone:'UTC'}).format(new Date(value + 'T00:00:00Z'));
  const chartPeriod = data?.range?.granularity === 'month' ? 'Monthly' : 'Daily';

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-gray-900">
            Analytics
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            View studio performance for your selected dates.
          </p>
        </div>
      </div>
      <form onSubmit={event => { event.preventDefault(); if (valid && !loading) setRange({from,to}); }} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 mb-5 card-shadow">
        <div className="text-sm font-semibold text-gray-900 mb-1">Custom date range</div>
        <p className="text-xs text-gray-500 mb-4">Choose any start and end date. Both dates are included (Philippine time).</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <label className="block min-w-0 text-xs font-medium text-gray-600">From<input type="date" required value={from} max={to || undefined} onChange={e=>setFrom(e.target.value)} className="mt-1 block w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900" /></label>
          <label className="block min-w-0 text-xs font-medium text-gray-600">To<input type="date" required value={to} min={from || undefined} onChange={e=>setTo(e.target.value)} className="mt-1 block w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900" /></label>
          <button type="submit" disabled={!valid || loading} className="w-full lg:w-auto rounded-xl bg-[#795449] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#654239] disabled:opacity-50">{loading ? 'Loading…' : 'Apply date range'}</button>
        </div>
        {!valid && <p role="alert" className="mt-2 text-xs text-red-700">Choose a From date on or before the To date.</p>}
      </form>
      <p className="mb-5 text-sm text-gray-600">Showing <strong>{formatDate(range.from)} – {formatDate(range.to)}</strong></p>
      <p className="mb-5 text-xs text-gray-500">Appointments use scheduled dates; revenue uses payment verification dates; new clients and feedback use creation dates. Statuses reflect current records, not historical snapshots.</p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-6">
          {error}
        </div>
      )}

      {loading && !error && (
        <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
          Loading analytics…
        </div>
      )}

      {data && (
        <>
          {/* Key metrics — 2×5 grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-10">
            <StatCard label="Total Appointments" value={data.totalAppts ?? 0} />
            <StatCard
              label="Completed"
              value={data.completedAppts ?? 0}
              sub={`${data.completionRate ?? "0.0"}% completion rate`}
            />
            <StatCard
              label="Revenue"
              value={`₱${(data.totalRevenue ?? 0).toLocaleString()}`}
            />
            <StatCard label="New Clients" value={data.newClients ?? 0} />
            <StatCard label="Cancelled" value={data.cancelledAppts ?? 0} />
            <StatCard
              label="No Shows"
              value={data.noShows ?? 0}
              sub={`${data.noShowRate ?? "0.0"}% no-show rate`}
            />
            <StatCard
              label="Avg. Rating"
              value={data.avgRating ?? "—"}
              sub={`${data.totalFeedback ?? 0} reviews`}
            />
            <StatCard
              label="Pending Payments"
              value={data.pendingPayments ?? 0}
            />
            <StatCard
              label="Capacity Utilization"
              value={`${data.capacityUtilization ?? 0}%`}
              sub="Selected date range"
            />
            <StatCard
              label="Pending Requests"
              value={data.pendingRequests ?? 0}
              sub="Cancel / Reschedule"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 mb-8 [&>*]:min-w-0">
            {/* Daily Appointments */}
            <div className="bg-white rounded-2xl border border-gray-200 card-shadow p-4 sm:p-6">
              <h3 className="font-semibold text-gray-900 text-sm mb-5">
                {chartPeriod} Appointments
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.daily || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#9ca3af", fontSize: 10 }}
                  />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="appointments"
                    stroke={AMBER}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Daily Revenue */}
            <div className="bg-white rounded-2xl border border-gray-200 card-shadow p-4 sm:p-6">
              <h3 className="font-semibold text-gray-900 text-sm mb-5">
                {chartPeriod} Revenue
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.daily || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#9ca3af", fontSize: 10 }}
                  />
                  <YAxis
                    tick={{ fill: "#9ca3af", fontSize: 10 }}
                    tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => [`₱${v.toLocaleString()}`, "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill={AMBER} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Bookings by Package */}
            <div className="bg-white rounded-2xl border border-gray-200 card-shadow p-4 sm:p-6">
              <h3 className="font-semibold text-gray-900 text-sm mb-5">
                Bookings by Package
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.packageData || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    type="number"
                    tick={{ fill: "#9ca3af", fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#9ca3af", fontSize: 10 }}
                    width={60}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar
                    dataKey="bookings"
                    fill={AMBER}
                    radius={[0, 3, 3, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Appointment Status Pie */}
            <div className="bg-white rounded-2xl border border-gray-200 card-shadow p-4 sm:p-6">
              <h3 className="font-semibold text-gray-900 text-sm mb-5">
                Appointment Status Breakdown
              </h3>
              {(data.statusData || []).length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={data.statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                      style={{ fontSize: 10, fill: "#6b7280" }}
                    >
                      {data.statusData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">
                  No data
                </div>
              )}
            </div>

            {/* Rating Distribution */}
            <div className="bg-white rounded-2xl border border-gray-200 card-shadow p-4 sm:p-6">
              <h3 className="font-semibold text-gray-900 text-sm mb-5">
                Feedback Rating Distribution
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.ratingDist || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="rating"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                  />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar
                    dataKey="count"
                    fill="#f59e0b"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Payment Status Pie */}
            <div className="bg-white rounded-2xl border border-gray-200 card-shadow p-4 sm:p-6">
              <h3 className="font-semibold text-gray-900 text-sm mb-5">
                Payment Status Distribution
              </h3>
              {(data.paymentData || []).length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={data.paymentData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                    >
                      {data.paymentData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend
                      iconSize={10}
                      wrapperStyle={{ fontSize: 11, color: "#9ca3af" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">
                  No data
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
