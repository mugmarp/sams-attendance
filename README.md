# SAMS — Student Attendance Management System

Group B · SWE2106 Internet Technologies and Web Design · E-tivity 5

SAMS digitizes **class attendance**, an Academic Registrar workflow. Students see their relevant classes and attendance, lecturers manage class registers, and registrars organize academic records and reports.

The application uses **HTML, CSS and JavaScript**, a **Node.js/Express API**, and **PostgreSQL** through Prisma's JavaScript client. Express serves both the frontend and `/api` from one origin. No frontend compilation or separate frontend server is needed.

**Current status, 15 November 2026:** a controlled pilot is hosted at [sams.tirallab.page](https://sams.tirallab.page). Core workflows and account-management features are implemented, but the latest audit identified unresolved defects. See [known issues](#known-issues-and-adoption-boundaries) before relying on the system for operational attendance.

[Proposal](docs/PROPOSAL.md) · [API reference](docs/API_SPEC.md) · [Postman walkthrough](docs/POSTMAN_DEMO.md) · [Testing history and API evidence](docs/TESTING_HISTORY.md) · [Validation record](docs/VALIDATION.md) · [Native deployment](docs/NATIVE_DEPLOYMENT.md)

## Users and workflow

| User | Main work |
| --- | --- |
| Student | View current/upcoming classes, submit a check-in and review personal attendance. |
| Lecturer (`EXAMINER` in the API) | Create assigned class sessions, open check-in, review/correct attendance and prepare offline registers. |
| Registrar (`ADMIN` in the API) | Manage accounts, academic placement, offerings, enrollment, timetable review and reports. |

1. The registrar prepares offerings for an academic year/semester, assigns lecturers and publishes each programme group’s course plan. Matching students receive its compulsory courses automatically; electives are confirmed in My courses. Manual enrollment remains available for reviewed exceptions.
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

## Project structure

```text
sams-attendance/
├── backend/
│   ├── src/
│   │   ├── app.js             Express setup and route mounting
│   │   ├── server.js          Server entry point
│   │   ├── config/            Database connection and environment settings
│   │   ├── controllers/       Authentication handlers
│   │   ├── middleware/        Authentication, permissions and error handling
│   │   ├── routes/            API endpoints and request validation
│   │   ├── services/          Attendance, academic, timetable and report logic
│   │   └── utils/             Shared helpers and password policy
│   ├── prisma/
│   │   ├── schema.prisma      Database models and relationships
│   │   ├── migrations/        Versioned database changes
│   │   └── seed.js            Local sample records
│   ├── scripts/               Account provisioning, imports and syntax checks
│   └── tests/                 Backend API and service tests
├── frontend/
│   ├── public/
│   │   ├── *.html             Login, student, lecturer and registrar pages
│   │   ├── css/               Shared styles
│   │   ├── js/                Page behavior, API calls and offline storage
│   │   ├── sw.js              Service worker and application-shell cache
│   │   └── manifest.webmanifest
│   ├── scripts/               Frontend checks
│   └── tests/                 Browser workflow tests
├── data/                      Versioned academic reference data
├── postman/                   API collection and local environment template
├── deploy/native/             VPS services, Nginx and backup utilities
├── docs/                      Proposal, API, design and operating documentation
├── .github/workflows/         Automated verification
├── docker-compose.yml         Optional container setup
└── README.md                  Setup, workflows and project guide
```

Edit application code in `backend/src/` and `frontend/public/`. Dependency folders and old local build output are not source folders. Private credentials, environment secrets, student import files and database backups stay outside version control.

## Group B folder allocation

Start with the [team system guide](docs/TEAM_SYSTEM_GUIDE.md) for an explanation of the workflow, code, database, offline behavior and hosting.

The allocation below gives each member a specific starting module. It is flexible, and related tests belong with each feature. Shared files need coordination rather than whole-folder replacement. The [verified allocation and PR review](docs/GROUP_B_FOLDER_ALLOCATION_AND_PR_REVIEW.md) records existing contributions, path conflicts, shared-file coordination and proposed follow-up messages. These areas are not exclusive ownership or team-lead appointments. Existing PR numbers below refer to the [Group B educational repository](https://github.com/mugmarp/Group_B_Etivity_5_WEB).

| Member | Starting module / files | Coordination |
| --- | --- | --- |
| Wokwaba Charles | Authentication: `backend/src/controllers/auth.js`, `backend/src/middleware/auth.js`, `frontend/public/js/login.js` | Coordinate JWT/password helpers and shared middleware; reconcile [#8](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/8), [#9](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/9) and [#14](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/14) into canonical paths. |
| Kanyesigye Brian | Academic records and course plans: `data/academic_catalogue.json`, `backend/src/services/catalogue.js`, `course-setup.js`, `backend/src/routes/course-plans.js` | Coordinate `backend/prisma/`, seeds and course-plan pages; narrow future changes beyond the broad [#13](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/13) import. |
| Kwesiga Lewis | Timetable and personal schedule: `backend/src/services/timetable.js`, `timetable-source.js`, `student-day.js`, `frontend/public/timetable.html`, `js/timetable.js` | Coordinate academic calendar/reference data with Brian and student schedule rendering with Annibow; [#10](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/10) imported other services too. |
| Akatuwijuka Annibow | Student interface: `frontend/public/student.html`, `courses.html`, `js/student.js`, `js/courses.js`, `js/day-model.js` | Coordinate shared CSS sections; retain [#15](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/15) history while correcting its deleted lecturer page through integration. |
| Natweta Cyril | Attendance rules and class actions: `backend/src/services/attendance.js`, `rules.js`; check-in/session handlers in `backend/src/routes/api.js` | Coordinate shared route edits with Mark, Charles and Edwine; keep reporting changes separate from attendance mutation. |
| Wawangula Generous | Lecturer interface: `frontend/public/examiner.html`, `frontend/public/js/examiner.js` | [#6](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/6) is a duplicate-path import of an already present identical module. Agree on its disposition before submitting new lecturer improvements. |
| Mugendawala Mark Paul | Integration and hosting: `backend/src/config/`, `backend/src/app.js`, `backend/src/server.js`, `deploy/native/`, `.github/workflows/` | Coordinate package/lock files, release baseline and CI. Preserve module contributions while assembling a runnable shared tree; [#5](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/5) covers config only. |
| Katto Andrew | Offline storage and synchronization: `frontend/public/js/offline.js`, `register-offline.js`, `frontend/public/sw.js`, `backend/src/services/sync.js`, `backend/src/routes/sync.js` | Coordinate API/session storage with Charles and Mark, prepared registers with Generous, pending student attempts with Annibow. |
| Nabaweesi Patricia Mirembe | Attendance reports: `backend/src/services/eligibility.js`, `pdf.js`, `frontend/public/admin.html`, `js/admin.js` | Coordinate the common counting helpers in `academic.js`; [#11](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/11) added a duplicate attendance service, so reporting needs a correctly scoped follow-up. |
| Matovu Edwine Levi | Account management: `backend/src/routes/accounts.js`, `frontend/public/account.html`, `accounts.html`, `js/account.js`, `js/accounts.js` | Coordinate authentication helpers with Charles and migrations with Brian. [#7](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/7) is a broad integration draft, not an isolated account-only diff. |
| Amen Joel Osuta | API and workflow verification: `postman/`, `backend/tests/`, `frontend/tests/` | Preserve the five validated checks and response examples from [#12](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/12). No general `docs/` assignment; feature owners maintain their own explanations. |

Abbreviated filenames stay in the preceding directory; `js/` means `frontend/public/js/`. Keep existing module paths and accepted contribution history. Before changing shared routes, schema/migrations, CSS, API/session helpers, the service worker, package files or test fixtures, agree on the small affected scope. Each PR must distinguish imported baseline files from new changes and state which checks actually ran. Joel’s assignment remains `postman/`, `backend/tests/` and `frontend/tests/`; general `docs/` ownership is not restored.

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

[Registration-based automatic course setup and Kampala-time review](docs/AUTO_ENROLLMENT_AND_KAMPALA_REVIEW.md) records the proposed enrollment workflow, inspected gaps and rollout checks. Course setup is implemented through published programme plans: registrars prepare offerings and publish compulsory/elective lists at **Course setup**, and students receive matching compulsory courses on sign-in or workspace entry. **My courses** allows list confirmation and permitted elective selection. Existing withdrawal decisions are preserved. New links start on the Kampala setup date; existing dates are not backfilled.

Faculties, programmes, study years and timetable tracks are stored separately from course offerings and enrollment. The registrar uses dependent filters to work within an academic scope. A registration such as `2025/BSE/108/PS` supplies an intake year, programme token, sequence and sponsorship token; the sequence is not a class number. Academic placement is suggested, then confirmed, with recorded reasons for later changes.

Institutional-looking emails can be derived using the supplied registration convention. A derived address is not evidence of mailbox ownership, and no automatic email delivery or verification is implemented.

The timetable distinguishes **dated SAMS classes** from **weekly source references**. Staff review source versions, times, teaching dates and exceptions before applying future timetable entries. Refreshing a source does not automatically change classes or create attendance. The audit found calendar and scheduling defects in these paths; their correction is still pending.

The five-programme sample covers BSE, BCS, BIT, BBA and BME. Thirteen published programme/year/track plans now cover 53 students, using five synthetic project lecturer accounts and 89 programme-specific offerings alongside the two original practice offerings. Source activities and contradictory entries are excluded with visible review notes; institutional curriculum classification remains pending. User-supplied records and synthetic records are distinguished; importing a student alone does not create enrollment. Automatic setup requires a matching published plan for the single current reviewed term. Separate hosted practice offerings use `-P` course codes. The supplied group-member roster is not enrolled or marked by the practice walkthrough.

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

The verified regression baseline is **65 backend tests, 44 browser tests, 135 Postman requests and 351 assertions**. The 15 November navigation release includes the latest delayed-response and cached-shell checks; see [performance fixes and executed evidence](docs/NAVIGATION_PERFORMANCE_FIXES_2026-11-15.md). Passing these checks does not establish that all remaining audit findings are covered. See the [testing-history index](docs/TESTING_HISTORY.md) for dated evidence and limits.

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

[Server setup and management](docs/SERVER_SETUP_AND_MANAGEMENT.md) · [Native setup and recovery](docs/NATIVE_DEPLOYMENT.md) · [Measured deployment record](docs/SERVER_READINESS.md) · [Optional Compose setup](docs/DEPLOYMENT.md)

## Reference application

[mylectures-2](https://github.com/mugmarp/mylectures-2) and the earlier [mylectures](https://github.com/mugmarp/mylectures) are **Android timetable applications**. Their academic catalogue, timetable data, shared-group matching and duplicate-handling ideas informed SAMS. The inspected revisions and differences are recorded in [the source analysis](docs/ACADEMIC_STRUCTURE_AND_DAY.md#what-the-android-references-contributed).

SAMS implements the relevant concepts in JavaScript for the web workflow. It does not port the Android interface or account-free programme selection into attendance authorization. Android wrapping is deferred until the web/PWA workflow is accepted; no Capacitor/TWA decision has been made.

## Known issues and adoption boundaries

The 12 November audit confirmed open issues in privileged-account creation, scheduling conflict checks, new-offering academic validation and long-title PDF layout. These findings remain open. Old-year timetable projection and UTC-to-Kampala report date boundaries have been corrected in source; consult deployment records for the running release. The separate multibyte initial-password validation issue is fixed by the shared 8-character/72-byte password schema. Detailed reproduction evidence is kept locally rather than included in this public README.

Keep the pilot to controlled project use while these defects are corrected and tested. Operational adoption also requires confirmed teaching assignments/dates/exceptions, approved attendance policy, physical-device acceptance, recurring external backups and measured workload testing. Institutional approval, SSO, automatic email recovery, fee/coursework clearance and HoD approval workflows are not implemented.

The README is the current entry point. Older phase documents and verification totals are historical records; use the latest dated sections of [VALIDATION.md](docs/VALIDATION.md) and [SERVER_READINESS.md](docs/SERVER_READINESS.md) for executed evidence.
