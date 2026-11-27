import WorkspaceLayout from "./WorkspaceLayout";
const items = [
  ["/staff/dashboard", "Dashboard", "M3 12l2-2 7-7 7 7M5 10v10h4v-6h6v6h4V10"],
  ["/staff/appointments", "Bookings", "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"],
  ["/staff/queue", "Live Queue", "M4 6h16M4 12h16M4 18h16"],
  ["/staff/scanner", "Scan Booking QR", "M4 4h5M4 4v5m16-5h-5m5 0v5M4 20h5m-5 0v-5m16 5h-5m5 0v-5M9 9h6v6H9z"],
  ["/staff/photo-sessions", "Photo Sessions", "M4 4h16v16H4z M8 8h8v8H8z"],
  ["/staff/clients", "Clients", "M12 4a4 4 0 110 8 4 4 0 010-8zm-7 17a7 7 0 0114 0"],
  ["/staff/posts", "Studio Posts", "M4 16l4-4a3 3 0 014 0l4 4m-2-2 1-1a3 3 0 014 0l1 1M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"],
  ["/staff/feedback", "Feedback", "M11.049 2.927l1.519 4.674h4.915l-3.976 2.888 1.519 4.674L12 12.275 8.974 15.163l1.519-4.674L6.517 7.601h4.915l1.519-4.674z"],
];


const nav=items.map(([path,label,d])=>({path,label,d}));
export default function StaffLayout(){return <WorkspaceLayout role="staff" groups={[{label:"DAILY OPERATIONS",items:nav.slice(0,5)},{label:"STUDIO & CLIENTS",items:nav.slice(5)}]}/>;}
