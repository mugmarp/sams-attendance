# Student Attendance Management System (SAMS)

**Course:** SWE2106 — Internet Technologies and Web Design, E-tivity 5  
**Team:** Group B  
**Registrar process:** Class attendance  
**Revision date:** 11 November 2026  
**Submission/presentation target:** 12 November 2026

This is the current implementation-aligned revision of the earlier SAMS and Digital Class Attendance System proposals. It does not backdate submission or claim that institutional requirements have already been approved.

## 1. Problem and discussion

Paper attendance registers take lecture time, can be misplaced or damaged, and require manual consolidation across many classes. Proxy signing and unexplained corrections can undermine confidence in records. Students may discover low attendance late, while lecturers and registrar staff have difficulty reconciling totals and handling disputes.

The proposed improvement is one persistent, dated attendance record per student and class, controlled by the assigned lecturer. A student submits a short-lived code through an authenticated account. The server verifies course enrollment, class timing and the current code, then records attendance. Lecturers can correct genuine exceptions with a reason; the previous status, actor and change time are retained.

A code is shareable and cannot prove physical presence. Rotation, limited windows, enrollment checks and lecturer oversight reduce some misuse, but do not eliminate impersonation. Benefits and policy assumptions need confirmation with the Registrar and pilot lecturers; no measured institutional efficiency gain is claimed yet.

## 2. Users

| User | Responsibilities | Needs |
|---|---|---|
| Student | Sign in, check into enrolled classes, view own attendance | Fast mobile form, clear confirmation, understandable pending/failed states |
| Lecturer (EXAMINER role in the API) | Create dated classes for assigned offerings; open/close check-in; review roster; complete/cancel classes; correct records; view/export own course report | Minimal classroom steps and a defensible correction history |
| Registrar/department administrator (ADMIN) | Provision accounts, create course offerings, enroll students, choose a threshold, review reports and export PDFs | Consolidated and correctly scoped attendance data |

Department oversight is represented by the administrator role for this phase. A separate HoD approval workflow is deferred.

## 3. Objectives

1. Replace paper class registers with persistent digital records.
2. Allow a student to check in quickly on a phone; under 30 seconds is a usability target to measure, not a claimed benchmark.
3. Reject unauthorized, unenrolled, malformed and out-of-window requests.
4. Keep a single attendance record despite retries or simultaneous submissions.
5. Calculate attendance for completed classes within a specific course offering.
6. Make corrections traceable and give authorized staff clear course-level reports.
7. Demonstrate the workflow using a JavaScript Express API, a live PostgreSQL database, plain HTML/CSS/JavaScript pages and an executable Postman collection.

## 4. Scope and decisions

### In scope

- Three authenticated roles, hashed passwords and role/ownership checks.
- Administrator account, course-offering and enrollment creation.
- Lecturer class creation, session-code check-in, closing, completion and cancellation.
- PRESENT, LATE, ABSENT and EXCUSED statuses; reasoned lecturer corrections and their change history.
- Student attendance summaries, lecturer/registrar reports, below-threshold filtering and PDF export.
- Configurable threshold at offering creation; the default 80% is demonstration configuration, not a verified university policy.
- Runtime input validation, meaningful status codes and safe response fields.
- A live relational database, plain browser frontend, migrations, setup instructions and documented Postman success/failure cases.
- Device-local offline attempts with honest pending/failed states; no backdating from a client clock.

### Deferred

- Separate HoD excuse request/approval, bulk marking, a fixed 48-hour edit limit and configurable weighting of excused absence. These need agreed policy and would expand the core demonstration.
- Biometrics, QR/GPS verification, native mobile apps, SMS/email and university-system integration.
- Automated conversion of weekly timetable slots into semester attendance.
- Fee/coursework clearance, examination results, transcripts and graduation workflows.
- Institutional SSO, self-service password recovery and refresh-token revocation.

Individual-member contribution evidence is outside this implementation task as requested; this document does not invent it.

## 5. Core workflow

