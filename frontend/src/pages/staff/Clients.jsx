import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usersApi } from "../../services/api";

const valueOr = (value, fallback = "Not provided") => {
  const result = value === null || value === undefined ? "" : String(value).trim();
  return result || fallback;
};

function ClientDetails({ client, onClose }) {
  useEffect(() => {
    const handleKeydown = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onClose]);

  const mobile = client.mobile || client.phone || client.contact_number;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="staff-client-details-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Client record</p>
            <h2 id="staff-client-details-title" className="mt-1 text-xl font-bold text-gray-900">{valueOr(client.name, "Unnamed client")}</h2>
            <p className="mt-1 text-xs text-gray-500">View-only contact information</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close client details" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">Close</button>
        </div>
        <dl className="mt-5 space-y-3">
          <div className="rounded-xl bg-gray-50 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Client name</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-gray-900">{valueOr(client.name)}</dd>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Email address</dt>
            <dd className="mt-1 break-all text-sm font-medium text-gray-900">{valueOr(client.email)}</dd>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Mobile number</dt>
            <dd className="mt-1 break-words text-sm font-medium text-gray-900">{valueOr(mobile)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-gray-500">Client records are read-only in the Staff portal.</p>
      </section>
    </div>
  );
}

export default function StaffClients() {
  const mounted = useRef(false);
  const busy = useRef(false);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const reload = useCallback(async () => {
    if (!mounted.current || busy.current) return;
    busy.current = true;
    setRefreshing(true);
    setError("");
    try {
      const result = await usersApi.getAll("client");
      if (!mounted.current) return;
      setRows(Array.isArray(result) ? result : []);
      setUpdatedAt(new Date());
    } catch (err) {
      if (mounted.current) setError(err?.message || "Could not load client records.");
    } finally {
      busy.current = false;
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    reload();
    return () => { mounted.current = false; };
  }, [reload]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const result = rows.filter((client) => {
      const haystack = [client.name, client.email, client.mobile, client.phone, client.contact_number]
        .map((item) => String(item || "")).join(" ").toLowerCase();
      return !needle || haystack.includes(needle);
    });
    result.sort((a, b) => String(a[sort] || "").localeCompare(String(b[sort] || ""), undefined, { sensitivity: "base" }));
    return result;
  }, [rows, query, sort]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Client Information</h1>
          <p className="mt-1 text-sm text-gray-500">Search and review registered client contact details for studio operations.</p>
        </div>
        <button type="button" onClick={reload} disabled={refreshing} className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">{refreshing ? "Refreshing..." : "Refresh clients"}</button>
      </header>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5" aria-label="Client search and sorting">
        <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
          <label className="block text-xs font-semibold text-gray-600">
            Search clients
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, or mobile number" className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm font-normal text-gray-900 outline-none focus:border-amber-500" />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Sort by
            <select value={sort} onChange={(event) => setSort(event.target.value)} className="mt-1.5 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal text-gray-900">
              <option value="name">Client name</option>
              <option value="email">Email address</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-xs text-gray-500">Showing {filtered.length} of {rows.length} registered clients</p>
          {query && <button type="button" onClick={() => setQuery("")} className="text-xs font-semibold text-amber-700 hover:underline">Clear search</button>}
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} {updatedAt ? "Showing the last available information." : ""} <button type="button" onClick={reload} className="ml-2 font-semibold underline">Retry</button></div>}

      {loading ? (
        <div role="status" className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading client records...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="font-semibold text-gray-800">{rows.length ? "No clients match your search." : "No registered clients available."}</p>
          <p className="mt-1 text-sm text-gray-500">{rows.length ? "Try searching by a different name, email, or number." : "Client records will appear here when available."}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((client) => (
            <article key={client.id || client.email} className="flex min-w-0 items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white" aria-hidden="true">{valueOr(client.name, "?").slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-gray-900">{valueOr(client.name, "Unnamed client")}</p>
                <p className="mt-1 truncate text-xs text-gray-600">{valueOr(client.email)}</p>
                <p className="mt-0.5 text-xs text-gray-500">{valueOr(client.mobile || client.phone || client.contact_number, "No mobile number")}</p>
                <button type="button" onClick={() => setSelected(client)} className="mt-3 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100" aria-label={`View client details for ${valueOr(client.name, "unnamed client")}`}>View details</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {updatedAt && <p className="text-right text-xs text-gray-400">Last updated: {updatedAt.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" })} (PH time)</p>}
      {selected && <ClientDetails client={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
