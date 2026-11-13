# JavaScript SAMS REST API

Base URL: `/api`. Request/response bodies are JSON except PDF exports. Protected endpoints require `Authorization: Bearer ACCESS_TOKEN`. The roles are STUDENT, EXAMINER (lecturer), ADMIN (registrar/department staff).

Errors: `{error,message,details?}`. Statuses: 400 invalid data/business window, 401 authentication, 403 role/ownership/enrollment, 404 missing resource, 409 resource conflict, 429 throttling. Zod performs runtime validation in JavaScript; Prisma/database constraints enforce integrity. Successful resource creation uses 201; reads/actions and idempotent check-in retries use 200.

## Authentication

| Method | Path          | Input / response                                          |
| ------ | ------------- | --------------------------------------------------------- |
| GET    | /health       | Public; checks PostgreSQL connectivity                    |
| POST   | /auth/login   | `{email,password}` → accessToken, refreshToken, safe user |
| POST   | /auth/refresh | `{refreshToken}` → accessToken, refreshToken, safe user   |
| GET    | /auth/me      | Signed-in user's safe profile                             |

## Administrator setup

| Method | Path                            | Input / response                                                                                                                         |
| ------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /admin/users?role=STUDENT       | Safe users; optional STUDENT/EXAMINER/ADMIN role filter                                                                                  |
| POST   | /admin/users                    | `{email,name,password,role,regNo?,program?,year?}`; student requires regNo; password 12–72 characters; returns 201 without password/hash |
| GET    | /admin/students                 | Safe student list                                                                                                                        |
| GET    | /admin/courses                  | Offerings with examiner and enrollment/session counts                                                                                    |
| POST   | /admin/courses                  | `{code,title,program,year,semester,academicYear,examinerId,attendanceThreshold?}`; threshold integer 1–100/default 80; returns 201       |
| POST   | /admin/courses/:courseId/enroll | `{studentId}`; existing STUDENT and offering required; 201 or duplicate 409                                                              |

A course offering is unique by code/academicYear/semester. The assigned examiner must exist and have the EXAMINER role. Policy is chosen at offering creation; existing attendance history is not silently reinterpreted by a settings edit. Initial passwords must be shared privately. Self-service recovery/revocation is outside this prototype.

## Lecturer workflow (owner or administrator)

| Method | Path                                               | Input / effect                                                                |
| ------ | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| GET    | /examiner/courses                                  | Own offerings; admin sees all                                                 |
| POST   | /examiner/courses/:courseId/sessions               | `{startTime,endTime,room,sessionType?,naturalKey?}` → new SCHEDULED class/201 |
| GET    | /examiner/sessions/today?date=YYYY-MM-DD           | Own classes on the chosen Kampala date; admin sees all                        |
| GET    | /examiner/sessions/:id                             | Class plus current activeCode or null                                         |
| POST   | /examiner/sessions/:id/start-checkin               | Open/retrieve current `{code,expiresAt,closesAt}` during class                |
| POST   | /examiner/sessions/:id/stop-checkin                | Close the code window                                                         |
| POST   | /examiner/sessions/:id/complete                    | Count the class in reporting and close check-in                               |
| POST   | /examiner/sessions/:id/cancel                      | Exclude class from reporting and close check-in                               |
| GET    | /examiner/sessions/:id/attendance                  | Enrolled roster, including unrecorded students and correction history         |
| POST   | /examiner/sessions/:id/attendance                  | `{studentId,status,reason}`; reason 5–500 characters; audited correction      |
| GET    | /examiner/courses/:courseId/attendance-summary     | Own offering report                                                           |
| GET    | /examiner/courses/:courseId/attendance-summary/pdf | Own offering PDF                                                              |

Timestamps must be ISO strings with an explicit UTC offset; end must be after start. Type defaults to LECTURE and accepts TUTORIAL/PRACTICAL/LAB/CLINICAL. Session IDs are generated CUIDs; naturalKey identifies an imported or manually created class. Start-check-in requires a class currently in progress; its window lasts at most ten minutes, capped at class end, and current codes change every two minutes. Complete/cancel cannot reopen a finalized class. Future/cancelled classes cannot receive manual attendance.

## Student workflow

| Method | Path                        | Input / response                                                                               |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------------- |
| GET    | /student/sessions/upcoming  | Own enrolled scheduled classes in progress or starting within 14 days; no code/secret material |
| POST   | /student/checkin            | `{sessionId,code,originatingUserId?}` → `{success,duplicate,attendance,session:{courseCode}}`  |
| GET    | /student/attendance/summary | Own offering summaries                                                                         |

Student identity comes from the token, not a studentId supplied in the body. The current client sends originatingUserId as an additional consistency check: a different ID returns 403 before attendance is evaluated. It never grants permission. The field remains optional for existing clients. Enrollment, timing and current code are checked on the server. The first accepted request creates one attendance record; retries return the same code-based record/200 with duplicate=true. Student requests never overwrite lecturer manual corrections.

## Registrar reports

