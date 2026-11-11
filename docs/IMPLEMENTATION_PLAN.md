# SAMS completion plan

Goal: deliver a small, reliable attendance prototype using React, Express and PostgreSQL. Attendance qualification is separate from fees/coursework approval. No university system integration or claim of an official regulatory document.

1. Establish reproducible builds: lock dependencies, fix compiler/configuration errors, add committed migrations and environment examples.
2. Make PostgreSQL authoritative: dated sessions with scheduled/completed/cancelled state, transactional code rotation, scoped reporting, safe student responses and recorded corrections.
3. Make demo data repeatable: explicit demo accounts, consistent enrollments, completed history and current/upcoming classes in Africa/Kampala. Keep the original timetable as reference; do not silently import unmatched records.
4. Complete the three role journeys: examiner dashboard/session/roster, student check-in/summary and administrator course/report selection. Poll current code/roster, use consistent API shapes and role-based navigation.
5. Add honest offline behavior: cached app shell and user-scoped pending submissions; expired codes remain rejected, pending never means present, corrections require an examiner and reason.
6. Verify critical behavior: auth/ownership, code expiry/rotation, duplicate/replayed attendance, concurrent submissions, cancelled/future classes, zero-session and 80% boundaries, seed repeatability, PDF and responsive UI.
7. Finish delivery: working Compose/migrations/seed procedure, CI, API collection, revised README and a reproducible demonstration.

## Rules

- Count completed classes in a selected academic year/semester only. Scheduled and cancelled classes do not reduce attendance. PRESENT and LATE count; ABSENT and EXCUSED do not. With zero completed classes, percentage is null and attendance qualification is not established.
- Check-in requires enrollment and a scheduled class currently in progress. An examiner opens a ten-minute check-in window, capped at class end; the displayed code rotates every two minutes. Old codes fail immediately. Stopping/finishing/cancelling closes check-in.
- Attendance is unique per student/session. Repeated identical check-ins return the existing record. Manual changes require a reason and retain who/when/before/after in an audit record.
- Cached/offline submissions are attempts, never proof of attendance. Server time and current code determine acceptance. Failed/expired attempts remain visible for lecturer review.
- Keep one backend and one database. No Redis, geolocation, biometrics, external student integrations, notifications or additional frameworks are required.

## Verification record

Implementation and test results will be recorded in docs/VALIDATION.md. Each implementation commit includes its scope, verification and remaining limitations.

## Completion record

The planned prototype implementation is complete. See VALIDATION.md for executed checks and environment limits. The remaining institutional integrations/approvals are explicit project boundaries, not hidden placeholder features. Real data is provisioned through the validated local importer rather than an unverified bulk timetable seed.
