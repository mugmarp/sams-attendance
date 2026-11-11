# Live Postman presentation

The collection is an assessed deliverable: it contains 75 documented requests, saved sample responses and executable success/failure assertions. Run it in order against a **disposable, seeded** database. It creates synthetic accounts, course offerings, enrollments and dated classes; it does not erase them. Every run uses unique identifiers so the collection can be repeated.

## Setup

1. Start PostgreSQL, apply migrations and run `npm run seed` from backend.
2. Start the application with `npm start` from backend. Express serves both the plain frontend and `/api` on port 3000 by default.
3. Import `postman/SAMS.postman_collection.json` and `postman/SAMS.local.postman_environment.json` into Postman.
4. Select the **SAMS Local Demo** environment. Set baseUrl to `http://localhost:3000/api`, or your own running origin plus `/api`.
5. Use the Collection Runner for the complete verification. Tokens and record IDs are captured automatically. The health request initializes a new run ID; do not rerun it halfway through the demonstration.

The collection uses synthetic demo credentials only. Never export real tokens or passwords into Git. Sample responses illustrate shapes; live responses contain newly generated IDs and timestamps.

## Short live presentation (about 8–10 minutes)

| Step | Show | Explain |
|---|---|---|
| 1 | Health request, then the three successful logins | Express is running, PostgreSQL responds, and JWTs identify roles |
| 2 | Wrong password, missing email, missing token and wrong-role requests | 400, 401 and 403 mean different things; the server validates all requests |
| 3 | Create account and course; repeat creation | 201 creates resources, 409 identifies a conflict; the threshold is configurable |
| 4 | Create a current class and open check-in | Only the assigned lecturer/admin can control a valid dated class |
| 5 | Unenrolled check-in, then enrollment, wrong code and valid check-in | Enrollment and code validation happen on the server |
| 6 | Repeat valid check-in | Returns the same record with 200/duplicate=true; safe network retry does not create another attendance row |
| 7 | Close check-in and use its old code as the second enrolled student | A previously valid code no longer authorizes new attendance |
| 8 | Correct attendance with a reason; inspect roster history | Changes retain actor, previous/new status, reason and time |
| 9 | Complete class, view report and download PDF | Completed classes count; 75% in this test is a chosen policy example, not official exam clearance |
| 10 | Show the browser forms and architecture diagram | HTML structure, CSS presentation, JavaScript fetch, Express rules, PostgreSQL persistence |

For the live demo, a second browser profile can sign in as the student while the first remains the lecturer. The browser shows current codes and refreshes the roster. The Postman suite also checks cancelled classes and out-of-time classes. Rotation and exact expiry boundaries have automated backend tests; manually demonstrating rotation requires waiting for the two-minute slot change.

## Expected statuses

- **200:** successful read/action or idempotent attendance retry.
- **201:** new account, offering, enrollment or class.
- **400:** invalid fields/IDs/dates/code, or closed/out-of-time check-in.
- **401:** missing, invalid or expired authentication.
- **403:** wrong role, another lecturer's course, or unenrolled student.
- **404:** a valid-shaped identifier that does not exist.
- **409:** duplicate account/offering/enrollment or conflicting class transition.

Assertions check the status, JSON/PDF content type, meaningful and correctly classified errors, safe account fields, code format, captured IDs, duplicate behavior, correction history and attendance calculations. Body validation still runs in JavaScript through Zod; removing TypeScript does not remove input validation.

## Run outside the Postman GUI

```bash
npx --yes newman@6.2.3 run postman/SAMS.postman_collection.json \
  --env-var baseUrl=http://localhost:3000/api --bail
```

For repeatable assessment testing, use an isolated database named `sams_test`, set NODE_ENV=test and seed it before running. The test mode increases the auth request limit for automated sequences; real deployments retain the normal limit.

## Questions presenters should answer

- What paper process are we replacing, and who benefits?
- What do HTML, CSS, JavaScript, Express and PostgreSQL each do?
- Why is check-in authenticated, enrollment-checked and time-limited?
- Why can a student not become an administrator by editing the frontend?
- Why are passwords hashed and secrets outside Git?
- Why use a transaction and a unique student/session constraint?
- What is the difference between a wrong password, invalid body and forbidden operation?
- Why do future/cancelled classes not reduce attendance? What happens before any class is completed?
- Why does 3/4 pass a 75% policy and fail 80%? Who confirms that policy?
- Why is attendance qualification different from overall examination clearance?
- Why is a saved offline attempt pending rather than proof of attendance?
- What limitations remain: shared codes, institutional approval, account recovery/revocation and public hosting?


## Optional offline/reconciliation presentation

The final 22 requests exercise the Phase 2 API after the original core workflow: prepare a roster, accept/replay a saved mark, reject changed content under one operation ID, generate a stale-version conflict, inspect a current REVIEW preparation and apply a deliberate linked correction. A separate class demonstrates an uncounted student claim, ownership/role restrictions, atomic lecturer approval, duplicate decision replay and stale-decision rejection.

Explain that a 200 response from /sync/operations means the batch was processed; each result has its own outcome. Demonstrate actual disconnected use in the browser: prepare, disconnect, save locally, reload, reconnect. Postman verifies the server contract but does not itself establish offline browser usability. The full collection currently passes 75 requests and 241 assertions on isolated synthetic data.