| Method | Path                             | Response                           |
| ------ | -------------------------------- | ---------------------------------- |
| GET    | /admin/eligibility/:courseId     | `{course,students,rules}`          |
| GET    | /admin/eligibility/:courseId/pdf | Paginated prototype attendance PDF |

The inherited API field `eligible` means **attendance requirement met**, not final examination clearance. Report fields: presentCount, totalSessions, attendancePct (number or null), eligible. Course and student-summary objects include attendanceThreshold. Only COMPLETED classes count; PRESENT/LATE count as attended. Zero completed classes returns null percentage and false qualification. Cancelled/future classes do not reduce the result.

Examples and executable assertions are in `postman/SAMS.postman_collection.json`; use `SAMS.local.postman_environment.json`. See POSTMAN_DEMO.md for the ordered live presentation and explanation of safe retries versus creation conflicts.

## Prepared registers, sync and review requests

| Method | Path                          | Behavior                                                                                              |
| ------ | ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| POST   | /sync/preparations            | Lecturer/admin-owned class; `{sessionId,purpose}` → 201 with preparation, roster and versions         |
| POST   | /sync/operations              | `{actorId,operations}` → 200 with per-operation outcomes and durable receipts; actor must match token |
| GET    | /student/attendance-claims    | Current student's requests and decisions                                                              |
| GET    | /examiner/sessions/:id/claims | Requests for an owned class                                                                           |

Typed operations are MARK, REVIEW_MARK, STUDENT_CLAIM and CLAIM_DECISION. Strict schemas reject malformed/extra fields; maximum 20 operations and the existing 16 KiB request-body limit apply. An HTTP 200 batch may include CONFLICT, NEEDS_REVIEW or DENIED outcomes. Replays of identical actor/UUID content return the original receipt with replayed=true. Reusing an ID for changed content conflicts. No device timestamp establishes attendance. See [OFFLINE_REGISTER.md](OFFLINE_REGISTER.md) for complete field definitions and executable Postman examples.

Protected requests recheck the current database role and isActive flag rather than relying on an old JWT role claim. Disabled accounts cannot sign in or refresh. This does not provide a full account recovery or session revocation interface.

## Timetable and record extensions

All routes require current authenticated accounts. ADMIN is required for `/admin/*`. Civil dates use validated YYYY-MM-DD; reasons require 5–500 characters. See [workflow semantics](TIMETABLE_AND_RECORDS.md).

| Method/path under `/api`                                 | Contract                                                                                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET `/timetable/calendar`                                | Sourced calendar reference and reviewed terms; non-admins receive safe term fields                                                                                                         |
| GET `/timetable/reference?group=&course=&publicationId=` | Staged weekly reference, provenance, quality flags, max 200 matches                                                                                                                        |
| GET `/timetable/sessions?from=&to=`                      | Authorized dated classes, maximum 31-day difference / 500 rows; no check-in secrets                                                                                                        |
| POST `/admin/timetable/refresh`                          | `{source:"mylectures"}` or `mylectures-2`; fixed repositories; 503 retains prior source on outage                                                                                          |
| GET `/admin/timetable/publications`                      | Latest 20 publications and 10 checks                                                                                                                                                       |
| POST `/admin/timetable/terms`                            | academicYear, semester, startsOn, endsOn, excludedDates [{date,reason}], HTTPS sourceUrl, sourceNote, reviewed:true; existing term requires baseVersion                                    |
| GET `/admin/timetable/entries`                           | Reviewed mappings with offering/calendar identity                                                                                                                                          |
| POST `/admin/timetable/preview`                          | publicationId, sourceKey, courseId, termId, optional entryId, weekday (ISO 1–7), startTime/endTime (HH:mm), room, sessionType, from/to, reviewed:true, reason; 201 review, no class writes |
| POST `/admin/timetable/reviews/:id/apply`                | Author-owned unexpired unchanged review; blockers/staleness return 409, repeated apply is safe                                                                                             |
| PATCH `/admin/courses/:id/policy`                        | attendanceThreshold (1–100), countLate, countExcused, basePolicyVersion, reason; conflicts 409                                                                                             |
| PATCH `/admin/enrollments/:id`                           | effectiveFrom/effectiveUntil (civil date or null), reason; start inclusive, withdrawal exclusive                                                                                           |
| POST `/reports/courses/:id/snapshots`                    | Assigned lecturer/admin; reason, reviewedPendingWork:true, basePolicyVersion; 201 consistent frozen report                                                                                 |
| GET `/reports/courses/:id/snapshots`                     | Assigned lecturer/admin; latest 20 snapshot descriptors                                                                                                                                    |
| GET `/reports/snapshots/:id`                             | Assigned lecturer/admin; saved JSON/policy/counts/hash                                                                                                                                     |
| GET `/reports/snapshots/:id/pdf`                         | Assigned lecturer/admin; PDF generated from frozen data                                                                                                                                    |
| GET `/admin/audit?entityType=&entityId=`                 | Latest 100 scoped events                                                                                                                                                                   |

