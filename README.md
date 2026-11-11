# SAMS — Student Attendance Management System

Group B · SWE2106 Internet Technologies and Web Design · E-tivity 5

**Registrar process:** class attendance. **Application source:** JavaScript, HTML and CSS.

SAMS replaces a paper class register with lecturer-controlled code check-in. An administrator provisions accounts/course offerings/enrollments; a lecturer creates a dated class and opens check-in; enrolled students enter its short-lived code. Authorized staff review attendance and correction history, and students see their own summaries.

This branch follows the assignment and the useful parts of the two original proposals. It uses **plain HTML pages, authored CSS and browser JavaScript**, served by a **JavaScript Express server** connected to **PostgreSQL**. There is no TypeScript compilation, React, JSX, Vite or Tailwind application. Prisma's JavaScript client is retained for database transactions and migrations.

[Current proposal](docs/PROPOSAL.md) · [Proposal decisions](docs/PROPOSAL_ALIGNMENT.md) · [API reference](docs/API_SPEC.md) · [Postman demonstration](docs/POSTMAN_DEMO.md) · [Verification](docs/VALIDATION.md)

![SAMS architecture](docs/architecture.svg)

## Start locally

Requirements: Node.js 22 and a running PostgreSQL 15+ database. Create a database/user first, then from the repository root:

```bash
npm ci --prefix backend
cp backend/.env.example backend/.env
# Edit DATABASE_URL and set two different random JWT secrets of at least 32 characters.
# Generate each secret with: openssl rand -hex 32
cd backend
npm run prisma:generate
npm run prisma:deploy
npm run seed
npm start
```

Open [http://localhost:3000](http://localhost:3000). One Express server serves the pages and `/api`; no frontend build or separate frontend server is required. `npm run dev` uses Node's watch mode while developing.

The backend reads `backend/.env` when started from that directory or with `npm start --prefix backend`. Keep secrets out of Git. Frontend JavaScript calls same-origin `/api` with fetch().

## Demo accounts

These synthetic accounts exist after seeding; they do not belong to the university.

| Role | Email | Password |
|---|---|---|
| Lecturer / EXAMINER | examiner@demo.sams.test | SamsDemo2026! |
| Student | student@demo.sams.test | SamsDemo2026! |
| Registrar / ADMIN | admin@demo.sams.test | SamsDemo2026! |

Additional students: student2 through student5 at demo.sams.test, with the same password. Seeded data includes two courses, five historical completed classes each, a current class and a next-day class. Repeated seeding preserves existing data. It does not reset completed same-day classes. For another live demonstration, create a new class through the lecturer form; no database reset is necessary.

## Demonstrate the core workflow

1. Sign in as the administrator. Create student/lecturer accounts if needed, create a course offering, choose its attendance threshold and enroll students.
2. Sign in as the lecturer. Choose or create a class with Kampala start/end times and venue. Open the class and click **Start check-in**.
3. In a separate browser profile, sign in as an enrolled student, select the class and submit its displayed code.
4. Watch the lecturer's roster refresh. Make a reasoned correction if needed. Complete the class to include it in attendance calculations, or cancel an unheld class to exclude it.
5. Open the lecturer's own course report, or sign in as the registrar and select a course. Filter below-threshold students and download the prototype PDF.
6. In Postman, run the supplied collection to demonstrate both successful and invalid requests. See [the presentation runbook](docs/POSTMAN_DEMO.md).

## Rules and boundaries

- Course offerings are separate by code, academic year and semester. Only completed classes count; future/scheduled and cancelled classes do not reduce attendance.
- PRESENT and LATE count as attended; ABSENT, EXCUSED and missing records do not. Zero completed classes means **not assessed**.
- Each offering has a configured threshold. The default 80% and the original proposal's 75% are demonstration choices pending policy confirmation. Exact counts determine qualification before display rounding.
- The output means **attendance requirement met**, not final examination clearance. The application does not assess fees/coursework and does not claim an official Appendix D format.
- Check-in requires enrollment and a class in progress. A ten-minute window is capped at class end; its current code changes every two minutes. Old/closed codes cannot create attendance.
- Safe check-in retries return the same record. Duplicate account/offering/enrollment creation returns 409. Lecturer corrections retain actor, previous/new status, reason and timestamp.
- A shared code cannot prove physical presence. Lecturer oversight remains necessary.

## Offline behavior

A prior online visit/sign-in on HTTPS or localhost caches the plain app shell. User-scoped student snapshots last 24 hours. Pending attempts are stored in IndexedDB and sent when reconnecting with the app open or by pressing **Send pending attempts**. Pending does not mean present. An expired/closed code becomes failed and requires lecturer review; client clocks cannot backdate attendance. Five network failures stop automatic retry. First-time offline login is not supported. Clear site data on shared devices because local snapshots/attempts remain on that browser.

## Postman and tests

Import both files in `postman/`. The collection has descriptions, sample responses, automatically captured variables and assertions for positive/negative cases. Use a disposable database: a full run creates synthetic records. Run without the GUI:

```bash
npx --yes newman@6.2.3 run postman/SAMS.postman_collection.json \
  --env-var baseUrl=http://localhost:3000/api --bail
```

Application checks:

```bash
npm run check --prefix backend
npm ci --prefix frontend        # Browser-test dependency only; not needed to serve pages.
npm run check --prefix frontend
# API tests clear the isolated database named sams_test. Never use real records.
cd backend
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sams_test npm run prisma:deploy
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sams_test npm test
```

Browser tests and hosted deployment checks are described in [VALIDATION.md](docs/VALIDATION.md). `build`/`lint` are compatibility aliases for JavaScript syntax checks; they do not compile the application. Runtime validation and tests remain essential.

## Deployment and data import

For Compose, copy root `.env.example` to `.env`, replace the secrets, then run `docker compose up --build -d`. Open localhost:5173 by default. The migration service runs before the application. On a disposable demo deployment only, run `docker compose exec -e ALLOW_DEMO_SEED=true backend npm run seed`.

The validated local JSON importer is available with `IMPORT_INITIAL_PASSWORD=... npm run import -- /private/path/dataset.json` from backend. See [IMPORT_GUIDE.md](docs/IMPORT_GUIDE.md). The original weekly timetable/CSV files remain reference material and are not silently loaded as dated semester records.

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for HTTPS, proxy settings, backup and operational limits. Public hosting, institutional approval, SSO, account recovery/revocation, fee/coursework integration, HoD excuse approval and bulk marking are not claimed. Individual-member contribution work is excluded from this task as requested.
