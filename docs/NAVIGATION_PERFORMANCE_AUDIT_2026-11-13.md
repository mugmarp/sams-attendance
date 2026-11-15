# Navigation responsiveness and class-loading audit

13 November 2026 · SAMS · Group B

**Follow-up:** [Student Check in loading correction](CHECKIN_LOADING_FIX_2026-11-13.md) addresses the initial form flash, action-handler readiness and review-request dependency described below. The audit records the earlier revision; other performance findings remain open. See the follow-up for executed verification and deployment status.

## Conclusion

The reported check-in flash is reproducible. The application reveals a code-entry form before it knows whether an enrolled class is happening. When the class response arrives, it hides the form and displays “No class in progress.” This is one page changing state after asynchronous work, rather than navigation to a second page.

The noticeable navigation wait also has a concrete cause: each student page repeats a chain of dependent network requests, including course reconciliation and attendance-review requests that delay the primary view. Full-document links restart that chain. The service worker caches scripts but still waits for the network on navigation. A faster server alone would not correct the state flash or remove these round trips.

The earlier page-loading fix remains useful for authentication and wrong-role redirects, but it does not establish that a page's class data is ready. These newly recorded issues remain **open**. This audit changes documentation and retains sanitized evidence; it does not deploy runtime changes.

## Evidence and limits

Source inspected: `485dba6e1ea3a48aba8c67cea165460a897379b7`. Current deployed application release: `f7626bfac94f7a24a3c3c35c950ccc6470474006`.

An isolated local browser used the existing seeded student, with class responses replaced by an empty synthetic result. Holding `/student/day` produced these observations:

| Observation | Before releasing class data | After releasing class data |
| --- | --- | --- |
| Workspace visible | Yes | Yes |
| Code-entry form visible | Yes | No |
| “No class in progress” visible | No | Yes |

The probe added 200 ms to other startup APIs to make ordering observable. Its elapsed times are **not live latency measurements**. It submitted no attendance. The sanitized request sequence and state assertions are retained in [the reproduction evidence](test-reports/2026-11-13-navigation-reproduction.json).

A separate bounded live HTTPS probe used one existing synthetic practice student and three samples per endpoint, with a persistent HTTP session. Course reconciliation inserted zero enrollments. No attendance, class or check-in window was created. These are client-observed request times, including network/proxy effects; they do not isolate database or Express execution time.

| Endpoint | Median | Observed range | Response body bytes |
| --- | --- | --- | --- |
| `/auth/me` | 189 ms | 152–221 ms | 355 |
| `/health` | 205 ms | 198–205 ms | 76 |
| `/student/course-setup` | 238 ms | 226–253 ms | 2,228 |
| `/student/attendance-claims` | 165 ms | 142–204 ms | 2 |
| `/student/sessions/upcoming` | 205 ms | 145–205 ms | 3,593 |
| `/student/day` | 205 ms | 170–265 ms | 10,662 |
| `/student/attendance/summary` | 147 ms | 145–649 ms | 3,885 |

One sign-in took 1,070 ms. It includes password verification and course reconciliation, so it is not directly comparable with a read endpoint. Three samples are insufficient for reliable percentile or capacity claims. [Full sanitized samples](test-reports/2026-11-13-navigation-live-api.json) are retained.

The Codex in-app browser was also used to navigate the live lecturer workspace from Timetable to My classes. Captured requests included identity at 160 ms, health at 257 ms, the first dated-class request at 706 ms and courses at 192 ms. Later class polls took 153 and 263 ms. The event buffer reported truncation: this is partial corroboration, **not** a complete click-to-render trace or a student-browser timing measurement. Automation tool execution time is not page latency.

There is no production load test, physical-phone measurement, CPU profile or database query-duration trace in this audit. The VPS has about 897 MiB RAM and limited disk headroom, but the present evidence does not establish memory, CPU, PostgreSQL or disk as the dominant source of this navigation wait.

## Findings

### 1. Check-in actions appear before class state is known — high priority

In `frontend/public/student.html`, `#checkin-form` starts visible inside the initially hidden check-in section. In `frontend/public/js/student.js`, initialization reveals that section before awaiting `loadClasses()`. Only `renderDay()` later decides whether to hide the form. If loading fails, the initial form can remain alongside the error without a resolved class state.

The submit handler is attached after the initial class and queue loads, which also leaves an interval where the rendered controls are not fully initialized. Existing required-field validation may prevent submission in that interval; this audit did not establish a successful unintended submission. Controls should nevertheless remain hidden or disabled until handlers and a valid target are ready.

