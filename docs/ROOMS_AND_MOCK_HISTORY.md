# Rooms and historical practice attendance

## Scope

Rooms are shared reference records. Historical attendance is an explicitly synthetic reconstruction for project use, restricted to synthetic students and synthetic project lecturers. The import creates separate `isPractice` offerings and never backdates an existing teaching enrolment or invents attendance for user-supplied names. Existing registrar and student reports identify practice history; course lists support `practice=all|only|exclude`. No university policy or past class delivery is inferred from a timetable.

## Room records

`Room` stores an internal unique code, display name, optional campus/building/type/capacity, aliases, source note, review status and active flag. New source labels are inactive REFERENCE records. Unknown capacity and location remain null. An operator can review or reject a label; only REVIEWED active rooms appear in authenticated `/rooms` suggestions. The registrar uses **Rooms** to search/paginate references and save reviewed metadata with a reason. Names and aliases cannot claim another catalogue room's label. Source labels and existing session venue text are preserved; old classes are not retimed or bulk relinked.

New manual classes and timetable application resolve reviewed labels to `roomId`, keep a textual venue snapshot and check overlapping non-cancelled dated classes across teaching offerings. Room booking checks share a transaction advisory lock. Preview presents booking conflicts; apply checks them again. Practice history never reserves physical rooms. Unmapped legacy/free-text labels remain allowed, so conflict checking is not a complete physical booking guarantee until venue mapping is reviewed. Weekly reference rows alone do not reserve rooms. Alias matching preserves source spelling; an operator should add reviewed variants. Capacity is descriptive until verified enrolment/capacity policy is defined.

Stage source labels through the CLI, previewing first:

```sh
cd /opt/sams/current/backend
# Run under the service environment; never print DATABASE_URL or credentials.
node scripts/import-room-references.js ../data/timetable_export.json REGISTRAR_ID
node scripts/import-room-references.js ../data/timetable_export.json REGISTRAR_ID PREVIEW_HASH
```

Person-like labels remain outside automatic staging for manual source review. Staging does not approve rooms, attach capacity or alter historical classes.

## Historical import

`draft-mock-history.js NEW_PRIVATE_DIRECTORY` reads the single current reviewed term, latest stored timetable publication, five programme offerings (BSE, BCS, BIT, BBA, BME), enrolled synthetic students and synthetic lecturers. It writes bounded private manifests, one per offering, using stable past dates from term start through yesterday in Kampala. It skips invalid class types/intervals, excluded dates, and offerings with missing/excessive/overlapping source intervals. Exact weekly duplicates collapse. Explicit start/end fields take precedence over grid labels for this synthetic reconstruction; discrepancies are reported in the preview rather than asserted as verified teaching. Source venues that resemble person names are left unknown. Simulated cancellations are deterministic, not institutional calendar exclusions.

```sh
node scripts/draft-mock-history.js /etc/sams/history-manifests-RUN
node scripts/mock-history.js PRIVATE_MANIFEST.json REGISTRAR_ID
node scripts/mock-history.js PRIVATE_MANIFEST.json REGISTRAR_ID PREVIEW_FINGERPRINT
```

For a combined operator run, `node scripts/prepare-pilot-history.js --preview NEW_PRIVATE_DIRECTORY REGISTRAR_ID` creates manifests, room-source evidence and `preview.json`. Review its skipped offerings and counts, then use `--apply` with the same directory and actor. Each offering uses its stored preview fingerprint; `applied.json` records completed batches for safe resumption.

The draft writes files but no database records. Preview writes neither classes nor attendance. Each manifest is strict and bounded to 50 students and 100 sessions. The importer checks an active registrar with completed password setup; synthetic lecturer/student origins; matching programme/year/term audience; elapsed dates within the reviewed term; excluded dates; duplicate keys; same-day positive intervals; and overlapping classes within each offering. Changed preview inputs or placement/policy state require a new preview. Imports are transactional per offering and serialized against other mock-history imports. Partial multi-offering runs can safely resume using the original manifests.

Each import creates a separate `H-<source-course-id>` practice offering, clones its audience and attendance counting policy, and gives its synthetic students explicit enrolment bounds for the historical period. Completed classes receive deterministic PRESENT/LATE/EXCUSED/ABSENT patterns with different per-student tendencies. Cancelled classes receive no marks and do not enter report denominators. Method is MANUAL; no check-in codes, offline receipts or historical authentication events are fabricated. Attendance and audit recording timestamps reflect the actual import time; class times reflect simulated historical events. Each mark has an `AttendanceChange`; each batch has a manifest hash, actor, counts, source note and audit event. A repeated identical batch preserves existing marks and corrections. Reusing a batch key with changed content fails. Existing history offerings cannot be silently extended by a new batch.

Academic structure and actual course setup remain unchanged. Real identities require real historical source evidence and a separately reviewed import workflow. Prior saved report snapshots retain their original contents. Normal compulsory-course plans exclude these practice offerings; the import supplies their explicit synthetic enrolments instead.

## API

All room routes require authentication and a completed mandatory password change. GET `/rooms` lists active reviewed rooms; GET `/admin/rooms` lists registrar records with `status`, `search`, `limit` (1–200) and `offset`. POST `/admin/rooms` creates a record; PATCH `/admin/rooms/:roomId` saves a full reviewed form. The form accepts code, name, optional campus/building/capacity, roomType, aliases, reviewStatus, isActive, sourceNote and required reason. Invalid fields/active-unreviewed combinations return 400; other roles cannot write; conflicting names/aliases return 409. The history importer is an operator CLI, not a bulk public API.

## Verification and release

Isolated verification on 17 November 2026 passed 71 backend tests, 48 browser tests, and 145 Postman requests with 377 assertions. Coverage includes real-identity rejection, excluded/duplicate dates, stale preview, stable replay, audited marks, enrolment-aware denominators, room authorisation/review/aliases and cross-offering booking conflicts, plus registrar room review and lecturer suggestions. Intermediate development tests caught and corrected PostgreSQL advisory-lock return-type handling and test identity references. Backend/frontend syntax checks passed. A separate isolated execution of the combined preparation command drafted 14 classes for one synthetic learner, confirmed that preview wrote no history, applied the batch and preserved it on replay. Hosted activation and dataset preview results are recorded separately after execution; these tests do not claim live institution-wide room verification or capacity testing.
