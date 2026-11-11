# Deployment and operations

## Local Compose deployment

Copy root `.env.example` to `.env`, replace every placeholder with separate random values (`openssl rand -hex 32`), then run `docker compose up --build -d`. The migration job must succeed before the backend starts. The frontend listens on localhost:5173; PostgreSQL is available on localhost:5432 for local tools. The API is internal to the Compose network. Compose does not create demo users automatically.

For a disposable classroom demonstration: `docker compose exec -e ALLOW_DEMO_SEED=true backend npm run seed`. The production seed guard deliberately requires this opt-in. Never use demo credentials for real student records.

Check health with `curl -f http://localhost:5173/api/health`. Inspect logs with `docker compose logs backend migrate`. Shut down with `docker compose down`; the named database volume persists. Do not use `down -v` against records that need to be retained.

## Remote hosting

Place an HTTPS reverse proxy in front of the loopback-bound frontend and set FRONTEND_URL to its exact public origin. The static app uses same-origin `/api`, so no browser localhost API URL is embedded. Do not publish PostgreSQL or the API directly. Configure trusted proxy topology deliberately: Express trusts the single supplied nginx hop. Keep backups before applying schema updates and test restoration. Hosting is not automatically performed by this repository.

The runtime backend image contains Prisma/tsx tooling to support migration, seeding and local imports. It runs as the unprivileged node user. A separately minimized production image is an optional later optimization.

## Database updates

Commit migrations to Git. Generate new migrations in a development database with `npm run prisma:migrate -- --name description` from backend; deploy with `npm run prisma:deploy`. The initial migration is for a new database. An existing database with the abandoned Hermes schema requires a separately reviewed data migration; never run a destructive reset on it.

## Imports and accounts

See IMPORT_GUIDE.md. The operator provisions users and distributes initial passwords securely. Password recovery, account lifecycle management and token revocation need an institutional solution before real deployment. Attendance reports cannot establish fee/coursework clearance.

## Offline and caching

Offline mode requires HTTPS or localhost and a prior online visit/sign-in. After a new release, close existing app tabs and reopen to activate the new service worker. Never cache `/api` at an external proxy. On shared computers clear the site's local data after use, because user-scoped snapshots/attempts are retained on the device.

## Verification boundary

See VALIDATION.md for executed checks. Container definitions are included and CI builds them; if Docker is unavailable locally, no local container-runtime result is claimed. Institutional approval, official report layout, records-retention policy and a production security review are outside the classroom prototype.
