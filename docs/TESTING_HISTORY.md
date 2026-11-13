# SAMS testing history and API evidence

This index identifies the retained verification records and executable tests. It is not a claim that every early local command or abandoned test run was archived. The dated records below distinguish historical baselines, current checks and live-host verification.

## Where to find the evidence

| Evidence | Location | What it establishes |
| --- | --- | --- |
| Backend/API test code | `backend/tests/api.test.js` and other `backend/tests/*.test.js` | Requests run against Express and an isolated PostgreSQL database; assertions cover authorization, validation, attendance rules, account lifecycle, course setup and reporting. |
| Browser test code | `frontend/tests/` | Real browser journeys, including attendance, offline storage/replay, account recovery, timetable review, course-plan publication and elective confirmation. |
| Postman collection | `postman/SAMS.postman_collection.json` | Documented successful and invalid requests, response examples, captured IDs/tokens and executable assertions. |
| Postman environment template | `postman/SAMS.local.postman_environment.json` | Local setup; hosted credentials are not included. |
| Latest sanitized API run totals | `postman/verification-summary.json` | Request/assertion counts and zero/nonzero failure totals without tokens or credentials. |
| Dated validation journal | `docs/VALIDATION.md` | Historical implementation milestones and their checks/limits. |
| Current run summary | `docs/test-reports/2026-11-13-course-setup.json` | Sanitized backend, browser and Postman results for the course-setup release. |
| Hosted checks | [GitHub Actions](https://github.com/mugmarp/sams-attendance/actions) | Per-commit workflow status and retained logs/artifacts. The retention period is controlled by GitHub; artifacts do not remain forever. |
| CI definition | `.github/workflows/ci.yml` | Reproducible migrations, syntax, backend, browser, API and packaged-runtime checks. |
| Live deployment/restore evidence | `docs/SERVER_READINESS.md` | Bounded HTTPS smoke tests, release IDs, backup restoration and operating measurements. These are separate from destructive fixture tests. |

## Recorded milestones

| Date | Recorded verification | Evidence |
| --- | --- | --- |
| 11–12 November 2026 | JavaScript migration, offline-register and timetable work: 44 backend tests; browser milestones grew through 22 and 25; Postman baseline reached 106 requests / 301 assertions. | Earlier sections of VALIDATION.md. These totals describe those revisions. |
| 12 November 2026 | Account-management baseline: 51 backend tests, 33 browser tests, 129 Postman requests / 337 assertions. | Account-management section of VALIDATION.md and ACCOUNT_MANAGEMENT.md. |
| 12 November 2026 | Readable generator checks: 53 backend tests; revised password policy: 54 backend tests. Private provisioning/reset checks verified bcrypt values, permissions and retained academic records. | Later sections of VALIDATION.md and SERVER_READINESS.md. |
| 13 November 2026 | Registration/course-plan and Kampala-date work: see the latest sanitized run summary for final executed totals. | `test-reports/2026-11-13-course-setup.json`. |

## What API testing means here

Node/Supertest sends HTTP requests directly through the Express app and checks database effects. It covers successful requests and rejections such as missing identity, wrong role, malformed input, duplicate operations, expired/closed attendance windows, stale changes and invalid course-plan selections. Service/unit tests check smaller rules such as programme duration and password boundaries.

Postman can be used interactively during the presentation. Newman runs the same collection automatically. Tests check status codes, JSON shapes and business results, not merely whether the server responded. Requests capture tokens and generated IDs for later steps. New course-plan cases cover setup responses, missing confirmation versions, attempts to choose another student and registrar-only access. The browser journey additionally executes source offering import, publication, cohort assignment and student elective confirmation end to end.

## Reproduce safely

Follow README setup commands, using a separate disposable `sams_test` database. Apply migrations before testing. Backend fixtures clear test data. Seed the local sample accounts after backend tests, start the test server and run browser/Newman checks against that server. Never run the mutating collection or fixture suites against the live pilot.

```bash
npm run check --prefix backend
npm run check --prefix frontend
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sams_test npm test --prefix backend
# After reseeding and starting the separate test server:
npx --yes newman@6.2.3 run postman/SAMS.postman_collection.json \
  --env-var baseUrl=http://localhost:3001/api --bail
```

README documents browser configuration and complete environment setup. Credentials in the command above are placeholders.

## Limits and missing evidence

Passing suites do not close every audit finding. Privileged account creation, scheduling-conflict validation, academic offering validation and long-title PDF layout still require their recorded fixes. Physical Android installation/offline acceptance and measured attendance-burst capacity are not established by these runs. A simulated offline browser journey is not a physical-phone acceptance test.

Full Newman JSON reports contain working test tokens and request bodies; they are kept private. The committed summary excludes them. Test durations and local PostgreSQL versions may differ from the VPS; record the actual environment rather than claiming production capacity. Failed intermediate local runs are not erased by a later pass, but only retained failure evidence can be inspected retrospectively.
