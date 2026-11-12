# JavaScript migration verification

Current branch: `migration/javascript-assignment`. Verification uses synthetic records and isolated PostgreSQL; no university records were migrated and no public institutional deployment is claimed.

## Local checks

- Application backend, seed/import tools, tests, browser modules and browser tests are plain JavaScript. No authored `.ts`/`.tsx` files or direct TypeScript/React/Vite/Tailwind application dependencies remain.
- JavaScript syntax checks pass in backend and frontend. The application runs directly with Node and serves HTML/CSS/JS without compilation.
- **44 Node/Supertest/rule/import tests** pass against PostgreSQL: preserved attendance/auth/concurrency/correction/reporting behavior plus administrator provisioning, duplicate creation, enrollment, owned class creation and configurable thresholds.
- **6 browser journeys** pass: lecturer → mobile student → registrar report/PDF; offline reload and stale-code rejection with account isolation; valid pending acceptance after reconnection; and plain-form account/course/enrollment/class setup with the lecturer's own report; and server-synchronized Kampala dates, clean product wording and mobile navigation.
- **11 additional browser queue tests** pass: persisted Retry-After and repeated transient failures, lost responses, immutable attempts, permanent rejection, two-tab leases, deletion during replay, account switch/logout during refresh, successful renewal, legacy credential/data migration and expired-lease recovery. The sixth full journey verifies that a failed local save remains visible and sends no check-in.
- **5 prepared-register browser journeys** pass: offline prepare/save/reload/reconnect with provisional counts; explicit conflict review and a lost reply; cancelled-class denial; student request/lecturer approval; and working online correction when IndexedDB is unavailable. Phase 2 browser coverage is 22 tests; three timetable/report journeys bring the total to **25 tests**.
- Phase 2 backend cases cover concurrent persistent receipts, uppercase UUID normalization, immutable payloads, stale records/review, expired preparations, changed ownership/enrollment/policy/role, disabled accounts, bounded validation, forced audit rollback and claim approval/rejection. An independent server-process restart/replay check returned an older receipt without changing a newer LATE/version-3 record or duplicating its audit.
- The documented Postman collection is executed with Newman, including success/invalid requests, captured IDs/tokens, example response shapes and error assertions. The final local run passed **106 requests and 301 assertions with zero failures**; `postman/verification-summary.json` records the sanitized totals. Existing saved response examples remain sanitized examples from the earlier verified run; new synchronization/review cases include documented request bodies and executable assertions.
- Local preview migration was preceded by a database recovery snapshot and preserved every existing User/Course/Enrollment/Session/Attendance/AttendanceChange row count; no seed/reset was applied to the preview.
- Additive Phase 2 migration supplies versions/active status and preparation/receipt/claim tables without resets. The earlier additive database migration supplies a per-offering threshold with 1–100 bounds, retaining existing records and their 80% demo default.
- The earlier repeatable demo dataset and transactional local importer are retained as JavaScript commands.

The local database is PostgreSQL 18.6 running as a user-owned temporary cluster because this workstation has no Docker engine. Hosted CI uses PostgreSQL 16 and additionally checks packaged Compose startup, migrations, runtime seeding, served HTML/JS and authenticated API/database access.

## Reproduce

```bash
npm ci --prefix backend
npm ci --prefix frontend
npm run check --prefix backend
npm run check --prefix frontend
# API tests clear the isolated sams_test database; never use real records.
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sams_test npm run prisma:deploy --prefix backend
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sams_test npm test --prefix backend
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sams_test npm run seed --prefix backend
```

Start the backend against that test database with NODE_ENV=test and distinct JWT secrets, then run the collection:

```bash
npx --yes newman@6.2.3 run postman/SAMS.postman_collection.json \
  --env-var baseUrl=http://localhost:3000/api --bail
```

Install browser support from frontend using `npx playwright install chromium`. With the same test application running:

```bash
SAMS_E2E_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sams_test \
  npm run test:e2e --prefix frontend
```

Defaults: one Express application on localhost:3000 for both frontend and API. SAMS_BASE_URL and SAMS_API_URL can override those origins. PLAYWRIGHT_EXECUTABLE_PATH can select an installed Chromium-compatible browser. E2E setup resets only synthetic demo live classes and refuses database names not ending `_test`.

## Boundaries

The collection creates test accounts/offerings/classes; run it only against a disposable database. Postman and browser test accounts are synthetic. Node syntax checks do not replace runtime validation/tests. Individual member contributions are excluded as requested. HoD excuse approval, bulk marking, verified institutional policy, public hosting, production identity recovery/revocation and official report approval remain outside this scoped delivery.

## Timetable and report verification (Phase 3, completed 12 November 2026)

Seven backend groups add real-reference quality/provenance, preview/apply/exclusions/replay, stable retiming/protected history, stale/overlap/role/date rejection, last-good source retention on failure, enrollment/withdrawal denominators and frozen policy/report/PDF behavior. Three browser journeys add actual weekly data at phone width/offline reload, reviewed future generation plus visible polling of cancellation, and old-policy snapshot PDF after policy/enrollment changes. Total: **35 backend and 25 browser tests**. The assessed collection passes **95 requests and 279 assertions**.

A separate live `mylectures` refresh retrieved 1,304 rows at a resolved commit and stored source provenance; no classes were automatically changed. The snapshot PDF was rendered with Poppler and visually inspected. The browser suite uses the installed Chrome executable locally; a missing default Playwright download was resolved by selecting that browser. Test setup is confined to an isolated `_test` database. Real semester class generation remains awaiting registrar review of teaching dates/exclusions.

Phase 3 preview migration is preceded by another local recovery database copy and checked for preservation of core row counts. No main-preview seed/reset or VPS write is part of this phase.

## Native HTTPS pilot acceptance

On 12 November the native pilot passed public HTTPS health/login-page checks, three role sign-ins/scoped reads, forbidden/unauthorized/wrong-password cases and ten bounded concurrent health/database requests. All five migrations applied to a dedicated new database; no historical or university attendance was seeded. A custom-format backup restored into a fresh disposable database with matching core counts, and its off-VPS copy matched SHA-256. Both Node/PostgreSQL listeners are loopback-only; service/renewal/backup timers and log rotation were verified. See [SERVER_READINESS.md](SERVER_READINESS.md) for observations and limits. These checks do not replace physical-device or real-workload acceptance.

## Academic structure and day verification

The latest suite passes **44 backend tests, 29 browser tests, and 106 Postman requests/301 assertions**. New coverage verifies registration/email/intake/year semantics, repeat-year overrides, track/shared-event matching and deduplication, exact time boundaries, explicit overlap selection, faculty-scoped lists, current-class automatic targeting, personal offline reference and enrollment exceptions. A synthetic copy of the private import dataset created 51 accounts once and preserved all on repeat without attendance writes. The owned preview migration followed a recovery database copy and preserved all six core row counts. See ACADEMIC_STRUCTURE_AND_DAY.md.
