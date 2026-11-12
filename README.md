# SAMS — Student Attendance Management System

Group B · SWE2106 Internet Technologies and Web Design · E-tivity 5

SAMS digitizes **class attendance**, an Academic Registrar workflow. Students see their relevant classes and attendance, lecturers manage class registers, and registrars organize academic records and reports.

The application uses **HTML, CSS and JavaScript**, a **Node.js/Express API**, and **PostgreSQL** through Prisma's JavaScript client. Express serves both the frontend and `/api` from one origin. No frontend compilation or separate frontend server is needed.

**Current status, 12 November 2026:** a controlled pilot is hosted at [sams.tirallab.page](https://sams.tirallab.page). Core workflows and account-management features are implemented, but the latest audit identified unresolved defects. See [known issues](#known-issues-and-adoption-boundaries) before relying on the system for operational attendance.

[Proposal](docs/PROPOSAL.md) · [API reference](docs/API_SPEC.md) · [Postman walkthrough](docs/POSTMAN_DEMO.md) · [Validation record](docs/VALIDATION.md) · [Native deployment](docs/NATIVE_DEPLOYMENT.md)

## Users and workflow

| User | Main work |
| --- | --- |
| Student | View current/upcoming classes, submit a check-in and review personal attendance. |
| Lecturer (`EXAMINER` in the API) | Create assigned class sessions, open check-in, review/correct attendance and prepare offline registers. |
| Registrar (`ADMIN` in the API) | Manage accounts, academic placement, offerings, enrollment, timetable review and reports. |

1. The registrar creates an offering for a particular academic year/semester, assigns a lecturer and explicitly enrolls students.
2. The lecturer creates a dated class and opens a ten-minute check-in window during that class. Its code rotates every two minutes; the window cannot extend past class end.
3. The student signs in using an email or registration number. A single current enrolled class is targeted automatically. A class choice appears only when enrolled classes overlap; a weekly reference entry cannot authorize check-in.
4. The student submits the lecturer's current code. The server checks identity, enrollment and time. A repeated accepted check-in returns the same record.
5. The lecturer reviews the register, makes corrections with reasons and completes the held class. An unheld cancelled class is excluded from attendance calculations.
6. Students see their own summaries. Authorized lecturers and registrars view course reports and download PDFs or save report snapshots.

## How the application fits together

![SAMS architecture](docs/architecture.svg)

For a check-in, `student.js` handles the form and `api.js` sends the request. Express routes validate it, authentication checks the current account, and the attendance service applies the rules in a database transaction. PostgreSQL stores the accepted record; the response updates the browser. Changing a browser display does not change the authoritative attendance record.

| Area | Starting points |
| --- | --- |
| Page structure and styling | `frontend/public/*.html`, `frontend/public/css/styles.css` |
| Requests, navigation and sign-in state | `frontend/public/js/api.js`, `common.js`, `login.js` |
| Student day and attendance | `student.js`, `day-model.js`, `backend/src/services/student-day.js` |
| Lecturer register and registrar pages | `examiner.js`, `admin.js`, `timetable.js` |
| Account management | `account.js`, `accounts.js`, `backend/src/routes/accounts.js` |
| Offline storage and synchronization | `offline.js`, `register-offline.js`, `frontend/public/sw.js`, `backend/src/services/sync.js` |
| API and attendance rules | `backend/src/app.js`, `routes/`, `middleware/`, `services/attendance.js`, `services/rules.js` |
| Data and migrations | `backend/prisma/schema.prisma`, `backend/prisma/migrations/`, `data/` |
| Verification and hosting | `backend/tests/`, `frontend/tests/`, `postman/`, `.github/workflows/`, `deploy/native/` |

JavaScript runs directly in Node and the browser. Zod performs runtime request validation; Prisma provides database access and migrations. `build` and `lint` script names are aliases for syntax checks, not TypeScript compilation.

## Run locally

Use Node.js 22+ and a running PostgreSQL database. PostgreSQL 16 is the hosted CI and VPS baseline. Create a dedicated local database/user, then run these commands from the repository root:

```bash
npm ci --prefix backend
cp backend/.env.example backend/.env
```

Edit `backend/.env` before continuing:

- Set `DATABASE_URL` to your local database.
- Generate two different JWT secrets, each at least 32 characters. Run `openssl rand -hex 32` separately for each value.
- For the default local setup, use `PORT=3000`, `FRONTEND_URL=http://localhost:3000` and `TRUST_PROXY=0`.

```bash
npm run prisma:generate --prefix backend
npm run prisma:deploy --prefix backend
npm run seed --prefix backend
npm start --prefix backend
```

Open [localhost:3000](http://localhost:3000). `npm run dev --prefix backend` enables Node's watch mode. Browser requests use relative `/api` URLs.

**Seed only a disposable local/test database.** The seed creates fictional identities, enrollment, completed history and dated practice classes. It preserves existing passwords and marks rather than resetting them; it is not a production provisioning command. To repeat an attendance walkthrough after completing a class, create another class through the lecturer form.

### Local seed accounts

| Role | Email | Password |
| --- | --- | --- |
| Lecturer | examiner@demo.sams.test | SamsDemo2026! |
| Student | student@demo.sams.test | SamsDemo2026! |
| Registrar | admin@demo.sams.test | SamsDemo2026! |

`student2` through `student5` at `demo.sams.test` use the same local password. The seeded students share two BSE offerings with sample history and current/upcoming classes. These addresses are fictional.

**Hosted passwords differ from this table.** They are generated privately and must be obtained from the authorized operator. New bootstrap/cohort imports generate unique 12-character passwords with two pronounceable groups and four digits, such as `Mavo4826Leri` (illustration only). Existing passwords are preserved; credential files contain the initial values and do not track later password changes. Never publish hosted credentials, private rosters, tokens or database dumps.

## Academic records and timetable

Faculties, programmes, study years and timetable tracks are stored separately from course offerings and enrollment. The registrar uses dependent filters to work within an academic scope. A registration such as `2025/BSE/108/PS` supplies an intake year, programme token, sequence and sponsorship token; the sequence is not a class number. Academic placement is suggested, then confirmed, with recorded reasons for later changes.

Institutional-looking emails can be derived using the supplied registration convention. A derived address is not evidence of mailbox ownership, and no automatic email delivery or verification is implemented.

The timetable distinguishes **dated SAMS classes** from **weekly source references**. Staff review source versions, times, teaching dates and exceptions before applying future timetable entries. Refreshing a source does not automatically change classes or create attendance. The audit found calendar and scheduling defects in these paths; their correction is still pending.

The five-programme sample covers BSE, BCS, BIT, BBA and BME. User-supplied records and synthetic records are distinguished; neither programme membership nor importing a student creates enrollment. Separate hosted practice offerings use `-P` course codes. The supplied group-member roster is not enrolled or marked by the practice walkthrough.

[Academic structure and source decisions](docs/ACADEMIC_STRUCTURE_AND_DAY.md) · [Timetable and saved reports](docs/TIMETABLE_AND_RECORDS.md) · [Private import guide](docs/IMPORT_GUIDE.md)

## Attendance rules

- Offerings are separate by course code, academic year and semester. Only **completed** sessions within a student's effective enrollment dates enter the denominator.
- PRESENT counts. LATE and EXCUSED follow the offering's versioned policy; the defaults count LATE and exclude EXCUSED.
- Zero completed classes means **not assessed**. Exact counts determine whether a threshold is met before the displayed percentage is rounded.
- The default 80% and the original proposal's 75% are configurable project examples, pending institutional policy confirmation.
- A report describes the **attendance requirement**, not final examination clearance. Fees, coursework and other clearance decisions are outside the workflow.
- Lecturer corrections retain the actor, previous/new status, reason and time. Saved report snapshots retain their original counting context.
- A shared code cannot prove physical presence; lecturer oversight remains necessary.

## Offline and account behavior

A prior online visit/sign-in on HTTPS or localhost is required. The service worker caches the application shell; IndexedDB stores user-scoped snapshots, pending attempts and prepared registers. First-time offline sign-in and background synchronization while the app is closed are not supported.

Students' pending attempts are retried with the app open after reconnection or through **Send pending attempts**. Expired/closed codes are rejected rather than accepted using a device timestamp. Failed attempts can be referred to the lecturer for review.

Lecturers prepare a register online, save reasoned marks offline and synchronize later. Preparations last 72 hours. Changed records require explicit review; operation receipts prevent duplicate accepted changes. **Pending work is not accepted attendance.** Physical Android installation/update/offline acceptance remains pending.

**My account** provides password changes and end-all-sign-ins. Registrars use **Accounts** for student/lecturer recovery and access changes, with a current password and reason. Reset passwords are shared privately and must be replaced before workspace access. The audit identified account-creation gaps, so the recovery checks should not be read as comprehensive protection of every provisioning path.

Saved records remain on the browser after sign-out. Reconcile pending work before clearing site data, particularly on a shared device. Browser-cached views cannot learn of account revocation until reconnection.

[Offline register contract](docs/OFFLINE_REGISTER.md) · [Account management](docs/ACCOUNT_MANAGEMENT.md)

## Postman and verification

Import `postman/SAMS.postman_collection.json` and `postman/SAMS.local.postman_environment.json`. The collection contains descriptions, response examples and assertions, and captures tokens and record IDs automatically.

The verified regression baseline is **53 backend tests, 33 browser tests, 129 Postman requests and 337 assertions**. These results predate correction of the latest audit findings; passing them does not establish that the newly found cases are covered.

Run mutating tests and the full collection only against a separate disposable database named `sams_test`. The backend API tests clear its fixtures. Never point them at the hosted pilot or real attendance records.

```bash
npm ci --prefix frontend
npm run check --prefix backend
npm run check --prefix frontend
export DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sams_test
export NODE_ENV=test
npm run prisma:deploy --prefix backend
npm test --prefix backend
npm run seed --prefix backend
PORT=3001 FRONTEND_URL=http://localhost:3001 npm start --prefix backend
```

With that test server running, use a second terminal:

```bash
npx --yes newman@6.2.3 run postman/SAMS.postman_collection.json \
  --env-var baseUrl=http://localhost:3001/api --bail
```

For browser tests, install Chromium from the `frontend` directory with `npx playwright install chromium`, or select an installed Chrome/Chromium through `PLAYWRIGHT_EXECUTABLE_PATH`. Then run from the repository root:

```bash
SAMS_BASE_URL=http://localhost:3001 \
SAMS_API_URL=http://localhost:3001 \
SAMS_E2E_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sams_test \
  npm run test:e2e --prefix frontend
```

[Presentation runbook](docs/POSTMAN_DEMO.md) · [Executed checks and limits](docs/VALIDATION.md)

## Hosting

The pilot runs on an **Azure Student Subscription virtual machine** with native systemd, Node.js, PostgreSQL and Nginx/HTTPS. The native procedure is preferred for the supplied small VPS. Docker Compose is an optional development/CI path, not the running VPS arrangement.

Daily local backups and a verified manual off-VPS recovery copy exist. A recurring off-site backup destination and retention schedule still need arranging. Restore checks use a separate disposable database; they do not overwrite accepted attendance.

[Native setup and recovery](docs/NATIVE_DEPLOYMENT.md) · [Measured deployment record](docs/SERVER_READINESS.md) · [Optional Compose setup](docs/DEPLOYMENT.md)

## Reference application

[mylectures-2](https://github.com/mugmarp/mylectures-2) and the earlier [mylectures](https://github.com/mugmarp/mylectures) are **Android timetable applications**. Their academic catalogue, timetable data, shared-group matching and duplicate-handling ideas informed SAMS. The inspected revisions and differences are recorded in [the source analysis](docs/ACADEMIC_STRUCTURE_AND_DAY.md#what-the-android-references-contributed).

SAMS implements the relevant concepts in JavaScript for the web workflow. It does not port the Android interface or account-free programme selection into attendance authorization. Android wrapping is deferred until the web/PWA workflow is accepted; no Capacitor/TWA decision has been made.

## Known issues and adoption boundaries

The 12 November audit confirmed open issues in privileged-account creation, multibyte password validation, scheduling conflict checks, old-year timetable projection, new-offering academic validation and long-title PDF layout. These findings have **not yet been fixed**. Detailed reproduction evidence is kept locally rather than included in this public README.

Keep the pilot to controlled project use while these defects are corrected and tested. Operational adoption also requires confirmed teaching assignments/dates/exceptions, approved attendance policy, physical-device acceptance, recurring external backups and measured workload testing. Institutional approval, SSO, automatic email recovery, fee/coursework clearance and HoD approval workflows are not implemented.

The README is the current entry point. Older phase documents and verification totals are historical records; use the latest dated sections of [VALIDATION.md](docs/VALIDATION.md) and [SERVER_READINESS.md](docs/SERVER_READINESS.md) for executed evidence.
