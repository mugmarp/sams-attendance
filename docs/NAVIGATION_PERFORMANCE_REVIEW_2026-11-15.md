# Navigation performance follow-up

15 November 2026 · SAMS

Follow-up: [Implemented navigation improvements](NAVIGATION_PERFORMANCE_FIXES_2026-11-15.md) records the subsequent fixes, executed checks, controlled timing comparison and live release. The audit below describes the preceding revision.

## Result

The loading correction deployed on 13 November corrected the premature attendance form. It did not remove the main navigation bottlenecks. The current source still contains serial startup waits, repeated enrollment reconciliation, duplicate class reads and network-first page-shell navigation. Fresh live samples also show intermittent slow responses affecting static files and tiny API responses as well as student-day processing.

This audit makes no runtime changes. No attendance or class actions were performed. One existing synthetic practice account was used for bounded HTTPS samples. Login and the existing course-setup endpoint execute their normal idempotent reconciliation; these are not strictly read-only endpoints. Credentials and personal response bodies are excluded from the evidence.

## Fresh measurements

Three requests per path, using a persistent Python requests session from the execution environment. Values include network/proxy effects and response download; they are not isolated server processing times or browser click-to-render timings. Three samples cannot establish production percentiles or capacity.

| Path | Median | Observed range |
| --- | --- | --- |
| `/student/checkin` | 517 ms | 245–2545 ms |
| `/js/common.js` | 1622 ms | 324–1764 ms |
| `/api/health` | 233 ms | 223–262 ms |
| `/sw.js` | 246 ms | 233–281 ms |
| `/auth/me` | 253 ms | 227–550 ms |
| `/student/day` | 621 ms | 303–2259 ms |
| `/student/sessions/upcoming` | 269 ms | 263–362 ms |
| `/student/attendance-claims` | 270 ms | 237–1968 ms |
| `/student/course-setup` | 278 ms | 236–1507 ms |

The first HTML request may include connection/TLS establishment; subsequent samples are warm session requests. The common module was 8,535 decoded bytes and returned no Content-Encoding in these requests, whereas HTML was gzip encoded. This is a secondary transfer/cache configuration candidate, not proof that compression would fix seconds of latency. The 2-byte review response also took 1,968 ms once. Small response sizes therefore do not rule out substantial wait time.

The live Codex browser opened the student Check in page behind “Loading SAMS…” and later rendered the correct personal day. Navigation to My attendance completed and displayed the student's summary. A network-capture attempt timed out in the automation tool and its runtime reset; no complete browser waterfall was retained. That tool timeout must not be reported as the site's navigation duration.

Direct SSH to the known VPS timed out. Current CPU, memory pressure, filesystem headroom, PostgreSQL waits and Nginx upstream timings were not obtained in this follow-up. Earlier server figures are historical, not current observations.

## Confirmed causes in the current source

