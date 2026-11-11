# Prepared offline registers and attendance review

Implemented in Phase 2 on 11 November 2026. The application remains plain HTML/CSS/JavaScript with Express and PostgreSQL. Android packaging and public deployment are separate phases.

## Lecturer workflow

1. While connected, open an existing scheduled class and select **Prepare for offline use**. The server validates current account/ownership and saves a preparation containing class/policy context, enrollment identities and attendance versions. The browser retains the roster on this device without live codes or correction-reason history.
2. During an outage, use **Prepared classes on this device**, or reopen the prepared class directly. Select **Save offline mark**, choose a status and give a reason. The saved operation is the local draft, written in one IndexedDB transaction. It is provisional and does not increment confirmed counts or official reports.
3. Reopen/resume the app, reconnect, or select **Sync saved work**. The coordinator sends due operations using their original IDs and originating identity. Each outcome is shown separately.
4. If a mark conflicts, select **Review saved proposal**. The application retrieves a new REVIEW preparation, displays the current record alongside the saved proposal, and requires a fresh reason and confirmation. A new operation links to the original conflict. Keeping the server record instead dismisses the proposal locally without changing official attendance.
5. Complete the class only after this device's unresolved work has been handled. The confirmation warns about other devices: the server cannot know unsent drafts that have never reached it. Finalizing elsewhere makes stale uploads conflict rather than silently modifying the finalized register.

The preparation expires after **72 hours from creation**. This is a disclosed technical limit for this increment, not a verified university attendance rule. Expired preparations remain readable; uploading their marks requires review against a fresh preparation. Preparing a future class does not permit marking it before the server considers it started. Offline new-class creation, first-time offline authentication and closed-app background execution are not implemented.

Online code check-in and ordinary online corrections remain available. A browser with unavailable IndexedDB can still use the lecturer's online corrections; it cannot prepare/save offline work, and completion is held because local pending work cannot be inspected.

## Student requests

A failed student attempt now offers **Request lecturer review**. The student supplies an explanation, which is saved in the durable outbox before transmission. Submitting a request creates no attendance. One request is allowed per enrolled student/class; an existing request is not silently replaced.

The assigned lecturer or an administrator can inspect requests, choose approval with PRESENT/LATE/EXCUSED or reject with a reason. Approval checks current class, enrollment and attendance versions, then writes attendance, correction audit, claim decision and receipt together. Rejection records its reviewer/reason/time and leaves attendance unchanged. A changed or already-decided request conflicts. A cancelled/future class cannot receive attendance; requests for completed classes can be deliberately reviewed. Students see their own current decisions.

A claim is a request for a lecturer declaration, not proof that a code was valid, that the student was physically present or that an offline timestamp is authentic. No expired code is automatically accepted.

## API contract

All paths below are under `/api`, require authentication, and use the current database account role/status. Disabling an account blocks login, refresh and protected API use while disabled. This is not a complete password recovery/session management system; re-enabling an account does not revoke its previously issued unexpired tokens.

| Method/path | Purpose |
|---|---|
| POST `/sync/preparations` | `{sessionId,purpose:"MARK"|"REVIEW"}`; lecturer/admin, current ownership; returns 201 with safe class, roster, preparation ID, times and versions |
| POST `/sync/operations` | `{actorId,operations:[...]}`; actor must match token; 1–20 strictly validated operations, subject to the existing 16 KiB JSON limit |
| GET `/student/attendance-claims` | Current user's requests/decisions and minimal course information |
| GET `/examiner/sessions/:id/claims` | Owned class requests with the student names needed for review |

Every operation contains `operationId` (UUID), `type`, `sessionId`, `observedAt` and `reason` (5–500 trimmed characters). UUIDs are normalized to lowercase. `observedAt` is an untrusted device observation; the server stores its own receipt time and does not use the device timestamp to establish permission or backdate attendance.

| Type | Additional fields |
|---|---|
| MARK | `preparationId`, `studentId`, `baseSessionVersion`, `baseAttendanceVersion`, `status` |
| REVIEW_MARK | MARK fields plus `reviewOf`, referencing this actor's original conflicting/review-needed operation; requires a fresh REVIEW preparation |
| STUDENT_CLAIM | No supplied student ID; it comes from the authenticated student |
| CLAIM_DECISION | `claimId`, `studentId`, `baseClaimVersion`, `baseSessionVersion`, `baseAttendanceVersion`, `decision` APPROVE/REJECT, `status` PRESENT/LATE/EXCUSED |

