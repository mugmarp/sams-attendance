# JavaScript SAMS architecture

Express serves both the plain frontend and `/api`. A single origin avoids an extra frontend development server and keeps the fetch calls simple. PostgreSQL is the live persistent database; Prisma's JavaScript client provides transactions, relations and migrations. No TypeScript, JSX, React, Vite, Tailwind, Redis or nginx application layer is required.

![Architecture](architecture.svg)

## Responsibilities

- `frontend/public/*.html`: page structure, forms, tables, labels and accessible controls.
- `frontend/public/css/styles.css`: authored responsive presentation.
- `frontend/public/js/api.js`: fetch, bearer tokens, refresh and meaningful error handling.
- `common.js`: role-aware navigation, saved-session restoration, escaping and Kampala formatting.
- `examiner.js`, `student.js`, `admin.js`: page events, API requests and DOM updates.
- `offline.js`, `register-offline.js`, `sw.js`: user-scoped student retries, prepared rosters, durable operation outbox, renewable leases and static app-shell caching.
- `backend/src/routes`: API schemas, role/resource access, setup operations and workflow endpoints.
- `backend/src/services`: authoritative attendance rules, transactions, reports and PDF output.
- `backend/prisma`: schema, committed migrations and repeatable synthetic seeding.
- `backend/scripts/import.js`: validated transactional local import.

## Check-in and reporting

Opening, closing, completing, cancelling, correcting and checking into a class lock the Session row in a transaction. Enrollment and ownership are checked on the server. The unique student/session constraint prevents duplicates, while identical code-based retries return the existing record. Students cannot overwrite manual corrections.

A random database-held secret and two-minute slot produce the current HMAC-derived code during a ten-minute window capped at class end. There are no process timers or secondary code stores to drift after a restart. Student responses omit code material. Lecturer pages poll code/roster every five seconds and hide codes at expiry.

Completed classes in one code/year/semester offering form the denominator; PRESENT/LATE form the numerator. The offering's configured threshold is compared against exact counts, then percentages are rounded for display. Zero completed classes returns null percentage and unassessed status. Reports include every enrolled student. Lecturer exports are ownership-scoped; administrators can report across offerings.

## Validation and security

Removing TypeScript removes development-time annotations, not runtime checks. Zod validates incoming JSON/IDs/dates/policies, Express middleware verifies JWTs and rechecks current database account status/roles, bcrypt hashes passwords, database constraints enforce uniqueness and threshold bounds, and transactions serialize conflicting operations. Untrusted values are escaped before insertion into HTML. No password hashes or check-in secrets are returned to students. Proxy trust is disabled unless explicitly configured for one trusted proxy.

This remains a classroom prototype. Token revocation/recovery, institutional identity integration, approved retention and public hosting are separate operational requirements.

## Offline

The service worker caches static HTML/CSS/JS, never API responses. Safe student snapshots and attempts are stored separately, keyed by user. Snapshots expire after 24 hours. Each new attempt is saved before sending with an immutable local ID; a transactionally renewed IndexedDB lease coordinates replay across tabs. Temporary failures retain their next retry time with exponential backoff/jitter and Retry-After handling, while invalid/denied attempts require action. Successful attempts retain a local acknowledgement and discard the code. The student-code path retains its original attendance uniqueness semantics. Prepared lecturer marks and review requests use the separate server operation-receipt protocol described below. Expired codes are never accepted using a device timestamp. Authentication uses a per-sign-in record and active identity pointer. Logout leaves a terminal marker so a late refresh cannot reactivate that sign-in; refresh writes cannot replace another account’s active pointer. Requests capture their original credentials, and queued uploads send an originating-user consistency check enforced by the server. Logout clears active credentials, while user-scoped local data remains until site data is cleared. First-time offline login is not supported.

## Prepared registers and versioned synchronization

Phase 2 adds additive session/attendance versions, OfflinePreparation, SyncReceipt and AttendanceClaim tables. A server-stored preparation binds an authorized actor to class/policy context, enrolled IDs and attendance versions for 72 hours. The local draft is the immutable IndexedDB outbox row, so saving cannot split between draft and queue. UI counts use confirmed attendance and keep pending proposals separate.

The sync API validates bounded typed operations and their originating actor, rechecks current authorization, locks operation identity and the session, and compares preparation/current versions. It atomically writes attendance, correction history and a persistent canonical-hash receipt; claim approvals include the decision in that transaction. Identical retries return the original result; different content under the same actor/UUID conflicts. Batches commit per operation, not as one all-or-nothing unit.

Conflict review reads fresh server state and creates a new linked operation with an explicit reason. Keeping the server record dismisses the local proposal; it never changes the old receipt. Student claims alone do not create attendance. Server receipt time is authoritative; client observation time is retained only as an untrusted declaration. See [OFFLINE_REGISTER.md](OFFLINE_REGISTER.md) for exact routes, types, limitations and test evidence.

## Timetable and saved-report data flow

Authenticated browser timetable → same-origin Express → authorized dated sessions or stored weekly publication. Visible pages poll dated sessions every 15 seconds. Activated source providers are checked every 30 minutes by an unreferenced server timer; approved GitHub JSON is fetched at one resolved commit, validated and staged in PostgreSQL. No source refresh directly modifies attendance classes.

Registrar calendar/mapping → preview + fingerprint → locked, checked application → stable dated sessions. Existing offline preparations carry enrollment bounds and policy context, so schedule/enrollment/policy changes cannot silently reuse stale marks. PostgreSQL aggregates completed attendance inside effective enrollment dates. Repeatable-read report issuance freezes counts/policy into ReportSnapshot; its PDF uses only that saved data. See [limitations and provenance](TIMETABLE_AND_RECORDS.md).

## Faculty structure and live day

Faculty/Programme/ProgrammeGroup normalize the catalogue; CourseAudience represents shared teaching, and Enrollment remains the attendance-access relation. Registration parsing supplies identity tokens and suggestions, not authorization or automatic academic promotion. The student's own day endpoint returns a bounded dated schedule and a deduplicated personal weekly reference. The browser updates countdown/progress each second and polls while visible; only a current enrolled dated class can target check-in. See [academic decisions](ACADEMIC_STRUCTURE_AND_DAY.md). No Kotlin/Compose/Room runtime or Android wrapper was introduced.