The current form visibility condition checks ongoing classes and prior attendance, rather than whether the lecturer has an active window. A scheduled class in progress can therefore show an apparently usable form while its accompanying card says check-in is closed. An offline pending attempt and a live open window require distinct explanations; the server must remain the acceptance authority.

Required states are: loading, live class/window open, ongoing class/window closed, no current dated class, already recorded, saved/offline data, and load failure. An empty result must never stand in for a failed or unfinished request. Weekly reference activity must remain separate from a dated attendance class.

### 2. Student startup serializes six requests into five stages — high priority

The present path is:

```text
document/modules
  → identity (/auth/me)
  → clock (/health)
  → course reconciliation (POST /student/course-setup)
  → review requests (/student/attendance-claims)
  → upcoming sessions + student day (parallel)
  → class rendering, queue rendering, action-handler attachment
```

The measured endpoint medians sum to approximately **1.0 second** along these five network stages, before document/module loading, local storage and rendering. This is an estimate from separate endpoint samples, not a measured browser navigation duration. A delayed or timed-out nonessential request can make it considerably worse.

`common.js:init()` blocks workspace creation on clock sync and course setup after identity verification. `student.js` then waits for attendance reviews before the primary class view. Reviews should load independently. Clock synchronization should start early and retain an explicit readiness/staleness state, without serially delaying unrelated page content. Do not trade correct Kampala-time decisions for a faster but misleading interface.

`api.js` permits 10 seconds per fetch, not 10 seconds for the complete page. Sequential failures can accumulate waits in the tens of seconds. Authentication refresh and retry can add further requests. This is a code-path risk, not a measured live outage duration.

### 3. Course setup is unnecessarily repeated during navigation — high priority

Successful student login already calls `ensureStudentCourses()`. Most student workspace initializations immediately call it again, and repeat it on subsequent document navigations.

The reconciliation service locks the user row, resolves the current term and placement, locks/reads the plan, reads enrollments individually inside a sequential loop, checks the setup record and returns course state. Existing withdrawals and enrollment dates are deliberately preserved. The work is idempotent but not free; repeated requests for the same student can wait on the same lock.

Introduce a server-validated fast path tied to current term, placement and published plan version. Run full reconciliation when setup is missing or those inputs change, on explicit course confirmation, and through an appropriate login/setup entry point. A client flag alone is insufficient: it could hide a new registrar publication or changed placement. Preserve transaction boundaries and all withdrawal/date protections; bulk-read existing enrollment links when reconciliation really is needed.

### 4. Duplicate initial refreshes and overlapping polls waste work — medium priority

`loadClasses()` fetches upcoming sessions and `/student/day`, although the latter already includes a classes array. They run independently and can represent slightly different server moments. Their cardinality also differs: student day caps at 100; upcoming does not. Consolidation needs an explicit compatible response contract, rather than silently changing offline queue/snapshot behavior.

After the initial load, startup calls `flush()`, which refreshes reviews and classes again even with nothing pending. The local probe observed the second review request immediately after first render; the subsequent class reload follows it in the code.

Class polling runs every 10 seconds, review polling every 15 seconds, and focus/online/sync events can trigger additional refreshes. There is no shared class-load flight or response-generation guard. Earlier requests may finish after newer requests and overwrite fresher UI state. This race is identified from the code and was not separately reproduced in the live service.

A visible check-in tab schedules about 16 regular read requests per minute from these class and review timers alone (12 class requests plus four review requests), before focus events or queue-driven work. Review polling also continues when the document is hidden. This is a request-count calculation, not a measured concurrent-user capacity.

Coalesce triggers, allow one in-flight refresh per view, ignore superseded results and refresh after synchronization only when an operation changed relevant data. Pause nonessential hidden-tab reads and use retry backoff. Preserve foreground freshness around open attendance windows.

### 5. Timetable prioritizes reference loading over dated classes — medium priority

`timetable.js` loads calendar information, then the reference timetable, optionally reloads that reference after choosing a student's programme group, and only then loads dated classes. Thus a reference request delays the operational class list even though those results can load independently.

Resolve the student's known group before the first filtered reference request where possible. Load dated classes independently of calendar/reference rendering. Keep registrar filters and source-review notices; reducing round trips must not broaden programme visibility or turn weekly references into held classes.

### 6. Cached files do not currently provide instant navigation — medium priority

