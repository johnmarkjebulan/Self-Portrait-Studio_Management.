# Final verification and network cleanup

## Local startup

1. Keep a backup of the previous working project and XAMPP database. Extract this ZIP to a new folder.
2. Copy the original `backend/.env`, `backend/uploads/` and `frontend/certs/` to the corresponding locations. These private files are deliberately not included. Existing data stays in XAMPP; this archive does not contain customer records.
3. Start MySQL in XAMPP and stop only the old Pose & Pics frontend/backend terminals.
4. Run `./START-POSE-AND-PICS.cmd` in PowerShell (or double click the launcher).
5. Open the Vite Local URL on the laptop or its single Wi-Fi Network URL on a phone. When certificates are present, both are HTTPS. If the Wi-Fi address changes, regenerate the certificate for the new IP; trust the original mkcert CA on each device. No active Wi-Fi means local-only. Other interfaces are not advertised and incoming connections on their addresses are rejected by the development server. Do not expose the dev server to public networks. If an old POSE_VITE_HOST override is set, remove it with `Remove-Item Env:POSE_VITE_HOST -ErrorAction SilentlyContinue` before startup. An explicit private IPv4 override remains supported.

## Verify on Windows

From the project root, run `npm install --include=dev` if the launcher has not yet installed dependencies. Then run `npm run test:backend` and `npm run build`. To check live APIs and the frontend, leave both dev servers running. If using mkcert HTTPS, open another PowerShell terminal and run:

```powershell
$env:NODE_EXTRA_CA_CERTS = Join-Path (mkcert -CAROOT) 'rootCA.pem'
npm run smoke:live
```

If the backend uses a different port, the smoke test reads backend/.env automatically. For production, set SMOKE_API_URL and SMOKE_FRONTEND_URL to your actual site URL. Do not disable TLS certificate checks. Test a real QR using a confirmed appointment scheduled for today's Philippine date, with the required payment verified. See TEST_CHECKLIST.md for the complete manual checklist.

## GitHub checks (no deployment)

Push this project to your repository. In Actions, select **Verify Pose and Pics** and click **Run workflow**. It also runs on pushes to main and pull requests. It installs clean Linux dependencies, runs backend tests and production build, creates an isolated disposable MySQL schema, seeds test accounts, initializes again, starts production Express, checks API/SPA routes, and runs a Chromium browser smoke suite at desktop and phone viewport widths (with a simulated camera). No production secrets, live customer records or hosting charges are required for this workflow; standard GitHub Actions usage limits may apply. It is separate from **Deploy Pose and Pics**. A green run is evidence of those CI checks, not proof of physical camera access or successful cloud deployment.

## Verified in this revision environment

- 39/39 automated tests passed, including new Wi-Fi URL and adapter filtering tests and queue date guard checks.
- 129 JavaScript/JSX/TypeScript source files parsed without syntax errors before packaging.
- GitHub workflow and Render YAML parsed successfully.
- Production build attempted but blocked by missing Linux native dependencies; registry DNS unavailable here. Clean install on the target OS or GitHub runner is necessary; do not copy node_modules between OSes.
- No running XAMPP/MySQL instance, physical phone/camera, Brevo credentials, or configured cloud account available here. Live database, actual QR hardware scan, email delivery, production deployment and visual browser checks are not marked passed. The added CI workflow has not yet run.

## Operational changes

The Queue and Admin Bookings pages disable check-in for other dates, and Queue session-start controls are limited to today. HTTP 4xx business validation errors no longer dump full stacks in the development terminal. Backend validation remains in place. No existing database schema or private uploads were changed by this revision. Custom Analytics, Login-only Forgot Password, Book an Appointment, HTTPS QR code, and deployment files are retained.
