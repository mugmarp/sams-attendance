# Deployment and operation — JavaScript branch

## One server locally

Node.js 22, PostgreSQL 15+ and the backend dependencies are sufficient. Express serves both HTML/CSS/JavaScript and `/api` on port 3000. Run from backend so `.env` is loaded: `npm ci`, `npm run prisma:generate`, `npm run prisma:deploy`, optionally `npm run seed`, then `npm start`. `npm run dev` uses Node's watch mode. Frontend npm installation is only needed for browser tests, not for serving pages.

## Compose

Copy root `.env.example` to `.env`, replace all placeholders with separate URL-safe random values (`openssl rand -hex 32`), then `docker compose up --build -d`. The build context is the repository root; `backend/Dockerfile` copies the plain frontend and JavaScript backend into one application image. PostgreSQL must be healthy and the one-shot migration service successful before the app starts.

Open localhost:5173 by default. FRONTEND_PORT/DB_PORT can change the loopback host ports. The application container listens on 3000, and PostgreSQL on 5432 internally. There is no separate frontend/nginx/Redis service.

For disposable demonstration data only: `docker compose exec -e ALLOW_DEMO_SEED=true backend npm run seed`. Production mode otherwise refuses demo seeding. Health: `curl -f http://localhost:5173/api/health`. Logs: `docker compose logs backend migrate`. `docker compose down` retains the named database volume; do not remove that volume when records must be preserved.

## Real hosting considerations

A running local/Compose PostgreSQL instance is a live database, not a mock. This repository does not claim that a public persistent university deployment exists. For remote hosting, put an HTTPS reverse proxy in front of the loopback application port, set FRONTEND_URL to the exact origin, and set TRUST_PROXY=1 only for one trusted proxy hop. Direct access keeps TRUST_PROXY=0. Do not expose PostgreSQL publicly. Same-origin fetch calls need no browser localhost API URL.

Keep environment secrets outside Git. Plan backups and restore drills, monitoring, approved retention, institutional identity/account recovery and token revocation before real use. Operator-created accounts use an initial password; this prototype does not provide self-service recovery.

## Schema/data

Apply committed migrations with `npm run prisma:deploy`. The additive threshold migration preserves existing offerings with an 80% demonstration default. Confirm actual policy and select an appropriate threshold on newly created offerings. No migration resets existing attendance. Adoption of a database with the abandoned Hermes schema needs a separately reviewed migration, never a destructive reset.

The import CLI is documented in IMPORT_GUIDE.md. It preserves existing passwords/records and rejects identity/date/policy conflicts transactionally. Course completion/cancellation are explicit lecturer decisions and cannot be reversed through the prototype UI; corrections on completed classes retain history.

## Offline

HTTPS or localhost and a prior online visit/sign-in are required. Static files are cached by `sw.js`; `/api` is never cached there. User-specific snapshots/attempts remain on the device until site data is cleared. On a major update, close existing app tabs and reopen so the new service worker activates. The JavaScript migration uses a new app/IndexedDB cache namespace; it does not automatically submit an older prototype's queued attempts. Reconcile any real pending attempts before changing clients; current migration/demo data is synthetic.

Executed checks and hosted Compose results are recorded in VALIDATION.md. Docker is unavailable on the local workstation, so packaged startup is verified on the hosted CI runner.
