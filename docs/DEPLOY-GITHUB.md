# GitHub one-click deployment — Pose & Pics

## What is included

- `render.yaml`: a paid Render Node web service and private MySQL 8.4 service, each with a persistent disk, in Singapore. Check Render's actual pricing before provisioning. No hosting resource is created by this ZIP.
- `deploy/start-cloud.cjs`: waits for MySQL, creates missing tables, and serves the built React frontend and Express API from one HTTPS origin.
- `.github/workflows/deploy.yml`: manual deployment of the repository's default branch. Runs tests and builds, invokes the private Render deploy hook for the tested commit, then verifies `/health` and the landing page. A successful run includes an Open Pose & Pics link and uses the GitHub `production` environment.
- Local XAMPP development and existing local HTTPS configuration remain separate and unchanged. Render supplies a public trusted HTTPS certificate, so phones/laptops do not need mkcert for the deployed website.

## Initial setup (once)

1. Extract the ZIP. Push the project root (containing `package.json`, `render.yaml`, `.github/`, `frontend/`, and `backend/`) to your GitHub repository. Keep the repository private if it contains studio-owned media or code. **Do not commit** `.env`, certificates, database dumps or customer payment proofs. The supplied `.gitignore` covers those files; it cannot remove secrets already tracked in an existing repository.
2. Open `README.md` on GitHub and click **Deploy to Render**, or visit https://dashboard.render.com/ and choose **New → Blueprint**, then connect the repository. Review the proposed web service, private service and two disks. This configuration is **paid**; approve only with the owner’s permission. Render manages the database password and JWT secret via generated environment variables.
3. Wait for both services to finish initializing. Open the HTTPS URL assigned to `pose-pics-studio` by Render. Do not assume the service name is the final hostname. `/health` should report status `ok`; if initial deployment fails, inspect the web and MySQL service logs, and redeploy when MySQL is ready. The database is initially empty; no local XAMPP customers or bookings are copied.
4. In the Render web service Shell, from the project root, run:
   ```sh
   npm run admin:create --workspace=backend
   npm run db:seed --workspace=backend
   ```
   Enter the owner's email and strong password in the shell, not in GitHub. Then log in and upload the studio's official payment QR from Settings. To enable password recovery, configure `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` (verified sender), and optionally `PASSWORD_RESET_BASE_URL` (the actual HTTPS site URL) in Render's Environment tab. Do not commit these secrets.
5. In the Render **web service** Settings, find the Deploy Hook and copy it. In GitHub go to **Settings → Secrets and variables → Actions → Secrets → New repository secret**. Name it `RENDER_DEPLOY_HOOK_URL` and paste the hook. Do not paste it into code or screenshots. Under **Variables**, create `POSE_SITE_URL` with your actual public HTTPS website URL (without `/api`). Ensure GitHub Actions is enabled and the `production` environment is permitted to deploy the default branch.

## Deploy updates from GitHub

1. Commit and push the changes to your default branch.
2. Open **Actions → Deploy Pose and Pics → Run workflow**, select the default branch and click the green **Run workflow** button.
3. Open the completed run. The workflow verifies the exact commit at the deployed `/health` endpoint and provides a clickable website link in the summary. GitHub's production environment also uses the URL supplied in `POSE_SITE_URL`.

A successful hook response alone does not prove deployment succeeded. If verification times out, review the Render logs and confirm the URL and deploy hook belong to the same service. The MySQL service does not need to redeploy for ordinary frontend/backend changes.

## Cloud data and migration

The cloud database is independent of XAMPP. For production data migration, create an encrypted/private backup, review schema migrations and user data permissions, then restore through a trusted private connection or approved cloud migration method. Do not expose MySQL publicly or place backups on GitHub. Restore private uploads separately into the persistent web disk and verify ownership and permissions. A new deployment does not synchronize with local XAMPP. Persistent disks are not a substitute for backups. The existing initialization script creates missing tables but does not change existing columns; future schema changes require explicit migrations. Existing QR codes signed with a different JWT secret may need reissuing after migration.

## Verification checklist

- HTTPS landing page, login, and browser refresh on nested routes.
- Client booking and staff/admin status updates; live queue, AM/PM timestamps and notifications.
- QR scan permission on laptop and phone using the deployed HTTPS address.
- Admin payment QR upload, private proof upload/retrieval, persistence across a redeploy.
- Password reset using a verified sender, and no leaked secrets in GitHub.
- Cloud MySQL backup/restore plan before using real customer data.

No actual Render account, GitHub repository, or billing was connected as part of packaging. Cloud provisioning, runtime, and browser tests must still be verified by the project owner.
