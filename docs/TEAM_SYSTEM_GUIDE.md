# Understanding SAMS — Group B study guide

## Purpose and scope

SAMS is a Student Attendance Management System for the Academic Registrar's class-attendance workflow. It connects student identities, course enrollment, dated teaching sessions and attendance records. It does not determine final examination clearance: fees, coursework and institutional approvals remain separate.

The hosted application is https://sams.tirallab.page. This is a controlled pilot with known defects, not an approved university attendance service. Read the current README and its known-issues section before operational use.

## Users and a complete attendance cycle

The registrar manages academic placement, course offerings, accounts and enrollment. The lecturer manages assigned classes and registers. Students see their own relevant classes and records.

1. A faculty contains programmes. A student's confirmed placement identifies the programme, study year and academic context.
2. The registrar creates a course offering for an academic year and semester, assigns a lecturer and enrolls students. Importing a student or matching a programme does not enroll them automatically.
3. A dated session represents one actual class. A weekly timetable entry is a reference until reviewed and turned into dated classes.
4. The lecturer opens check-in during the class. The window lasts up to ten minutes and cannot extend past class end; its code rotates every two minutes.
5. The student's current enrolled class is selected automatically when unambiguous. Overlapping enrolled classes may require a choice.
6. The server validates the account, enrollment, session and code. Accepted attendance is saved in PostgreSQL. Repeated accepted check-in returns the existing record.
7. The lecturer reviews or corrects marks with a reason and completes the held session. Cancelled, unheld classes do not count.
8. The system calculates attendance summaries and produces reports. Saved snapshots preserve the counting context at the time they were created.

## Architecture and technologies

The browser runs plain HTML, CSS and JavaScript. Express serves the pages and the `/api` endpoints from the same origin, so the frontend can use relative API URLs. There is no TypeScript compilation or frontend build required to serve the current application.

Node.js runs the Express backend. Routes validate requests using Zod; middleware checks identity and permissions; services implement business rules. Prisma's JavaScript client reads and writes PostgreSQL and manages versioned schema migrations.

A typical request follows this path:

```text
HTML form → page JavaScript → api.js → Express route
          → authentication and validation → service → Prisma → PostgreSQL
          ← page update ← JSON response ← accepted result or useful error
```

Browser displays are not authoritative attendance records. The database and server validation determine accepted attendance.

## Finding the code

All paths below are relative to the repository root.

| Area | Location | What to understand |
| --- | --- | --- |
| Startup | `backend/src/server.js`, `backend/src/app.js` | Starting the server, middleware and route mounting |
| Configuration | `backend/src/config/` | Environment validation and database connection |
| Authentication | `backend/src/controllers/auth.js`, `backend/src/middleware/` | Login, tokens, role checks and errors |
| API endpoints | `backend/src/routes/` | Request schemas, permissions and response handling |
| Business rules | `backend/src/services/` | Attendance, academic structure, timetable, synchronization and reports |
| Shared helpers | `backend/src/utils/` | Password policy, token helpers and common errors |
| Database | `backend/prisma/schema.prisma`, `backend/prisma/migrations/` | Models, relationships and schema history |
| Provisioning | `backend/scripts/` | Bootstrap accounts and controlled private imports |
| Page markup | `frontend/public/*.html` | Forms, navigation and page structure |
| Page behavior | `frontend/public/js/` | Data loading, rendering and actions |
| Styling | `frontend/public/css/styles.css` | Shared appearance and responsive layout |
| Offline shell | `frontend/public/sw.js`, `manifest.webmanifest` | Caching and web-app metadata |
| Verification | `backend/tests/`, `frontend/tests/`, `postman/` | API rules, browser journeys and request examples |
| Hosting | `deploy/native/`, `.github/workflows/` | Deployment, services, recovery and automated checks |

Use the README's project tree and flexible member allocation to choose a starting area. Members should also understand the neighboring API and data model, rather than memorizing only one file.

## Database concepts

`User` stores identity, role, account state and a password hash. Faculty, programme and programme-group records describe academic structure. `Course` is an offering in an academic context with assigned teaching responsibility. `Enrollment` connects a student to an offering and effective dates. `Session` is a dated class; `Attendance` records its student's status.

Attendance corrections retain history through change records. Audit events record relevant actions and reasons. Timetable publication, entry and review records separate source references from approved changes. Offline preparations and synchronization receipts support later register submission without accepting duplicate operations. Report snapshots retain a saved report's original context. Inspect the Prisma schema for exact fields and relationships.

A registration such as `2025/BSE/108/PS` contains an intake year, programme token, sequence and sponsorship token. The sequence is not a class identifier. Intake year can suggest study year, but confirmed academic placement must handle repeats, deferrals and other exceptions. A derived institutional-looking email is not proof of mailbox ownership.

## Frontend reading path

Start with `login.html` and `js/login.js`, then read `js/api.js` for requests and `js/common.js` for shared behavior. Follow `student.html` and `js/student.js` for check-in. Read `js/day-model.js` for the student-day display. Lecturer work starts at `examiner.html` and `js/examiner.js`. Registrar pages include admin, accounts and timetable. `account.html` and `js/account.js` handle the signed-in user's password and sign-in controls.

For each action, identify the event handler, request method and URL, submitted fields, server route, service operation and rendered result. Explain how errors reach the user as well as how success works.