MARK supports PRESENT/LATE/ABSENT/EXCUSED. Attendance version zero means no existing record. The base versions must match the server-stored preparation and current attendance; clients cannot supply a newer guessed version to bypass an old preparation. Enrollment ID changes, including remove-and-readd, invalidate the prepared membership.

Example upload shape, with actual IDs taken from preparation responses:

```json
{
  "actorId": "<authenticated lecturer ID>",
  "operations": [{
    "operationId": "70de1462-a619-4dbe-a04a-e9d6878600be",
    "type": "MARK",
    "sessionId": "<class ID>",
    "preparationId": "<preparation ID>",
    "studentId": "<enrolled student ID>",
    "baseSessionVersion": 1,
    "baseAttendanceVersion": 0,
    "status": "PRESENT",
    "reason": "Observed the student during this class",
    "observedAt": "2026-11-11T18:00:00.000Z"
  }]
}
```

The Postman collection contains executable examples with captured IDs and current timestamps; angle-bracket placeholders above are explanatory, not valid identifiers.

## Receipts and concurrency

An HTTP 200 batch response contains `results`, one per operation. Outcomes are ACCEPTED, CONFLICT, NEEDS_REVIEW or DENIED; successful transport does not mean every mark was accepted. Meaningful codes include ATTENDANCE_CHANGED, CLASS_CHANGED, ENROLLMENT_CHANGED, PREPARATION_EXPIRED, CLASS_CANCELLED and CLAIM_CHANGED.

The server serializes concurrent actor/operation IDs with a transaction-scoped PostgreSQL advisory lock, then locks the affected session. A unique actor/UUID receipt stores a canonical payload hash, normalized input, result and server time. Same ID/content returns the original result with `replayed:true`, including after a restart or a later attendance correction. Different content under that ID returns OPERATION_ID_REUSED and cannot change the stored result.

Each operation commits independently. Attendance, version increments, correction audit and receipt either all commit or all roll back; claim decisions join that same transaction. If an unexpected failure interrupts a batch after earlier operations commit, retry the original IDs. The browser sends one operation per request in this increment. The transaction pattern follows [Prisma's transaction guidance](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions), using [PostgreSQL transaction-level advisory locks](https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS).

Ordinary manual corrections also increment attendance versions; completing/cancelling increments the session version. Code-window rotation does not invalidate an otherwise prepared roster. A client cannot bypass changed ownership or account status using a prior preparation. Negative receipts are historical decisions: acquiring new permission later requires a fresh operation, not rewriting the old receipt.

## Device storage and release handling

IndexedDB `sams-plain-js-v1` is now version 3. It preserves the phase-one attempts, snapshots and leases, adding `registers` and `operations`. The outbox stores immutable operation inputs, retry times and receipts. It coordinates tabs with renewable leases and retains pending work after lost responses. A lease can recover after its 30-second expiry if the owning tab disappears.

Service-worker cache `sams-workspace-v4` includes the new register module. Close old tabs if an upgrade is blocked; do not clear site data containing unsynchronized work. Authentication migrates existing phase-one sign-ins. Reload tests verify old pending attempts survive version-1 and version-2 database upgrades.

Saved rosters contain names and registration numbers. User-keyed storage is not encryption or protection against someone controlling the same browser profile. Logout removes active credentials while saved data remains. Prepare only necessary classes, use a private device, and reconcile work before intentionally clearing site data. Browser deletion/eviction can still lose work that has never reached the server. Approved retention and device management remain operational requirements.

## Verification and limits

Local verification: 28 backend tests, 22 browser tests, 75 Postman requests/241 assertions. Coverage includes duplicate concurrent uploads, altered operation IDs, stale records, expired preparations, changed enrollment/policy/ownership/role, inactive accounts, audit-write rollback, student requests and decisions, offline reload, lost replies, storage migration and unavailable offline storage with working online correction.

A separate server-process restart check replayed a previously accepted mark after a newer LATE correction: it returned the original receipt, kept version 3 unchanged and retained one original audit event. Chromium screenshots were inspected for the provisional/confirmed distinction. Hosted CI additionally validates PostgreSQL 16 and packaged Compose startup. Physical Android installation and long-outage field testing are still required before a real pilot.
