import WorkspaceLayout from "./WorkspaceLayout";
const ICONS = {
  dashboard: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  appointments: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  queue: "M4 6h16M4 10h16M4 14h8m-8 4h4",
  scanner: "M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 4h.01M5 8h.01M5 16h.01M4 20h4m4-16v.01",
  clients: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
  packages: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  schedules: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  payments: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  analytics: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  reports: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  notifications: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  feedback: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  logs: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  posts: "M4 16l4-4a3 3 0 014 0l4 4m-2-2l1-1a3 3 0 014 0l1 1M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  staff: "M17 20h5v-2a4 4 0 00-4-4h-1m-4 6H3v-2a4 4 0 014-4h2m4 6v-2a4 4 0 00-4-4m6-7a4 4 0 11-8 0 4 4 0 018 0zm7 2a3 3 0 10-6 0 3 3 0 006 0z",
  settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
};

const navGroups = [
  {
    items: [
      { path: "/admin/dashboard", label: "Dashboard", icon: "dashboard" },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      { path: "/admin/appointments", label: "Bookings", icon: "appointments" },
      { path: "/admin/queue", label: "Queue", icon: "queue" },
      { path: "/admin/scanner", label: "QR Scanner", icon: "scanner" },
      { path: "/admin/photo-sessions", label: "Photo Sessions", icon: "posts" },
      { path: "/admin/clients", label: "Clients", icon: "clients" },
    ],
  },
  {
    label: "STUDIO",
    items: [
      { path: "/admin/packages", label: "Packages", icon: "packages" },
      { path: "/admin/posts", label: "Posted Pictures", icon: "posts" },
      { path: "/admin/schedules", label: "Studio Calendar", icon: "schedules" },
    ],
  },
  {
    label: "FINANCE",
    items: [
      { path: "/admin/payments", label: "Payments", icon: "payments" },
      { path: "/admin/analytics", label: "Analytics", icon: "analytics" },
      { path: "/admin/reports", label: "Reports", icon: "reports" },
    ],
  },
  {
    label: "MONITORING",
    items: [
      { path: "/admin/feedback", label: "Feedback", icon: "feedback" },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { path: "/admin/staff", label: "Staff Accounts", icon: "staff" },
    ],
  },
];


export default function AdminLayout(){return <WorkspaceLayout role="admin" groups={navGroups.map(g=>({...g,items:g.items.map(i=>({...i,d:ICONS[i.icon]}))}))}/>;}
