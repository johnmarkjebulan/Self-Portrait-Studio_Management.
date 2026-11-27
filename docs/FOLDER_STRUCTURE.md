# Project folder map

```text
Pose-and-Pics-Organized-Project/
├── backend/
│   ├── .env.example            # Safe template; copy to .env
│   ├── package.json
│   ├── scripts/                # DB setup, admin creation and seeding
│   ├── src/
│   │   ├── config/             # Sequelize/MySQL connection
│   │   ├── middleware/         # Authentication and authorization
│   │   ├── models/             # Database schema definitions
│   │   ├── routes/
│   │   │   ├── index.js        # Keeps public /api URL prefixes
│   │   │   ├── identity/       # Auth and users
│   │   │   ├── bookings/       # Booking, schedules, availability, photo sessions
│   │   │   ├── billing/        # Payments and proof uploads
│   │   │   ├── studio/         # Packages and studio settings
│   │   │   ├── engagement/     # Posts, feedback, notifications
│   │   │   └── insights/       # Analytics, activity logs, public statistics
│   │   ├── services/          # Appointment lifecycle
│   │   ├── utils/             # Reusable helpers and validation
│   │   └── server.js          # Express API entrypoint
│   ├── tests/                  # API and business-rule tests
│   └── uploads/                # Runtime payment proofs; NOT inside source ZIP
├── frontend/
│   ├── public/studio-media/    # Studio images, package and post assets
│   ├── src/
│   │   ├── components/common/  # Shared UI
│   │   ├── components/layout/  # Admin/Staff/Client/Public layouts
│   │   ├── contexts/          # Auth and Toast providers
│   │   ├── pages/
│   │   │   ├── admin/          # Admin UI — John Mark (frontend)
│   │   │   ├── staff/          # Staff UI — Edrian (frontend)
│   │   │   ├── client/         # Client UI — Ryan Joy (frontend)
│   │   │   └── public/         # Public-facing UI — Ryan Joy (frontend)
│   │   ├── services/          # API HTTP client
│   │   ├── styles/            # Global CSS
│   │   ├── utils/             # UI helpers
│   │   ├── App.jsx            # Role-based frontend routing
│   │   └── main.jsx
│   ├── vite.config.js         # Wi-Fi host and /api proxy
│   └── package.json
├── database/create_database.sql
├── docs/                     # Architecture and setup guides
├── scripts/                  # Windows local tooling
├── START-POSE-AND-PICS.cmd
├── package.json              # npm workspaces and scripts
├── package-lock.json
└── README.md
```

## Why the backend is grouped by function rather than user role

Many API routes serve more than one role. A payment route, for example, can receive a Client payment proof and let Admin verify it, subject to authorization. The route implementation belongs to **billing**, not a duplicated client/admin backend. Role-specific UI modules remain separate under `frontend/src/pages`.

### WBS mapping

- **John Mark:** Admin frontend pages and shared UI required by those pages; no backend responsibility assigned.
- **Edrian:** Staff frontend pages and shared UI required by those pages; no backend responsibility assigned.
- **Ryan Joy:** Client/Public frontend pages, plus the client-related API/backend deliverables assigned in the approved WBS. Shared route files remain grouped by domain for maintainability; directory location alone does not change WBS ownership.

## Changes from the uploaded ZIP

- Reorganized 15 backend API route modules into six functional folders and updated relative imports plus their registrations in `routes/index.js`.
- Kept all React page paths and the `/api` endpoints unchanged.
- Removed cached `node_modules` and build data from the distributed ZIP (restore with `npm install`).
- Excluded uploaded client receipts and private `.env` (copy them privately from your current installation; do not commit them).
- Added a safe `.env.example`, a Windows launcher, and documentation.
