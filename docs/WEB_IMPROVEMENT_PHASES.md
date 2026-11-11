# SAMS web improvement and deployment phases

Plan agreed in scope on 11 November 2026: improve the web application first; defer Android packaging and the Capacitor/TWA decision. The application will use **https://sams.tirallab.page**. This document proposes implementation order and acceptance criteria; it does not claim that improvements or deployment are completed.

## Deployment facts supplied by the user

The supplied fastfetch snapshot, timestamped 11 November 2026 at 17:09:28, reports Ubuntu 24.04.4 LTS, two visible CPU cores, 897 MiB RAM with 346.10 MiB used, 6 GiB swap with 155.33 MiB used, and 25.22/28.02 GiB root disk usage (90%). The supplied public IP is `74.161.160.42`.

These are user-supplied observations, not independently measured capacity. The roughly 2.8 GiB remaining disk space makes a disk inventory and deployment-size check the first operational task. Existing workloads, DNS, TLS, ports, actual available memory and database size still need inspection. Swap is not equivalent to RAM. Do not delete existing data, logs, images or projects merely to make space without understanding ownership and recovery requirements.

Target: one reverse proxy serving the SAMS HTTPS domain, one Express application serving the web frontend and API, and private PostgreSQL if measured capacity permits. Preserve unrelated hosted services. Use prepared build artifacts and keep Android/CI/browser-test workloads off the VPS.

## Phase 1 — Make existing behavior dependable

Implemented and locally verified on 11 November 2026: immutable saved attempts, identity-bound API/refresh handling, originating-user server validation, cross-tab replay leases, persisted transient retries and local acknowledgement history. Verification: 19 backend tests, 16 browser tests, and 53 Postman requests/176 assertions. Full lecturer-offline marking and server operation receipts remain Phase 2.

Keep the current working online attendance flow. Fix the queued student-attempt foundation before adding offline lecturer writes:

- Bind operations and token refresh to their originating account. Pause replay on logout or cross-tab account changes; never submit one student's saved work using another student's token.
- Give each new queued operation an immutable identity and payload. Prevent an older response from deleting or overwriting a newer attempt.
- Retry transient failures with persisted backoff and useful next-attempt state. Distinguish rate limiting/server outages from invalid codes or denied requests.
- Coordinate replay across tabs and retain acknowledgement information long enough to explain results.
- Show explicit local/pending/accepted/review-needed states and surface storage failures. Preserve existing server-side code expiry rules.

Acceptance: tests cover account switching, a lost response, simultaneous tabs, a replaced attempt, 429/5xx responses and repeated connection failures. Existing check-in, manual correction, reporting and Postman requests still pass. No expired code is accepted using a device timestamp.

## Phase 2 — Deliver a small complete offline lecturer register

Implement the synchronization protocol and client together, initially for already-created dated sessions:

1. Add server operation receipts and version checks, with transactionally consistent attendance/audit writes. The authenticated actor must match the operation origin; duplicate operations return the original outcome and altered-payload replays conflict.
2. Add an authorized preparation endpoint for one class and its roster. Persist the minimum required class, roster, policy and version information locally.
3. Allow the lecturer to mark the prepared roster offline. Save each draft and outbox action atomically before claiming it is saved. Official totals remain based on accepted server records.
4. Upload on opening/resuming the application, reconnection and explicit Sync. Show per-operation accepted, conflict, denied or review-needed results.
5. Provide deliberate conflict resolution for cancelled classes, concurrent corrections, enrollment changes and reassignment. Delayed expired student attempts need a server-side claim/review path; the current local failure message alone is insufficient.

Acceptance: disable the network, mark a prepared class, reload, reconnect and verify the exact server results. Duplicate upload and server restart create one logical change and one audit action. Test expired authentication, account disabling/reassignment rules, changed enrollment and an application update with pending work. No promise of synchronization while the app is closed is required in this phase.

## Phase 3 — Make real class setup and reports trustworthy

- Add reviewed timetable import/preview for one offering, with explicit rejection of ambiguous times and unresolved lecturer mappings. Preserve source versions and stable SAMS identities.
- Expand weekly timetable entries only using confirmed semester dates and teaching exceptions. Keep scheduled classes separate from completed classes.
- Handle effective enrollment dates so late enrollment does not silently create earlier absences. Preserve historical attendance after withdrawal.
- Confirm and document threshold, LATE/EXCUSED counting, correction permissions and register finalization. Preserve policy context for finalized reports; unresolved offline work must be visible when finalizing.
- Add necessary lifecycle audit events, indexes/aggregations and bounded report/export handling. Avoid importing unrelated timetable-app features.

Acceptance: an administrator can configure one real offering, enrolled students and actual dated sessions without editing seed files. Repeated imports do not duplicate classes. Reports agree with an independently checked register and preserve the distinction between attendance qualification and final exam clearance.

## Phase 4 — Verify PWA and deploy a controlled pilot

Inspect the VPS early; perform deployment after the required application checks:

- Inventory disk use and existing services; establish deployment headroom, persistent database storage, external backup destination and a tested restoration/rollback path.
- Set measured application/database memory and connection budgets. Check shared-network rate limiting, reduce hidden-page polling and test same-class check-in/reconnection bursts and report generation.
- Verify control of the `sams.tirallab.page` DNS record and route it to the intended server. Configure valid TLS and the exact frontend origin `https://sams.tirallab.page`. Set proxy trust according to the actual proxy chain. Do not expose PostgreSQL publicly.
- Apply committed migrations without resetting existing data. Provision actual accounts; do not seed synthetic users into the operational dataset.
- Complete PWA launcher assets and controlled cache updates. Verify installation, restart, offline prepared-register access and pending-work preservation on physical Android devices.
- Check health, logs, disk growth, backup recovery and account lifecycle before expanding usage.

Acceptance: a phone reaches the HTTPS domain, authenticates, completes the online and prepared-offline workflows, downloads a report and retains pending work through an update. Record measured latency/errors/memory/disk/connection results for the intended pilot workload. Do not infer institution-wide capacity from a successful small pilot.

## Phase 5 — Decide Android packaging afterward

After web/PWA and synchronization acceptance, determine whether users need an Android package for the hosted experience or specifically need bundled startup/native integrations. Compare TWA and Capacitor using those demonstrated needs. Retain one backend and official database. This plan authorizes no premature framework choice or Android implementation.

## Delivery discipline and scope

Use small changes with detailed commits explaining behavior, decisions, migrations and verification. Extend meaningful API, browser and Postman checks as each behavior is introduced. Keep the existing online flow working throughout. Record implemented and proposed capabilities separately.

The assignment deadline supplied earlier is 12 November 2026. These phases are an implementation order, not a promise that all operational work fits before that deadline. Preserve a demonstrable, tested core and accurately disclose any remaining offline/pilot work. Do not add unrelated modules or fabricate contribution history.

Supporting investigations: [offline and realism review](OFFLINE_REALISM_REVIEW.md), [hosting/PWA/Android review](HOSTING_PWA_ANDROID_REVIEW.md). The earlier inability to resolve `myvps` in this environment is an access/configuration observation, not evidence that the user's VPS is unavailable.