## Authentication and password behavior

Passwords are stored as bcrypt hashes; they are not stored in plaintext in the database. Private operator credential files contain initial or reset values for controlled distribution. They become stale when someone changes a password.

Generated initial passwords contain 12 characters. The shared entry policy accepts at least 8 characters and at most 72 UTF-8 bytes. Password changes require the current password. Reset accounts must replace their temporary password before workspace access. Account sign-in versions allow password changes, resets and access changes to invalidate existing tokens.

The last cohort operation reset 51 programme-cohort accounts. The two enrolled practice students and three original accounts were not reset by that operation. The separate private PC credential file contains all 56 values verified at export time. Do not copy that file into Git or presentation slides.

## Offline behavior and synchronization

A previous online visit and sign-in are required. The service worker caches the application shell. IndexedDB stores user-scoped cached views, pending check-in attempts and prepared lecturer registers.

An offline check-in attempt is pending work, not accepted attendance. When the application is open after reconnection, it can retry submission. Expired or closed codes are rejected; a phone's local timestamp cannot authorize attendance. Students can request lecturer review where appropriate.

Lecturers prepare registers online and can save reasoned marks offline. Preparations last 72 hours. The server checks synchronization submissions; changed records require review, and receipts prevent duplicate accepted changes. Read `js/offline.js`, `js/register-offline.js`, the sync routes and sync service together.

First-time offline login and guaranteed background synchronization while the application is closed are not implemented. Browser storage can be lost when site data is cleared. Cached views cannot learn about account revocation until reconnection. Android wrapping is deferred; SAMS is currently a web application with service-worker/offline features.

## Attendance reports

Only completed classes within effective enrollment dates enter a student's denominator. PRESENT counts; LATE and EXCUSED depend on the offering's versioned policy. Defaults count LATE and exclude EXCUSED. Zero eligible completed classes means not assessed, rather than failure. Exact counts determine thresholds before percentage rounding.

The configured threshold is a project policy example pending institutional confirmation. An attendance report is not final examination clearance. Study `services/eligibility.js` for calculations and `services/pdf.js` for exported layout.

## Data used in the pilot

The programme-cohort import contains 51 students: the 11 supplied BSE members and 40 synthetic records across BCS, BIT, BBA and BME. Two additional synthetic BSE practice students have enrollment in the existing practice offerings. The original three accounts provide registrar, lecturer and student roles.

Programme-cohort membership does not imply enrollment. An account can sign in successfully and still see no courses. Resolve that by checking approved offerings and enrollment, not by creating attendance or assuming every programme shares the BSE timetable. Account totals and course history can change after this guide's dated snapshot; use the application or an authorized database check for current state.

## API verification and presentation

Read `docs/API_SPEC.md` and import `postman/SAMS.postman_collection.json`. Explain methods, request fields, authorization, successful responses and invalid requests. Show both a valid request and an appropriate rejection. The full mutating collection and backend fixtures belong only in a disposable test database; never run them against the hosted pilot.

The recorded regression baseline is 54 backend tests, 33 browser tests and 129 Postman requests with 337 assertions. These checks cover particular cases; they do not prove the absence of defects. Follow README commands for setup and test execution.

For a presentation, show the registrar/lecturer/student relationship, an enrolled student's class, lecturer check-in controls, the resulting register and a report. Explain the distinction between a cached attempt and accepted attendance. Use existing practice enrollments and schedule an appropriate class rather than backdating activity or treating unrelated students as enrolled.

## Hosting and operations

The pilot runs on an Azure Student Subscription Ubuntu VM using native Node.js, systemd, Nginx HTTPS and PostgreSQL. Express and PostgreSQL listen locally; Nginx provides public HTTPS access. The small VPS uses this native arrangement rather than Docker. Docker remains an optional setup path.

Deployment uses reviewed releases. Backups are private; restore verification uses a separate disposable database. A verified manual off-server recovery copy exists, while recurring external backup arrangements remain unfinished. Follow `docs/NATIVE_DEPLOYMENT.md` and the latest sections of `docs/SERVER_READINESS.md` for operating procedures. Never expose environment secrets in screenshots or commit them.

## Limitations every member should understand

The audit still identifies defects involving privileged-account creation, scheduling conflicts, old-year timetable projection, new-offering academic validation and long-title PDF layout. The multibyte initial-password boundary was corrected through shared validation. Passing tests does not close the remaining findings.

A shared attendance code cannot prove physical presence. Approved policies, confirmed teaching assignments and dates, physical-device acceptance, recurring external backups and measured workload testing remain necessary before institutional adoption. SSO, automatic email recovery and fee/coursework clearance are outside the implemented workflow.

The timetable and academic-catalogue ideas were informed by the Android repositories [mylectures-2](https://github.com/mugmarp/mylectures-2) and [mylectures](https://github.com/mugmarp/mylectures). SAMS implements the relevant workflow on the web; it is not those Android applications.

## How each member can prepare

Choose a module using the README allocation. Trace one complete action from page to database and back. Run it locally, explain one invalid case, inspect its relevant test and identify a useful improvement. Review a neighboring module with another member. A PR should explain actual changes, their purpose and verification.

Every member should be able to explain why enrollment is separate from programme placement, why timetable references are separate from dated sessions, how access is restricted, when attendance becomes accepted, how reports count classes and what offline operation cannot guarantee.
