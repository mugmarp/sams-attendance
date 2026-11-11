# SAMS API

Base URL: `/api`. JSON bodies. All protected routes require `Authorization: Bearer ACCESS_TOKEN`. Roles: STUDENT, EXAMINER, ADMIN. Errors use `{ error, message, details? }`, with 400 validation, 401 authentication, 403 ownership/role/enrollment, 404 missing record, 409 conflict, and 429 throttling.

| Method | Path | Role / effect |
|---|---|---|
| GET | /health | Public; verifies database connectivity |
| POST | /auth/login | Public; `{email,password}` → accessToken, refreshToken, user |
| POST | /auth/refresh | Public; `{refreshToken}` → accessToken, refreshToken, user |
| GET | /auth/me | Any signed-in user; safe profile |
| GET | /examiner/sessions/today?date=YYYY-MM-DD | Examiner's classes for Kampala date; admin sees all |
| GET | /examiner/sessions/:id | Owner examiner/admin; safe class and current activeCode |
| POST | /examiner/sessions/:id/start-checkin | Owner/admin; current `{code,expiresAt,closesAt}` |
| POST | /examiner/sessions/:id/stop-checkin | Owner/admin; closes window |
| POST | /examiner/sessions/:id/complete | Owner/admin; marks completed, closes window |
| POST | /examiner/sessions/:id/cancel | Owner/admin; excludes class, closes window |
| GET | /examiner/sessions/:id/attendance | Owner/admin; roster including unrecorded students and correction history |
| POST | /examiner/sessions/:id/attendance | Owner/admin; `{studentId,status,reason}`; audited manual correction |
| GET | /student/sessions/upcoming | Own enrolled, scheduled classes in progress or starting within 14 days; never returns code/secret |
| POST | /student/checkin | Student; `{sessionId,code}`; valid current code and enrollment required |
| GET | /student/attendance/summary | Student; own offering summaries |
| GET | /admin/courses | Admin; offerings with examiner and enrollment/session counts |
| GET | /admin/students | Admin; safe student list |
| GET | /admin/eligibility/:courseId | Admin; `{course,students,rules}` attendance qualification |
| GET | /admin/eligibility/:courseId/pdf | Admin; application/pdf prototype attendance report |

## Attendance responses

Summary fields: presentCount, totalSessions, attendancePct (number or null), eligible (boolean). The legacy `eligible` API name means **attendance requirement met**, not final exam clearance. Only completed sessions count; PRESENT/LATE count as attended. Zero sessions returns null percentage/false qualification.

Check-in returns `{success:true,duplicate:boolean,attendance,session:{courseCode}}`. Retries of existing code-based attendance return that record. Student retries cannot overwrite manual corrections. Corrections accept PRESENT, LATE, ABSENT or EXCUSED and a reason of 5–500 characters. Their change history records who changed what and when.

Session responses include flattened courseCode/courseTitle and a course object. Lecturer responses include `activeCode` or null. The current code changes every two minutes during the ten-minute window (capped at class end). The previous code is rejected immediately after rotation. Client timestamps are not accepted to backdate offline requests.

Account provisioning and dated class import are operator CLI functions, not unauthenticated web endpoints. See IMPORT_GUIDE.md. A Postman collection with demo variables is in `postman/SAMS.postman_collection.json`.