Enrollment creation now accepts optional effectiveFrom, defaulting to the current Kampala day. Reports include enrollment IDs/bounds, policyVersion/countLate/countExcused and pendingClaims. Existing live report endpoints reflect current policy; snapshots preserve earlier policy.

## Academic structure and personal day

- GET `/academic/catalog`: authenticated source-backed faculties → programmes → selectable year/track groups, plus reference academic year/semester.
- GET `/admin/registration/preview?regNo=&academicYear=`: registration tokens, email suggestion, catalogue mapping and suggested study year; ADMIN only.
- PATCH `/admin/students/:id/profile`: programmeCode, year, studyGroupKey, studyAcademicYear, studySemester and reason; ADMIN-only audited placement correction. It does not change enrollments.
- GET `/student/day`: own academic profile, authorized dated classes and personal weekly projections. Reference events cannot authorize check-in; conflicting intervals remain visible.
- POST `/auth/login` also accepts `{identifier,password}` for email or registration sign-in; the existing `{email,password}` contract remains supported.
- Student creation accepts confirmed programmeCode/year/studyGroupKey/studyAcademicYear/studySemester. If an email is omitted for a valid student registration, the operator-supplied institutional convention supplies a suggestion. Passwords remain independent.
- Course creation accepts `audienceGroups` containing explicit existing timetable-group keys; an explicitly empty audience list is rejected. Enrollment accepts `overrideReason` when the student's placement is outside the declared audiences.
- Registrar course/student/user lists support faculty, programme, group, year, academicYear, semester, search, limit (1–200, default 100) and offset as applicable. Cross-programme course audiences participate in course filters. Query filters never replace role/ownership checks. Student reference requests use the student's confirmed group instead of browsing an unrestricted all-programme feed.

See [ACADEMIC_STRUCTURE_AND_DAY.md](ACADEMIC_STRUCTURE_AND_DAY.md) for source evidence, boundaries and data decisions.

## Programme course setup

All routes require a current authenticated account and are subject to mandatory temporary-password replacement. Publication, source import and cohort application additionally require the registrar's current password, a reason of 5–500 characters and a matching preview hash. IDs are CUIDs, unknown body fields are rejected and lists are bounded. These actions are separate from recording attendance.

| Method and path (under `/api`) | Role | Behavior |
| --- | --- | --- |
| POST `/student/course-setup` | STUDENT | `{}` resolves the current term and placement and assigns missing published compulsory courses. Returns READY, TERM_PENDING, PLAN_PENDING or PLACEMENT_REVIEW with a useful message. |
| POST `/student/course-setup` | STUDENT | `{confirm:true,planId,version,electives:[courseId]}` confirms the latest list and adds only permitted elective enrollments; 409 if stale. Existing withdrawals are retained. |
| GET `/admin/course-plans/options` | ADMIN | List reviewed terms and active lecturers. Optional `termId` and `groupKey` scope courses and the current plan. |
| POST `/admin/course-plans/source` | ADMIN | `{termId,groupKey}` returns distinct source labels, source lecturers and interval issues. Activities MUCOSA and BM-REP are excluded from course import. |
| POST `/admin/course-plans/import-preview` | ADMIN | `{termId,groupKey,items:[{code,examinerId}],reason}` previews eligible offerings, shared audiences and changes; returns previewHash. |
| POST `/admin/course-plans/import` | ADMIN | Same input plus previewHash and currentPassword creates/reuses offerings and adds the reviewed audience. Conflicting teaching details return 409. Does not create sessions. |
| POST `/admin/course-plans/preview` | ADMIN | `{termId,groupKey,items:[{courseId,compulsory}],expectedVersion,reason}` previews a full plan. Use expectedVersion 0 for first publication. |
| POST `/admin/course-plans/publish` | ADMIN | Same input plus previewHash/currentPassword publishes the reviewed plan transactionally; rejects stale versions and invalid programme/term/practice matches. |
| POST `/admin/course-plans/batch-preview` | ADMIN | `{planId}` previews matching active students in the current term, new compulsory links and placement-review count. |
| POST `/admin/course-plans/batch-apply` | ADMIN | `{planId,previewHash,currentPassword,reason}` applies the same setup service atomically to the previewed cohort, rejecting changed records. Maximum 500 programme candidates. |

New automatic links have effectiveFrom equal to the Kampala setup date and effectiveUntil equal to the day after the term ends. Existing links, effective dates and withdrawals are preserved. The batch does not override exceptional placement or create historical attendance. Publishing a revised plan requires renewed confirmation but does not delete previous enrollment or marks. Course confirmation cannot remove courses; corrections use registrar review.

Offerings now have `offeringKey` (default `MAIN` for existing/manual records). The identity is code + academicYear + semester + offeringKey, allowing programme-specific subjects to reuse a code safely. Source imports use the programme code as the offering key. Manual course creation accepts an optional uppercase alphanumeric/hyphen key of at most 40 characters. Course-plan preview/publication accepts an optional `reviewNote` of at most 1,000 characters, returned to students with the list. Source import also rejects conflicting titles within a group, staff/activity labels and malformed course codes.
