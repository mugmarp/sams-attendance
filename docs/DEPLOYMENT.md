# Deployment and operation — JavaScript branch

## One server locally

Node.js 22, PostgreSQL 15+ and the backend dependencies are sufficient. Express serves both HTML/CSS/JavaScript and `/api` on port 3000. Run from backend so `.env` is loaded: `npm ci`, `npm run prisma:generate`, `npm run prisma:deploy`, optionally `npm run seed`, then `npm start`. `npm run dev` uses Node's watch mode. Frontend npm installation is only needed for browser tests, not for serving pages.

## Compose

Copy root `.env.example` to `.env`, replace all placeholders with separate URL-safe random values (`openssl rand -hex 32`), then `docker compose up --build -d`. The build context is the repository root; `backend/Dockerfile` copies the plain frontend and JavaScript backend into one application image. PostgreSQL must be healthy and the one-shot migration service successful before the app starts.

Open localhost:5173 by default. FRONTEND_PORT/DB_PORT can change the loopback host ports. The application container listens on 3000, and PostgreSQL on 5432 internally. There is no separate frontend/nginx/Redis service.

For disposable demonstration data only: `docker compose exec -e ALLOW_DEMO_SEED=true backend npm run seed`. Production mode otherwise refuses demo seeding. Health: `curl -f http://localhost:5173/api/health`. Logs: `docker compose logs backend migrate`. `docker compose down` retains the named database volume; do not remove that volume when records must be preserved.

## Real hosting considerations

A running local/Compose PostgreSQL instance is a live database, not a mock. A native public pilot is now hosted at https://sams.tirallab.page; this is not an institutionally approved deployment. See SERVER_READINESS.md for measured checks and adoption limits. For remote hosting, put an HTTPS reverse proxy in front of the loopback application port, set FRONTEND_URL to the exact origin, and set TRUST_PROXY=1 only for one trusted proxy hop. Direct access keeps TRUST_PROXY=0. Do not expose PostgreSQL publicly. Same-origin fetch calls need no browser localhost API URL.

Keep environment secrets outside Git. Plan backups and restore drills, monitoring, approved retention, institutional identity/account recovery and token revocation before real use. Operator-created accounts use an initial password; this prototype does not provide self-service recovery.

## Schema/data

Apply committed migrations with `npm run prisma:deploy`. The additive threshold migration preserves existing offerings with an 80% demonstration default. Confirm actual policy and select an appropriate threshold on newly created offerings. No migration resets existing attendance. Adoption of a database with the abandoned Hermes schema needs a separately reviewed migration, never a destructive reset.

The import CLI is documented in IMPORT_GUIDE.md. It preserves existing passwords/records and rejects identity/date/policy conflicts transactionally. Course completion/cancellation are explicit lecturer decisions and cannot be reversed through the prototype UI; corrections on completed classes retain history.

## Offline

HTTPS or localhost and a prior online visit/sign-in are required. Static files are cached by `sw.js`; `/api` is never cached there. User-specific snapshots, attempts, prepared rosters and operations remain on the device until site data is cleared. On a major update, close existing app tabs and reopen so the new service worker activates. Phase 1 added leases in IndexedDB version 2. Phase 2 upgrades additively to version 3 with registers/operations and shell cache v4, retaining older pending data. Close old tabs if a storage upgrade is blocked; do not clear site data containing pending work. The earlier JavaScript migration used a new app/IndexedDB cache namespace; it does not automatically submit an older prototype's queued attempts. Reconcile any real pending attempts before changing clients; current migration/demo data is synthetic.

Executed checks and hosted Compose results are recorded in VALIDATION.md. Docker is unavailable on the local workstation, so packaged startup is verified on the hosted CI runner.


The Phase 2 database migration adds defaulted versions/isActive and preparation, receipt and claim tables without resetting attendance. Apply it before restarting the new application; take the normal database backup first for an operational database. Old clients can still use existing endpoints, but close/reopen tabs to use the prepared-register workflow. Disabling an account in the database blocks protected requests; no administrator account-lifecycle UI or recovery workflow is provided yet. See OFFLINE_REGISTER.md for limits and restart/replay verification.

## Timetable phase deployment

Apply additive migrations `202611110004_timetable_and_records` and `202611110005_timetable_keys` after taking a recovery snapshot. Do not reset or seed the operational database. Node 22+ is required; `undici` supplies a per-request EnvHttpProxyAgent only when HTTP(S)_PROXY configuration is present. Without proxy configuration normal fetch is used. No proxy secrets belong in Git.

The application image includes `data/timetable_export.json`, `data/timetable_metadata.json` and `data/academic_calendar_reference.json`; it does not bundle the student CSV for public use. Keep these alongside the backend when deploying outside Docker. Source retrieval is bounded and failed refreshes retain previous publications. Repository checks run every 30 minutes only for activated providers and never publish class changes automatically. Outbound anonymous GitHub limits still apply.

Shell cache v5 adds the timetable page/module and retains IndexedDB v3. Updates do not reset pending work. Actual teaching dates/exceptions and source mappings must be reviewed before applying future classes. The official calendar reference alone is not institutional teaching approval.

## Preferred small-VPS deployment

For the supplied 897 MiB host, use the [native systemd/PostgreSQL/Nginx procedure](NATIVE_DEPLOYMENT.md). Docker is optional and remains useful for CI. The application supports HOST=127.0.0.1 for private native binding while retaining 0.0.0.0 as its container-compatible default.
