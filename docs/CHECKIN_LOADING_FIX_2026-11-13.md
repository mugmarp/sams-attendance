# Student Check in loading correction

13 November 2026 · SAMS · Group B

The student Check in page briefly displayed the attendance-code form before its class responses arrived. An empty response then replaced that form with “No class in progress.” The earlier workspace loading gate checked account and layout readiness, rather than readiness of the class view.

## Change

The code-entry form now starts hidden in HTML. The check-in section displays “Loading your classes…” and exposes `aria-busy="true"` until the initial class request settles. Successful class data renders the appropriate current/next state and clears the loading message. A failed initial request shows a connection/error explanation, keeps the form hidden and does not invent an empty timetable.

Input and submit handlers are attached before class loading can reveal attendance actions. Attendance-review requests load independently, so a delayed secondary panel does not hold up the main class request. Existing valid class content remains visible during background refreshes. The service-worker cache advances to v11 so installed clients can obtain the updated student module.

This is a correction to initial class loading. The wider navigation audit's repeated reconciliation, duplicate endpoints, polling races, service-worker navigation strategy and remaining optimization proposals are separate work. Attendance acceptance, enrollment rules, code expiry, offline queue contents and database schema are unchanged.

## Verification

Three new browser cases independently hold the class response while attendance reviews remain pending. They establish that the primary class request starts without waiting for reviews and that neither a code form nor a false “No class in progress” message appears during loading. Releasing the response verifies:

- An empty day shows “No class in progress” with the form hidden.
- An active class reveals the correct form with its submit handler already attached.
- An HTTP failure shows a load error, keeps the form hidden and does not show an empty-day result.

The existing static-markup test now includes `/student/checkin`. All seven focused loading tests and frontend JavaScript syntax checks passed locally. Full browser regression and live deployment results are recorded below after execution. No attendance is submitted during live acceptance.

The first full-suite launch omitted `SAMS_E2E_DATABASE_URL`: database-backed suites correctly refused to run against an unspecified database (7 setup failures, 16 cases not run, 19 passed). The corrected launch explicitly selects the isolated local `sams_test` database. This was a test invocation error, not a product failure.

The corrected full browser run passed **42/42 tests** in 2.9 minutes, including the three new loading cases and all earlier attendance, account, offline-register, queue, course-plan and timetable journeys. Frontend syntax and diff whitespace checks passed. Backend/API code was unchanged; the prior backend/Postman totals are not a new execution claim.

## Live deployment and installed-client acceptance

Release `916a7524ec149f758e2d4834639713d7dfd2a63e` is deployed on the native VPS. The activator created `/var/backups/sams/before-release-20261113T110706Z.dump`; all ten existing migrations were already applied. Activation passed administrator, lecturer and student HTTPS sign-in/scoped-read smoke checks and ten health checks (server-origin median 24 ms, maximum 33 ms). The service was active, with zero automatic restarts and approximately 112.5 MiB process memory at acceptance. These health measurements are separate from the earlier client-origin navigation benchmark and are not a capacity test.

In the Codex in-app browser, an existing installed student tab initially received new HTML while retaining its older cached module and displayed the application-update notice. Its old module left the new class-loading message visible after rendering; selecting **Reload application** loaded the updated client. The resulting page had the code form hidden, the loading status hidden and `aria-busy="false"`, with the correct personal timetable rendered. Existing installed tabs should use the update notice to pick up this release. No storage clearing or attendance submission was performed. The controlled delayed-response tests establish the transient-state behavior; the live final-state check alone does not measure every rendered frame.

Live acceptance screenshot is saved on the operator PC as `sams-audit-output/checkin-loading-fixed-live-20261113.png`. The wider navigation optimizations remain open.
