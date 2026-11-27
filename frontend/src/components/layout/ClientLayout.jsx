import WorkspaceLayout from "./WorkspaceLayout";
const items = [
  ["/client/dashboard", "Dashboard", "M3 12l2-2 7-7 7 7M5 10v10h4v-6h6v6h4V10"],
  ["/client/posts", "Studio Posts", "M4 16l4-4a3 3 0 014 0l4 4m-2-2 1-1a3 3 0 014 0l1 1M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"],
  ["/client/book", "Book a Session", "M12 4v16m8-8H4"],
  ["/client/bookings", "My Bookings", "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"],
  ["/client/payments", "My Payments", "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"],
  ["/client/feedback", "Feedback", "M11.049 2.927l1.519 4.674h4.915l-3.976 2.888 1.519 4.674L12 12.275 8.974 15.163l1.519-4.674L6.517 7.601h4.915l1.519-4.674z"],
];


const nav=items.map(([path,label,d])=>({path,label,d}));
export default function ClientLayout(){return <WorkspaceLayout role="client" groups={[{label:"YOUR STUDIO",items:nav.slice(0,2)},{label:"BOOKINGS",items:nav.slice(2,5)},{label:"SUPPORT",items:nav.slice(5)}]}/>;}