1. The administrator provisions lecturer/student accounts, creates an offering and enrolls students.
2. The assigned lecturer creates a dated class with start/end times and venue, using Kampala time.
3. During the class, the lecturer opens a check-in window lasting up to ten minutes and capped at class end. The code changes every two minutes.
4. The student selects the class and submits the code. The server checks identity, enrollment, timing and the current code.
5. Attendance is recorded once. Retrying a successful code submission returns the existing entry instead of creating a duplicate.
6. The lecturer reviews the live roster and records corrections with a reason. Completing the class makes it count toward reporting; cancelling excludes it.
7. The student sees their own summary. The lecturer and registrar view course reports and can export a prototype PDF.

## 6. Attendance policy used by the prototype

A course offering is unique by course code, academic year and semester. Only completed classes form the denominator. PRESENT and LATE count as attended; ABSENT, EXCUSED and missing records do not. Future/scheduled and cancelled classes are excluded. With zero completed classes the result is **not assessed**.

The threshold comparison uses exact counts before rounding for display. The administrator can set a threshold from 1 to 100 when creating an offering. For example, 3/4 meets a 75% threshold but does not meet 80%. The 75% suggestion in the first proposal and the inherited 80% setting are both treated as configurable examples pending confirmation.

The report says **attendance requirement met**, not final examination eligibility: the system does not hold fee or coursework clearance. The exported PDF is not presented as an approved Appendix D register.

## 7. Technical solution

| Layer | Implemented choice | Reason |
|---|---|---|
| Frontend | HTML pages, authored CSS, browser JavaScript modules and fetch | Directly demonstrates the requested web fundamentals; no React/JSX/TypeScript frontend |
| Server | Node.js 22 and Express, written in JavaScript ES modules | One server exposes the API and serves the frontend without compilation |
| Database | PostgreSQL with Prisma's JavaScript client | Existing tested relational model, unique constraints, transactions and migrations |
| Security | JWT, bcrypt, server-side authorization and environment secrets | Keeps account credentials and attendance decisions on the server |
| Validation | Zod runtime schemas plus database constraints | JavaScript still validates untrusted requests after TypeScript removal |
| Tests | Node test runner, Supertest, Postman/Newman and Playwright | Validates the API, assessed collection and browser journeys |
| Deployment | One application container plus PostgreSQL; optional HTTPS reverse proxy | Simple startup and fewer moving parts |

MongoDB Atlas was suggested in the proposals, but the assignment permits a database choice. Changing the verified relational database is unnecessary for a JavaScript migration. The database is live during the demonstration; public cloud hosting is a separate deployment decision.

See `architecture.svg`, `API_SPEC.md` and `POSTMAN_DEMO.md` for design and demonstration details.

## 8. Expected benefits and limits

Expected benefits include less classroom administration, immediate confirmation, easier consolidation, earlier visibility of low attendance and a clearer basis for resolving disputes. Actual time savings and acceptance must be measured in a pilot.

Production-readiness foundations include environment-based secrets, hashing, validation, authorization, transactional writes, unique constraints, migration-before-start ordering, loopback service bindings and audited corrections. Before real institutional use, the deployment needs approved policy/retention, backups and restore drills, HTTPS, account recovery/revocation, monitoring and institutional approval. A passing classroom demonstration is not a production certification.

## 9. Test and presentation plan

The Postman collection is run against synthetic data and covers successful and invalid requests with expected status/body assertions and saved example responses. Cases include wrong passwords, missing/malformed tokens, role violations, missing fields, duplicate account/offering/enrollment creation, malformed IDs/codes, unenrolled students, closed codes and classes outside their time window. Code expiry/rotation and concurrent submissions also have automated backend tests.

Meaningful statuses include 200 for successful reads/actions and safe check-in retries, 201 for newly created accounts/offerings/enrollments/classes, 400 validation, 401 authentication, 403 authorization, 404 missing resources and 409 creation conflicts. See `POSTMAN_DEMO.md` for a short live demonstration and questions every presenter should be able to answer.

## 10. Delivery checklist

- [x] One registrar process and a current problem/users/objectives/scope/solution proposal.
- [x] JavaScript Express API connected to PostgreSQL and plain HTML/CSS/JavaScript frontend.
- [x] Positive/negative Postman requests, assertions, sample responses and environment file.
- [x] Setup, API reference, design and presentation runbook.
- [ ] Confirm policy, hosting and submission expectations with the lecturer/Registrar.

The original proposal date was 10 November 2026. This revision is dated honestly; the API, collection, frontend/database integration and live presentation are targeted for 12 November 2026.
