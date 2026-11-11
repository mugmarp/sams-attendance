# Current data dictionary

The authoritative schema is `backend/prisma/schema.prisma`. This is a relational PostgreSQL implementation; “collections” in the early MongoDB proposal correspond to tables here.

| Table | Important fields | Integrity |
|---|---|---|
| User | id, email, name, role, isActive, passwordHash, optional regNo/program/year | Unique email and registration number; safe API projections omit passwordHash |
| Course | id, code, academicYear, semester, title, program/year, examinerId, attendanceThreshold | Unique offering by code/year/semester; assigned examiner; threshold 1–100 |
| Enrollment | studentId, courseId | Unique student/offering pair; foreign keys |
| Session | naturalKey, version, courseId, startTime/endTime, venue, type, status, secret/window timestamps | Unique source key; dates validated; state SCHEDULED/COMPLETED/CANCELLED |
| Attendance | studentId, sessionId, version, status, method, recordedAt | Unique student/session; CODE or MANUAL provenance |
| AttendanceChange | attendanceId, actorId, previousStatus, status, reason, recordedAt, optional operationId | Append-only application correction history |
| OfflinePreparation | actorId, sessionId, purpose, snapshot, createdAt/expiresAt | Server-owned class/policy/enrollment/version snapshot; 72-hour technical validity |
| SyncReceipt | actorId, operationId, payloadHash, payload, result, receivedAt | Unique actor/UUID; immutable through the API; commits with its attendance/audit/claim decision |
| AttendanceClaim | studentId, sessionId, reason, status, version, reviewerId, decisionReason/decidedAt | One request per student/class; PENDING → APPROVED/REJECTED; no attendance before approval |

Statuses: PRESENT, LATE, ABSENT, EXCUSED. Only PRESENT/LATE count toward the prototype attendance rule. Zero completed classes returns null percentage. The default 80% is configurable demo policy and is not independently verified university policy.

The original 1,304 timetable entries are weekly slots, not dated held classes. Original student/enrollment CSV files contain mismatched course references. They are reference material, not automatically imported records. Provision through validated forms or normalized local JSON. Avoid using real student records until institutional policy and deployment controls are approved.
