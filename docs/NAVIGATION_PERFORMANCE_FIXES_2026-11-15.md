# Navigation responsiveness improvements

15 November 2026 · SAMS

## Changes

The workspace header/navigation now appears after identity/role validation, without waiting for clock synchronization or student course reconciliation. Health sync runs independently, updates the visible clock when it completes and retains a five-minute tab-session clock estimate across navigation. Attendance is still accepted using server time. Student class/summary and dated timetable reads explicitly await reconciliation, so fast navigation does not display pre-setup academic results.

Check in now reads its classes from `/student/day` alone. The endpoint's former 100-session limit is removed to retain the established upcoming endpoint's complete enrolled-session semantics. The legacy endpoint remains available to older clients. Existing day snapshots already contain classes and remain compatible; user-scoped queue/receipt stores are preserved.

Class refreshes share one in-flight promise. Focus/online/poll requests cannot overlap that class read and overwrite it out of order. Empty offline queues do not trigger a second startup class refresh, while pending work still synchronizes. Review polling pauses in hidden documents. Course reconciliation bulk-reads retained enrollment decisions instead of querying each selected course individually; row locks, plan validation, withdrawals, confirmation versions and effective dates remain protected.

Known installed navigation routes now use HTML shells from the current v12 service-worker cache immediately, matching cached modules to that release. APIs and unknown routes are not intercepted as shells. Normal identity validation remains in the client and every protected API. When the browser reports offline, existing cached identity and labelled saved student data are available without waiting for network timeouts; this continues the existing offline access model and does not confer server authorization. Missing saved data produces a reconnect explanation.

Dated timetable loading starts independently of calendar/reference loading, and primary navigation links give immediate opening feedback. Modified clicks and other normal link behavior are preserved.

## Executed checks

- Backend: **65 passed** against an isolated local `sams_test` database.
- Browser: **44 passed** in 2.5 minutes, including prior attendance, account, course-plan and offline journeys.
- Postman/Newman: **135 requests, 351 assertions, zero failures** against the local test application. The full token-bearing report remains private.
- Frontend/backend JavaScript syntax and diff whitespace checks passed.

New delayed-response coverage holds health and course setup: the workspace becomes usable, primary class reads wait for reconciliation, and focus/online triggers share one held class request. No legacy upcoming read or empty-queue second read occurs. A service-worker harness verifies that a known cached shell resolves even with a never-settling network fetch and that API/unknown paths are left alone. Existing real-browser offline tests continue to pass.

## Controlled timing comparison

Three local runs per version injected 800 ms into health and setup and 300 ms into student day, with the service worker blocked. Both variants used the new student module; only common.js startup was varied, with a compatibility export on the prior module. This isolates startup ordering, not the full prior release or installed-cache benefit.

| Measurement | Prior startup median | Revised startup median |
| --- | --- | --- |
| Workspace navigation visible | 2,530 ms | 207 ms |
| Primary class content ready | 2,792 ms | 1,511 ms |

[Sanitized individual samples](test-reports/2026-11-15-navigation-controlled.json). Artificial delays and the local environment make these a controlled demonstration, not a promise of live phone latency.

## Scope and remaining work

This release reduces repeated enrollment lookups but does not implement a lock-free, version-token course-reconciliation shortcut. Initial primary data still waits for reconciliation; new registrar publications remain checked. Whole-publication projection and one-second structural timetable rendering remain optimization candidates. Intermittent live network/proxy/server delay needs correlated request/upstream/database timing before attributing it to RAM or changing the three-connection pool.

New v12 clients use cached shells immediately; already-open older clients retain their loaded code until the application-update reload. First visits still need network access. Browser-reported online status cannot detect every stalled connection, so the existing network timeout/fallback remains relevant when it reports online incorrectly. No storage clearing or password reset is required.

## Deployment

Pending at the source commit. The follow-up entry records the exact release, backup and live acceptance after activation.
