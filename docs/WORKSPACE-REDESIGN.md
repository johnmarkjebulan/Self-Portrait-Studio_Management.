# Full-width workspace update

## Changes
- Shared role-aware layout, viewport-height shell, responsive drawer, persistent collapsible menu, optional browser fullscreen, account menu with logout, Manila date/time and notifications.
- Role-specific welcome banners and actions; warm terracotta for admin/client, muted sage for staff. Reduced-motion support.
- Full-width page roots; preserved sensible widths for dialogs and inputs.
- Admin/staff booking overview uses identical grouped filters, exact statuses, counts, date, search and ordering. Admin dashboard status deep links now select the requested filter. Client cards and detail page include declined bookings, use chronological ordering, and open the exact booking selected.
- Countdown uses the existing server-provided service start/end timestamps. It is visual only and never changes status when the timer reaches zero. Existing manual start/complete rules are preserved.
- Existing routes, backend logic and database schema unchanged. Existing booking lists refresh every 20 seconds when visible; admin dashboard and queue now refresh too.

## Apply safely
1. Back up original project and MySQL database. Stop old frontend/backend terminals.
2. Extract this ZIP. Copy the original `backend/.env` and `backend/uploads/` into the extracted project. The original official payment QR is in the private uploads folder. Do not reset MySQL or create a new database for an existing installation.
3. Start XAMPP MySQL, then `npm install --include=dev` at the root.
4. Run `npm run dev:backend` and `npm run dev:frontend` in separate terminals (or use `START-POSE-AND-PICS.cmd`).
5. Open the URL printed by Vite.

## Verification performed
- Existing and added backend/booking presentation tests: 26 passed.
- JavaScript/JSX syntax parser: 55 files parsed, zero syntax errors.
- Vite production build could not complete in the Linux test environment: the provided node_modules contains Windows native Rolldown bindings, not Linux bindings. Install dependencies locally and run `npm run build`.
- Live XAMPP and browser workflow tests were not performed. Verify role sign-in, menu collapse/mobile navigation, profile logout, filters, booking requests, QR scan, payment, live countdown and photo release using local test accounts before deploying.
