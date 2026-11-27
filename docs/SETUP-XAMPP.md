# Set up or continue a Windows XAMPP installation

## Existing installation: keep your accounts and booking history

1. Back up the **pose_and_pics** database through phpMyAdmin → Export.
2. Separately copy the `backend/uploads/` directory from your local old project. It may contain personal payment receipts and must be protected.
3. Copy your old, working `backend/.env` to the `backend/` folder of this new source checkout. **Do not replace an already valid JWT_SECRET** when moving folders: previously issued sessions may otherwise be invalidated.
4. Start XAMPP MySQL. Install dependencies from the new project root with `npm install --include=dev`.
5. Run `npm run db:check --workspace=backend`. Do **not** re-seed an established database. For structural migrations, use a separate verified migration and database backup.
6. Open two terminals from the root and run `npm run dev:backend` and `npm run dev:frontend`.

## Fresh local MySQL installation

1. In XAMPP Control Panel, start **MySQL** and optionally **Apache** for phpMyAdmin.
2. In phpMyAdmin, run `database/create_database.sql` or create a `pose_and_pics` UTF-8 database yourself.
3. Copy `backend/.env.example` to `backend/.env` and set the MySQL credentials (default local XAMPP `root` / empty password) and a private random `JWT_SECRET` at least 32 characters long.
4. From the root, `npm install --include=dev`, `npm run db:check --workspace=backend`, then `npm run db:init --workspace=backend`.
5. If you need an initial admin user, run `npm run admin:create --workspace=backend`; to seed initial studio content, run `npm run db:seed --workspace=backend` after creating the admin. Never seed over an important existing installation without checking what the script does.
6. Start the two servers and use the URL printed by Vite.

## Ports and network

- XAMPP MySQL: `3306` (or configured DB_PORT)
- Backend Express API: `127.0.0.1:5000` (private to the development PC)
- Vite: `5173` bound to active Wi-Fi IP when available; falls back to `127.0.0.1` otherwise.
- Other devices on the **same Wi-Fi** use the computer's Vite Wi-Fi URL. Allow access to port `5173` on Windows private-network firewall if needed. Do not expose MySQL to the internet.
- Mobile QR camera features generally require HTTPS. A manual code check-in is an alternative while testing on plain HTTP.

### Common problems

| Message | Fix |
|---|---|
| `Missing/placeholder JWT_SECRET` | Copy the `.env.example` and set a private 32+ char value in `backend/.env` |
| `Port 5000 already in use` | Stop the **old** backend or use it if it is the same project; do not start a duplicate |
| `Port 5173 already in use` | Stop the old Vite server before starting a new one |
| `nodemon is not recognized` | Run `npm install --include=dev` from the root |
| `DB connection failed` | Start XAMPP MySQL, confirm host, port, user and password in `.env` |
| `429 Too Many Requests` | Ensure the latest backend is running and avoid unnecessary polling. Check network requests and auth limiter; don't turn off login protection in production |

## Local test commands

```powershell
npm run test:backend
npm run build
npm run smoke:live
```

**Note:** A successful source test doesn't prove that real bookings, file uploads, database migrations, and multi-device access work with your local data. Test them in the browser against the running backend.