Links use ordinary document navigation. This is a valid architecture, but each transition repeats document startup, identity and shared initialization. It does not preserve a mounted workspace as an SPA would.

The service worker uses network-first navigation with fallback only after `fetch` rejects. There is no bounded wait before returning a cached page shell on a stalled connection. A user can therefore have the HTML cached and still wait a long time to reach it. Static modules are cache-first; older tabs can also keep older code during an update.

Choose a consistent shell strategy for known routes, such as a version-compatible cached shell with background update, or a short bounded network-first attempt with cached fallback. Keep protected APIs out of the service-worker cache, continue identity/role checks, preserve queued operations, and test upgrades where old and new clients coexist. First-ever offline access without installed assets cannot be promised.

`offline.js:studentData()` is also network-first. It reads its saved snapshot only after a retryable failure, so saved data does not shorten normal online startup or a slow request. A labelled saved snapshot can improve perceived responsiveness while refreshing, but it must not be shown as current window authorization or a confirmed attendance receipt.

### 7. Rendering and backend work have optimization candidates, not proven bottlenecks

`renderDay()` runs every second and reconstructs profile, now/next cards and timetable markup even when only a countdown changed. Patch time/progress text independently and rebuild structural sections only when their data changes. Preserve code input, focus and overlap selection. No main-thread profile was captured, so this is a lower-priority efficiency finding rather than evidence of a major rendering stall.

`studentDay()` reads profile, sessions, the latest timetable publication and calendar sequentially. Reading the publication loads its stored reference JSON before filtering for the student's group. Inspect query counts and timings, then consider parallel independent reads and bounded publication-version caching with invalidation. Do not serve a student's personal response from a shared cache.

Identity checks also read the active user in middleware and again in the identity controller. Any reuse must preserve account deactivation, password/auth-version revocation and the correct public response fields. Do not remove authorization checks or weaken password hashing for performance.

## Recommended implementation order

1. **Correct initial states and handler readiness.** Start the form hidden/disabled, bind handlers before exposing actions, show an explicit class-loading status and resolve empty/error/offline states separately. Keep previous valid content during background refresh instead of flashing blank content. Distinguish closed attendance windows from open ones.
2. **Shorten the first useful render.** Load reviews independently, avoid serial clock delay for unrelated content, add a version-aware course-setup fast path, and use one compatible student-day response for the primary view. Keep identity/role gates and server acceptance rules.
3. **Remove repeated work.** Coalesce class refreshes, prevent stale-response overwrite, remove the empty-queue startup reload, suspend hidden review polls, and load dated timetable classes independently of references.
4. **Improve installed/offline navigation.** Revise the service-worker shell strategy with upgrade tests and explicit stale-data labels. A framework or SPA rewrite is not required to address the confirmed problems.
5. **Measure remaining server and device costs.** Add sanitized route-duration/query-count evidence and browser performance marks for click, shell ready, primary data ready and action ready. Profile representative low-end phones and realistic attendance bursts before changing database indexes, adding infrastructure or deciding the VPS is inadequate.

## Acceptance checks for the fixes

- Hold identity, clock, course setup, review and day responses independently. No incorrect form, false empty state or wrong-role content appears; nonessential delays do not block the primary view.
- Test current open class, current closed window, completed check-in, no class, overlapping classes, reference-only activity, failed request and saved offline data. The right action and explanation appear for each.
- Compare an identical bounded before/after browser run: click-to-shell, click-to-primary-content, click-to-action-ready, initial request count and transferred bytes. Report cold and warmed/service-worker-controlled runs separately, with network conditions and sample count.
- Assert unchanged term/plan navigation avoids reconciliation writes/full scans, while new publications, placement changes, electives and retained withdrawals still behave correctly.
- Delay one poll, trigger focus/online and return responses out of order. Confirm no duplicate flight or stale replacement; preserve input/focus during countdown updates.
- Stall navigation while a shell is cached; test first visit, offline entry, expired session, account switch and old/new worker transitions. Do not clear pending operations to fix loading.
- Run the existing regression checks after implementation. Prior totals of 65 backend, 39 browser and 135 Postman requests/351 assertions are historical evidence, not tests rerun by this audit.

Proposed measured acceptance target on the same healthy connection: no incorrect-state flash, primary class data requested without waiting for reviews, no duplicate empty-queue startup fetch, at most one concurrent class refresh and no repeated full reconciliation for an unchanged plan. Set a numeric navigation budget after collecting complete student-browser traces; the current partial measurements do not justify a universal mobile latency guarantee.
