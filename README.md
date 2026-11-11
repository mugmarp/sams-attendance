# SAMS — Student Attendance Management System

Group B · SWE2106 · Mbarara University of Science and Technology

SAMS replaces a paper class register with lecturer-controlled code check-in. A lecturer opens a class, enrolled students enter its rotating code, and the registrar reviews attendance by course offering. It is an educational prototype, not an official MUST system or a final examination-clearance service.

## What works

- Student, examiner and administrator accounts with role/ownership checks.
- Kampala-date lecturer dashboard, ten-minute check-in windows and codes changing every two minutes.
- One attendance record per student/class, including safe retries and concurrent submissions.
- Lecturer roster refresh, completed/cancelled classes, and manual corrections with actor/reason/history.
- Student attendance summaries; administrator course selection, working filters and PDF export.
- Installable app shell, cached student views and device-local pending/failed check-ins.
- PostgreSQL migrations, repeatable demo data, validated local imports, automated API/browser tests and CI.

## Attendance rules

Only **completed classes** in the selected course offering count. PRESENT and LATE count; ABSENT, EXCUSED and missing records do not. Scheduled/future and cancelled classes are excluded. Zero completed classes means **not assessed**, not 0%. The threshold is calculated from exact counts, without rounding the eligibility comparison.

An offering is identified by course code, academic year and semester. Students must be enrolled. A lecturer opens check-in only while a scheduled class is underway. The window lasts up to ten minutes and is capped at class end. Each code lasts up to two minutes. Stopping, completing or cancelling closes check-in. Completion/cancellation cannot be reversed through the prototype UI; attendance corrections remain possible on completed classes and are audited.

The output says **attendance requirement met**, not “exam eligible”: this app does not assess fees or coursework. The PDF is a prototype attendance report and is not presented as an official Appendix D register.

## Start with Docker Compose

Requirements: Docker with the Compose plugin. From the repository root:

```bash
cp .env.example .env
# Edit .env. Generate separate URL-safe values with: openssl rand -hex 32
# Set DB_PASSWORD, JWT_SECRET and JWT_REFRESH_SECRET; never reuse secrets.
docker compose up --build -d
# On a disposable demo installation only:
docker compose exec -e ALLOW_DEMO_SEED=true backend npm run seed
```

Open [http://localhost:5173](http://localhost:5173). Compose applies committed migrations before starting the API. Database and frontend ports are bound to loopback; the API is only exposed through nginx. Redis is not required. See [deployment notes](docs/DEPLOYMENT.md) before remote hosting.

## Demo accounts

Run the seed before using these accounts. The data is synthetic and the email domain deliberately does not belong to MUST.

| Role | Email | Password |
|---|---|---|
| Examiner | examiner@demo.sams.test | SamsDemo2026! |
| Student | student@demo.sams.test | SamsDemo2026! |
| Administrator | admin@demo.sams.test | SamsDemo2026! |

Additional students: student2 through student5 at demo.sams.test, with the same password. The seed creates two courses, five completed classes per course, a current class and a next-day class. The first student's historical result is 4/5 (80%). Re-running preserves records and does not duplicate the existing classes. A new day's seed adds that day's demonstration classes. Existing same-day classes are not reopened or reset; for a fresh same-day demo use a separate disposable database.

## Run locally without containers

Requirements: Node.js 22 and PostgreSQL 15 or later. Create a database/user first.

```bash
npm ci --prefix backend
npm ci --prefix frontend
cp backend/.env.example backend/.env
# Edit backend/.env with your database URL and distinct secrets.
cd backend
npm run prisma:generate
npm run prisma:deploy
npm run seed
npm run dev
```

In another terminal, run `npm run dev --prefix frontend` from the repository root. The Vite proxy forwards `/api` to port 3000. For an offline demonstration, build and run `npm run build --prefix frontend` followed by `npm run preview --prefix frontend`; the service worker is only generated in production builds. Offline caching requires HTTPS or localhost.

## A demonstration in five steps

1. Sign in as the examiner, open today's SWE2106 class, and click **Start check-in**.
2. In a separate browser profile/incognito window, sign in as the student and select that class. Enter the displayed code.
3. Return to the examiner. The roster refreshes within five seconds. Complete the class when teaching ends; it now contributes to the percentage.
4. Sign in as the administrator, open **Course reports**, select SWE2106, filter the register and download a PDF.
5. For offline behavior, first open the student app online. Disconnect, reload, and submit a code. It stays **pending**, never “present”. Reconnect with the app open. A valid current code is accepted; an expired/closed one becomes **failed** and requires lecturer review.

## Offline limitations

Student snapshots are user-scoped on the device and expire after 24 hours. Only the app shell is cached by the service worker; API responses are never cached there. Pending submissions are stored in IndexedDB per user and retried when reconnecting with the app open or by pressing **Send pending attempts**. Failed attempts remain visible and can be removed. Five network failures stop automatic retry. No client-supplied timestamp can backdate attendance. Offline first-time login is not supported. Sign out on shared devices; cached student data remains in that browser's local storage until its site data is cleared.

## Import real local data

Use `npm run import -- path/to/dataset.json` from `backend`, with `IMPORT_INITIAL_PASSWORD` set to an initial password of at least 12 characters. Imports are validated and transactional: unmatched references fail the whole import. Existing passwords and attendance are preserved; conflicting identities/dates are rejected. See [import guide](docs/IMPORT_GUIDE.md).

The original `data/` CSV/JSON files are retained as source/reference material. They are **not** automatically loaded: the weekly timetable lacks actual class dates and 131 of the 260 original enrollment rows reference absent courses. Importing it as a semester register would produce misleading results.

## Verification

```bash
npm run lint --prefix backend
npm run lint --prefix frontend
npm run build --prefix backend
npm run build --prefix frontend
# Use an ISOLATED database named sams_test; API tests clear its contents.
cd backend
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sams_test npm run prisma:deploy
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sams_test npm test
```

`lint` runs strict TypeScript checking (including backend tools/tests); it is not an ESLint/style check. Browser test setup, results and remaining environment limits are in [VALIDATION.md](docs/VALIDATION.md). API usage is in [API_SPEC.md](docs/API_SPEC.md); import the collection from `postman/` for manual testing.

## Project boundaries

The prototype deliberately omits SSO, fee/coursework integration, QR/geolocation/biometrics, notifications and automated import from university websites. Passwords are provisioned by the deployment operator; self-service account recovery and refresh-token revocation are not implemented. Retention policy, official record format and institutional approval must be confirmed before handling real university records. Keep the demo synthetic.

[Implementation plan](docs/IMPLEMENTATION_PLAN.md) · [Architecture](docs/TECH_ARCHITECTURE.md) · [Deployment](docs/DEPLOYMENT.md) · [PR workflow](docs/GIT_PR_GUIDE.md)
