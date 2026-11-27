# Regression checklist (run on your own XAMPP instance)

- [ ] Backend `/health` and Vite open, no crashes in either terminal.
- [ ] Login as Admin, Staff and Client; unauthorized roles cannot open protected data.
- [ ] Client registration and login work; no Brevo verification is expected.
- [ ] Admin package editing and scheduling changes appear to Client.
- [ ] Client booking saves to XAMPP MySQL and appears in Admin/Staff schedules.
- [ ] Client payment proof upload succeeds; Admin sees the image and can verify it.
- [ ] Client sees booking QR; Admin or Staff verifies and starts the session.
- [ ] Duplicate QR scans do not start a second session.
- [ ] Photo session completion, staff assignment, editing and delivery status display correctly.
- [ ] Client feedback with all five visible ratings submits; Admin and Staff views load.
- [ ] Notifications, posts, analytics and reports work without `429` loops.
- [ ] Client can open site on another device using the Wi-Fi IP; API requests load through Vite proxy.
- [ ] Browser camera QR scanning is tested in a secure context (HTTPS/localhost) if needed.

**Before testing payment proofs:** Back up the database and private uploads. Do not use real payment information during demos if avoidable.
