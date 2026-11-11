# JavaScript SAMS REST API

Base URL: `/api`. Request/response bodies are JSON except PDF exports. Protected endpoints require `Authorization: Bearer ACCESS_TOKEN`. The roles are STUDENT, EXAMINER (lecturer), ADMIN (registrar/department staff).

Errors: `{error,message,details?}`. Statuses: 400 invalid data/business window, 401 authentication, 403 role/ownership/enrollment, 404 missing resource, 409 resource conflict, 429 throttling. Zod performs runtime validation in JavaScript; Prisma/database constraints enforce integrity. Successful resource creation uses 201; reads/actions and idempotent check-in retries use 200.

## Authentication

| Method | Path | Input / response |
|---|---|---|
| GET | /health | Public; checks PostgreSQL connectivity |
| POST | /auth/login | `{email,password}` → accessToken, refreshToken, safe user |
| POST | /auth/refresh | `{refreshToken}` → accessToken, refreshToken, safe user |
| GET | /auth/me | Signed-in user's safe profile |

## Administrator setup

| Method | Path | Input / response |
|---|---|---|
| GET | /admin/users?role=STUDENT | Safe users; optional STUDENT/EXAMINER/ADMIN role filter |
| POST | /admin/users | `{email,name,password,role,regNo?,program?,year?}`; student requires regNo; password 12–72 characters; returns 201 without password/hash |
| GET | /admin/students | Safe student list |
| GET | /admin/courses | Offerings with examiner and enrollment/session counts |
| POST | /admin/courses | `{code,title,program,year,semester,academicYear,examinerId,attendanceThreshold?}`; threshold integer 1–100/default 80; returns 201 |
| POST | /admin/courses/:courseId/enroll | `{studentId}`; existing STUDENT and offering required; 201 or duplicate 409 |

A course offering is unique by code/academicYear/semester. The assigned examiner must exist and have the EXAMINER role. Policy is chosen at offering creation; existing attendance history is not silently reinterpreted by a settings edit. Initial passwords must be shared privately. Self-service recovery/revocation is outside this prototype.

## Lecturer workflow (owner or administrator)

| Method | Path | Input / effect |
|---|---|---|
| GET | /examiner/courses | Own offerings; admin sees all |
| POST | /examiner/courses/:courseId/sessions | `{startTime,endTime,room,sessionType?,naturalKey?}` → new SCHEDULED class/201 |
| GET | /examiner/sessions/today?date=YYYY-MM-DD | Own classes on the chosen Kampala date; admin sees all |
| GET | /examiner/sessions/:id | Class plus current activeCode or null |
| POST | /examiner/sessions/:id/start-checkin | Open/retrieve current `{code,expiresAt,closesAt}` during class |
| POST | /examiner/sessions/:id/stop-checkin | Close the code window |
| POST | /examiner/sessions/:id/complete | Count the class in reporting and close check-in |
| POST | /examiner/sessions/:id/cancel | Exclude class from reporting and close check-in |
| GET | /examiner/sessions/:id/attendance | Enrolled roster, including unrecorded students and correction history |
| POST | /examiner/sessions/:id/attendance | `{studentId,status,reason}`; reason 5–500 characters; audited correction |
| GET | /examiner/courses/:courseId/attendance-summary | Own offering report |
| GET | /examiner/courses/:courseId/attendance-summary/pdf | Own offering PDF |

Timestamps must be ISO strings with an explicit UTC offset; end must be after start. Type defaults to LECTURE and accepts TUTORIAL/PRACTICAL/LAB/CLINICAL. Session IDs are generated CUIDs; naturalKey identifies an imported or manually created class. Start-check-in requires a class currently in progress; its window lasts at most ten minutes, capped at class end, and current codes change every two minutes. Complete/cancel cannot reopen a finalized class. Future/cancelled classes cannot receive manual attendance.

## Student workflow

| Method | Path | Input / response |
|---|---|---|
| GET | /student/sessions/upcoming | Own enrolled scheduled classes in progress or starting within 14 days; no code/secret material |
| POST | /student/checkin | `{sessionId,code,originatingUserId?}` → `{success,duplicate,attendance,session:{courseCode}}` |
| GET | /student/attendance/summary | Own offering summaries |

Student identity comes from the token, not a studentId supplied in the body. The current client sends originatingUserId as an additional consistency check: a different ID returns 403 before attendance is evaluated. It never grants permission. The field remains optional for existing clients. Enrollment, timing and current code are checked on the server. The first accepted request creates one attendance record; retries return the same code-based record/200 with duplicate=true. Student requests never overwrite lecturer manual corrections.

## Registrar reports

| Method | Path | Response |
|---|---|---|
| GET | /admin/eligibility/:courseId | `{course,students,rules}` |
| GET | /admin/eligibility/:courseId/pdf | Paginated prototype attendance PDF |

The inherited API field `eligible` means **attendance requirement met**, not final examination clearance. Report fields: presentCount, totalSessions, attendancePct (number or null), eligible. Course and student-summary objects include attendanceThreshold. Only COMPLETED classes count; PRESENT/LATE count as attended. Zero completed classes returns null percentage and false qualification. Cancelled/future classes do not reduce the result.

Examples and executable assertions are in `postman/SAMS.postman_collection.json`; use `SAMS.local.postman_environment.json`. See POSTMAN_DEMO.md for the ordered live presentation and explanation of safe retries versus creation conflicts.
