# Navigation startup correction — 17 November 2026

## Problem and change

The [16 November live diagnosis](LIVE_NAVIGATION_DIAGNOSIS_2026-11-16.md) found that fast cached assets did not prevent a long wait: the page waited for identity verification, automatic course setup, and class data in sequence. A sampled identity request alone took 4,054 ms, including 2,507 ms establishing its connection. Separate origin-side requests were much faster. These samples do not establish every user's connection speed or a complete click-to-paint duration.

The destination now renders cached navigation, its heading and an explicit loading status before waiting for the network. This preview contains no attendance form, class data or protected actions. The verified server identity still controls access to the actual page. Revoked sessions and changed roles cannot reveal its forms. The loading observer respects the verification gate.

An authenticated POST `/api/auth/workspace` combines current identity, server time, compulsory-course reconciliation and the initial student day or attendance summary. This removes the previous serial request chain. Initial data is saved through the existing user-scoped offline snapshots; later refreshes use the established endpoints. Cached common modules without the optional bootstrap export remain compatible with the new student module. Service-worker shell cache advances to v13.

`Server-Timing` reports workspace controller processing separately from network latency. It excludes authentication middleware. This change does not eliminate connection establishment or guarantee instant fresh data on a slow connection. It allows the destination to appear while that work proceeds and removes avoidable network round trips.

## Verification

Backend: 68 tests passed against isolated PostgreSQL after the final POST contract. Postman/Newman: 139 requests and 367 assertions passed; the four added cases cover day, summary, invalid view and missing authentication. No mutating collection was run against the hosted database.

Browser verification includes held responses for empty, active and failed class states; a visible destination preview with protected content hidden; one initial data request; revoked and changed-role sessions; offline storage and recovery; and mixed cached module compatibility. The final clean run passed all 47 browser tests, including the optional-export compatibility check. Backend and frontend JavaScript syntax checks and Git whitespace checks passed.

An intermediate browser run exposed an existing recovery timing mismatch: reload can abandon a renewable 30-second cross-tab outbox lease, while the assertion allowed only 15 seconds. The check now allows expiry plus the three-second retry (45 seconds total); duplicate protection was retained. Another run used accumulated local fixture classes and failed an ambiguous course-link selector. Reseeding alone preserved those dated fixture classes; the isolated test schema was then recreated and verification ran in sequence: backend, seed, Postman, browser. Interrupted local runs also found the database process stopped; the final browser command kept the database in the same supervised run. Those infrastructure failures are not counted as successful test runs. Private traces and command logs remain outside Git under the local workspace.

## Release status

Activated source commit `d3a59bd56f4943c0dec5a19fdc55f84d07e8e7a8` through the saved Termix VPS connection on 17 November 2026. The previous application remains available for rollback. A private pre-release database dump was created at `/var/backups/sams/before-release-20261117T024053Z.dump`. No database migrations were pending. The service reported active, zero restarts and 110,071,808 bytes of current memory after activation.

The release smoke check passed HTTPS sign-in, current identity and scoped reads for registrar, lecturer and student. Ten HTTPS health/database requests at concurrency five passed (median 24 ms, maximum 58 ms). These origin-side samples are not client navigation timings or capacity evidence. The initial refused loopback connection occurred during service startup; readiness then passed.

The Codex in-app browser initially reloaded the old cached modules, then its next navigation automatically used the new workspace request. The live My attendance workspace response returned HTTP 200 with response headers at 326.056 ms and `Server-Timing: workspace;dur=20.2`. Its cached document response headers arrived at 3.578 ms and common module at 5.049 ms. These are individual request samples on a reused connection, not click-to-paint or a matched before/after benchmark. The serial identity/setup requests were absent from this summary startup capture. Check in subsequently displayed the correct scoped timetable with the code form absent when no class was open. A browser-control timeout interrupted that trace; no Check in request duration is claimed.

No live attendance marks were submitted and no live fixture reset or seed was run. Controller time, full network latency, automation call duration and visible paint remain distinct. The deployed change addresses avoidable round trips and delayed destination layout; it does not establish that every device/network will now feel fast.
