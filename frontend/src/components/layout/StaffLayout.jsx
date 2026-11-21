import { useEffect, useRef, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import NotificationBell from "../common/NotificationBell";

const Icon = ({ d }) => (
  <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const items = [
  ["/staff/dashboard", "Dashboard", "M3 12l2-2 7-7 7 7M5 10v10h4v-6h6v6h4V10"],
  ["/staff/appointments", "Appointments", "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"],
  ["/staff/scanner", "Scan Booking QR", "M4 4h5M4 4v5m16-5h-5m5 0v5M4 20h5m-5 0v-5m16 5h-5m5 0v-5M9 9h6v6H9z"],
  ["/staff/photo-sessions", "Photo Sessions", "M4 4h16v16H4z M8 8h8v8H8z"],
  ["/staff/clients", "Clients", "M12 4a4 4 0 110 8 4 4 0 010-8zm-7 17a7 7 0 0114 0"],
  ["/staff/posts", "Studio Posts", "M4 16l4-4a3 3 0 014 0l4 4m-2-2 1-1a3 3 0 014 0l1 1M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"],
  ["/staff/feedback", "Feedback", "M11.049 2.927l1.519 4.674h4.915l-3.976 2.888 1.519 4.674L12 12.275 8.974 15.163l1.519-4.674L6.517 7.601h4.915l1.519-4.674z"],
];

export default function StaffLayout() {
  const { user, logout, isStaff, authReady } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const closeButtonRef = useRef(null);
  const drawerRef = useRef(null);

  // On page navigation, close the mobile drawer automatically.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Keep mobile menu keyboard-accessible and prevent scrolling behind it.
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSidebarOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        drawerRef.current?.querySelectorAll('a[href], button:not([disabled])') || []
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const closeAtDesktop = (event) => { if (event.matches) setSidebarOpen(false); };
    mediaQuery.addEventListener("change", closeAtDesktop);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      mediaQuery.removeEventListener("change", closeAtDesktop);
    };
  }, [sidebarOpen]);

  if (!authReady && !user) return <div className="min-h-screen bg-gray-100" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isStaff) return <Navigate to={user.role === "admin" ? "/admin/dashboard" : "/client/dashboard"} replace />;

  const current = items.find(([path]) => path === location.pathname);
  const closeMenu = () => setSidebarOpen(false);
  const handleLogout = () => {
    closeMenu();
    logout();
    navigate("/");
  };
  const initials = user.name?.trim()?.charAt(0)?.toUpperCase() || "S";

  return (
    <div className="flex min-h-screen min-w-0 bg-gray-100">
      <a
        href="#staff-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-gray-900 focus:shadow-lg"
      >
        Skip to main content
      </a>

      <aside
        id="staff-sidebar"
        ref={drawerRef}
        aria-label="Staff sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(17rem,85vw)] shrink-0 flex-col bg-[#0d1117] text-white shadow-xl transition-transform duration-200 ease-out lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:translate-x-0 lg:shadow-none ${sidebarOpen ? "visible translate-x-0" : "invisible -translate-x-full pointer-events-none lg:visible lg:pointer-events-auto"}`}
      >
        <div className="flex min-h-16 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4">
          <Link to="/staff/dashboard" onClick={closeMenu} className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-xs font-bold text-white">SP</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">Pose and Pics</p>
              <p className="mt-0.5 text-[11px] text-white/50">Staff Portal</p>
            </div>
          </Link>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => { closeMenu(); menuButtonRef.current?.focus(); }}
            aria-label="Close staff menu"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 lg:hidden"
          >
            <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="shrink-0 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-sm font-semibold text-amber-400">{initials}</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{user.name || "Staff Member"}</p>
              <p className="mt-0.5 text-[11px] text-amber-400">Staff Account</p>
            </div>
          </div>
        </div>

        <nav aria-label="Staff pages" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-white/40">Daily Operations</p>
          {items.map(([path, label, d]) => {
            const active = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                aria-current={active ? "page" : undefined}
                onClick={closeMenu}
                className={`mb-1 flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${active ? "bg-white/15 text-white" : "text-white/65 hover:bg-white/10 hover:text-white"}`}
              >
                <span className={active ? "text-amber-400" : "text-white/50"}><Icon d={d} /></span>
                <span className="min-w-0 break-words">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-white/10 px-3 py-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium text-white/70 hover:bg-red-500/10 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            Log Out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close staff navigation"
          onClick={closeMenu}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 sm:gap-3 sm:px-6">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-controls="staff-sidebar"
            aria-expanded={sidebarOpen}
            aria-label="Open staff menu"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 lg:hidden"
          >
            <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-gray-900 sm:text-base">{current?.[1] || "Staff Portal"}</h1>
            <p className="hidden text-xs text-gray-500 sm:block">Pose and Pics Photography Studio</p>
          </div>
          <NotificationBell role="staff" />
          <div className="flex min-w-0 shrink-0 items-center gap-2 border-l border-gray-100 pl-2 sm:pl-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">{initials}</div>
            <span className="hidden max-w-28 truncate text-xs font-medium text-gray-700 md:inline">{user.name}</span>
          </div>
        </header>

        <main id="staff-main-content" tabIndex={-1} className="portal-canvas min-w-0 flex-1 overflow-x-hidden p-3 sm:p-5 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
