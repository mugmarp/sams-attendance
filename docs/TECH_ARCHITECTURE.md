# SAMS implementation architecture

React/Vite serves three role-based journeys. Express exposes a single `/api` router. Prisma accesses PostgreSQL. Nginx serves the production app and proxies `/api`; PostgreSQL owns all attendance and check-in state. There is one backend process and one database, with no Redis requirement.

## Records

- User: provisioned account, role and optional student registration details.
- Course: a single offering, unique by code/academic year/semester, assigned to one examiner.
- Enrollment: unique student/offering pair.
- Session: a real dated class, uniquely keyed by its import source, with scheduled/completed/cancelled state.
- Attendance: unique student/session, status, method and initial recording time.
- AttendanceChange: immutable application-created correction entry with actor, previous/new status, reason and change time.

The schema and committed SQL migration are in `backend/prisma`. Apply them to an empty database; the earlier Hermes schema was never a verified deployed schema. Do not reset a real database to adopt this migration.

## Check-in transaction

Starting, stopping, completing, cancelling, correcting or checking into a class takes a PostgreSQL row lock on that Session. This serializes conflicting operations, including concurrent student retries and lecturer closure. Ownership and enrollment checks happen on the server. Existing code-based attendance is returned idempotently; manual records cannot be overwritten by student submissions.

Opening check-in creates a random secret and a start/close timestamp. The six-character current code is derived using HMAC-SHA256 and the current two-minute slot. Its expiry is the earlier of slot end and window end. The server clock determines acceptance. No process timers or secondary cache need to survive a restart. Student DTOs omit code material. Examiner views poll every five seconds and hide codes after their expiry.

## Reports

Completed sessions only, within one course offering, form the denominator. PRESENT/LATE form the numerator. Zero completed sessions returns null percentage. The 80% comparison uses integer counts before display rounding. Reports include all enrolled students, even without attendance or sessions. PDFKit renders a paginated prototype report, not a verified official register.

## Browser state

Short-lived access and seven-day refresh tokens are stored locally for this classroom prototype. Concurrent refreshes share one promise. A network error does not erase an offline user's saved session. Logout clears tokens/current user. Refresh-token revocation and self-service password recovery are outside this prototype; adopt managed institutional authentication before production use.

The generated service worker caches only static app assets and the navigation shell. Student API snapshots and pending attempts are stored separately in user-keyed IndexedDB records. Snapshots expire after 24 hours. Attempts are sent while the app is open on reconnection or explicit retry. Business rejections stop automatic retry; five network failures also stop it. Pending/failed attempts never count toward attendance.

## Data and provisioning

The demo seed is repeatable and guarded against accidental production use. The local JSON importer validates all references before a transaction, preserves existing records and rejects identity/date conflicts. The original weekly timetable is reference data, not a set of completed teaching sessions. Dates and enrollments require validation before importing university data.
