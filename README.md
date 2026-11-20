# Travelease v2 — local full-stack prototype

This version keeps the original Travelease interface and adds an Express API with a persistent SQLite database.

## Included
- Account registration and login; passwords are hashed with bcrypt.
- SQLite tables for users, destinations, bookings, and sessions.
- Booking requests saved to the database and linked to the signed-in traveler.
- Traveler booking history.
- Accessibility preferences saved to the account.
- Admin summary and booking approval/decline endpoints.
- Basic rate limits on authentication and booking requests.

## Run locally

1. Install Node.js 20 or newer.
2. Extract this folder.
3. Open a terminal in the `travelease-v2` folder.
4. Run `npm install`.
5. Copy `.env.example` to `.env` and change `SESSION_SECRET` to a long random value.
6. To enable the admin dashboard, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` before the first run. The first startup creates that admin account if the email is not already registered. Do not use the example password.
7. Run `npm start`.
8. Open `http://localhost:3000`.

The SQLite database and session database are created automatically in `data/`.

## API overview
- `GET /api/health`
- `GET /api/destinations`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me` and `PATCH /api/me`
- `POST /api/bookings`
- `GET /api/bookings/mine`
- `GET /api/admin/summary`
- `GET /api/admin/bookings`
- `PATCH /api/admin/bookings/:id`

## Important limitations
This is a development prototype, not a production-ready travel marketplace. It does not connect to real hotel inventory, payment gateways, email/SMS notifications, or government PWD verification. Booking status changes are managed manually by an administrator. No PWD ID number or image is collected; providers must verify eligibility through an appropriate secure process. The sample destinations and access scores are illustrative and must be validated with the actual establishments.

Before public deployment, configure HTTPS, a strong secret, secure hosting, backups, production logging/monitoring, stronger account recovery and abuse controls, privacy notices and consent, and a reviewed PWD verification workflow. The included session store is SQLite-backed for the prototype; production deployment should also review session rotation, expiration, and operational security.


## Deploy on Render (SQLite with persistent storage)

This project uses SQLite, so deploy it as a **Render Web Service**, not a static site.

1. Upload this project folder to a GitHub repository. Keep `package.json`, `server.js`, and `public/` at the repository root (the contents of this `travelease-v2` folder).
2. In Render, choose **New → Web Service** and connect the repository.
3. Set **Build Command** to `npm install` and **Start Command** to `npm start`. Use Node 20 or newer.
4. Add a persistent disk with mount path `/var/data` (a small disk is sufficient for this prototype).
5. Add environment variables: `NODE_ENV=production`, `DATA_DIR=/var/data`, and `SESSION_SECRET` set to a long random secret. Optionally set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME` before the first deploy to create the first admin account.
6. Deploy and test `/api/health` on your Render URL.

**Storage and cost note:** Render's free web services have an ephemeral filesystem and cannot attach persistent disks. SQLite user accounts and bookings could be lost after a restart/redeploy on the free tier. Persistent disks require a paid web service. Check Render's current pricing before proceeding.

**Prototype warning:** This is not yet a production-ready booking marketplace. It does not process payments or connect to live accommodation inventory. Validate accessibility information and review privacy, security, PWD verification, backups, and operational processes before accepting real customers.