1. **The whole workspace waits for unrelated startup work.** `common.js:init()` awaits identity, then health/clock synchronization, then POST course setup on most student pages before constructing navigation. A user cannot get the next page's header promptly even when its primary data has not started loading. The current median endpoint samples imply about 764 ms for these three network stages alone, before HTML/modules and primary content. Adding the median day-request duration gives roughly 1.39 seconds of network stages for Check in. This is an illustrative sum of separate measurements, not a recorded navigation duration. Slow samples can amplify it considerably.
2. **Enrollment reconciliation remains a navigation operation.** Login already reconciles courses. Page transitions repeat it. The transaction locks the student row, reads/locks the current plan and queries existing enrollment links individually. A no-op result still consumes database time and a connection. Preserve withdrawals, plan versions and effective dates, but replace repeated full reconciliation with a server-validated unchanged-plan fast path. Moving the same expensive POST into the background alone would hide its wait while retaining its load and potential ordering races.
3. **Check in duplicates class data and startup refreshes.** It reads both `/student/day` and `/student/sessions/upcoming`; day already contains classes. After its first render it calls `flush()`, which refreshes reviews and those class endpoints again even with no pending work. Focus triggers both loadClasses and flush, producing further repeated reads. Consolidate only after resolving their slightly different result limits and offline snapshot contracts.
4. **Refreshes can overlap and arrive out of order.** Class polling runs every ten seconds without a shared flight or generation guard; focus/online triggers can overlap it. Review polling continues in hidden tabs. At baseline the visible Check in timers schedule about 16 read requests per minute before extra events. Refresh coalescing and hidden-tab suspension reduce load and stale replacement risks while keeping foreground check-in updates timely.
5. **Installed navigation still waits for the network.** `sw.js` uses network-first document loading and only returns the cached shell when fetch rejects; it has no bounded fallback. The application can already have its HTML cached and still wait for a stalled request. Scripts are cache-first, creating a separate mixed-version transition problem. Browser HTTP responses use `public, max-age=0`, so a client not yet controlled by the worker also revalidates assets. Cached HTML contains the shell rather than personal API data; optimize that shell with a coherent release strategy, retaining API authorization and pending queues.
6. **Timetable serializes reference work ahead of operational classes.** Calendar, reference, possible second reference for a resolved group, then dated classes are awaited in turn. Determine the initial student scope before requesting the reference and load dated classes independently.
7. **Work continues even when only the countdown changes.** Student renderDay rebuilds profile, class cards and timetable markup every second. This is unnecessary DOM work, especially on phones. Patch countdown/progress values separately. No CPU or long-task trace was captured, so it is not yet established as the dominant cause of navigation stalls.

## Server-side candidates needing measurements

The native configuration sets a Prisma pool limit of three connections and a ten-second pool timeout. This is deliberate resource containment on the small VPS, but repeated reconciliation transactions and polling can queue behind it. The configuration does not establish that the pool was saturated during these samples. Do not simply increase the pool on a roughly 1 GB server.

`studentDay()` sequentially loads profile, sessions, the current publication JSON and calendar, then projects weekly references. Per-request whole-publication loading/filtering is an optimization candidate. Bound and invalidate reference caches by publication version; personal class responses must not enter a shared public cache. Identity currently performs a database check in middleware and another in the identity controller; any reuse must preserve deactivation and auth-version revocation.

Instrument Nginx request time and upstream response time, sanitized Express route durations and database pool/query waits. Compare slow static requests with slow API requests at the same time. High upstream time suggests application/database investigation; low upstream time with high total client wait suggests network/proxy/connection investigation. Correlate CPU, swap activity and disk pressure before attributing the delay to RAM. Logs must exclude passwords, tokens and attendance codes.

## Implementation sequence

1. Remove the serial clock dependency from unrelated content, preserving an explicit clock-ready state for time-sensitive UI. Keep fresh identity/role validation; provide a server timestamp with a response already needed by startup where practical.
2. Implement the server-validated course-setup fast path and retain full reconciliation when term, placement or published plan changes. Course setup should not be repeated in full on every navigation.
3. Consolidate the primary class response, coalesce refresh triggers and avoid the empty-queue startup refresh. Guard against late responses overwriting newer state.
4. Load dated timetable classes independently; reduce repeated reference requests and one-second structural DOM rebuilding.
5. Make known cached page shells available promptly with a version-consistent service-worker update strategy. Add navigation feedback immediately on ordinary link clicks without intercepting modified clicks, downloads or form work. A framework rewrite is not a prerequisite.
6. Capture before/after click-to-shell, primary-data-ready and action-ready durations on the same connection, including warmed installed navigation, first visit, slow connections and offline entry. Add deliberate latency to health, setup and reference independently so tests prove that unrelated waits no longer block content.

Acceptance should include no attendance-form flash, no redundant initial class fetch, one in-flight refresh per view, correct new-plan reconciliation, retained withdrawals and pending operations, safe old/new client upgrades, and no weakened authentication. Repeat the existing browser suite after implementation. No regression-suite rerun or performance improvement is claimed by this audit.

## Evidence

[Sanitized live samples](test-reports/2026-11-15-performance.json). Source audited at `3defc85`. Related earlier reports: [navigation audit](NAVIGATION_PERFORMANCE_AUDIT_2026-11-13.md) and [loading-state correction](CHECKIN_LOADING_FIX_2026-11-13.md).
