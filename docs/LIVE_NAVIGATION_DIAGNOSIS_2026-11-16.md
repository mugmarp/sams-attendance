# Live navigation delay: follow-up diagnosis

16 November 2026 · SAMS

## User-visible problem

The user reports a long wait after clicking navigation, before the next page appears. Prior automation established eventual loading and a controlled local startup improvement; that did not establish an acceptable live transition. The remaining delay is real and the previous performance fixes should not have been described as resolving the overall live experience.

The current in-app browser was inspected without clearing storage or requiring another sign-in. Its cached common.js response exactly matched the current source. Stale application code does not explain this captured sample.

## Browser evidence

Navigation from My account to Check in returned cached scripts/styles in approximately 5–9 ms. The identity request took **4,054 ms**, course setup **916 ms**, and the first student-day request **1,734 ms**. The code still awaits identity before building/revealing the page, and the class read awaits course setup. Those network stages explain an approximately 6.7-second dependency path in this sample; this is not a complete measured click-to-paint duration because the event buffer evicted the document entry.

The identity response timing is particularly useful:

| Stage | Observed time |
| --- | --- |
| New connection, including TLS | 2,507 ms |
| TLS portion within that connection time | 917 ms |
| Request sent to response headers | 1,536 ms |
| Complete identity request | 4,054 ms |

The request used HTTP/1.1 and a new connection. Later API calls reused connections; their response waits were still hundreds of milliseconds to over a second. The TLS portion is included in connection time and must not be added twice. Cached files arriving quickly does not make network-dependent identity or data requests instantaneous.

## Server-side comparison

Through Termix, an existing synthetic practice student's credentials were read privately by a temporary timing script on the VPS. One sign-in obtained a token; the script measured protected reads and did not print credentials/tokens or submit attendance. Login performs its existing idempotent course reconciliation, so this is not a strictly read-only login operation.

| Endpoint | Loopback API, three samples | HTTPS from VPS, three samples |
| --- | --- | --- |
| Identity | 3.57 / 2.29 / 3.07 ms | 27.87 / 65.46 / 28.45 ms |
| Student day | 30.17 / 48.84 / 27.67 ms | 61.39 / 34.84 / 35.11 ms |
| Health | 1.59 / 1.33 / 1.24 ms | 26.32 / 121.42 / 25.55 ms |

Two one-second vmstat intervals showed 100% and 96% CPU idle, zero swap-in/out and zero I/O wait. Login information reported roughly half of 897 MiB RAM in use. Disk usage was about 94%, a separate capacity constraint requiring an inventory before cleanup; nothing was deleted in this investigation.

These were later measurements, not server timings correlated to the exact earlier browser requests. They show the application/database can serve these reads quickly under the observed conditions. They do not prove that no transient server stall ever occurs. The directly measured 2.5-second connection setup cannot be attributed to running the identity SQL query. The remaining 1.5-second response wait still needs request-correlated upstream timing to separate network, proxy and application contributions.

The execution shell had a temporary DNS failure and direct SSH timed out. Those are limits of that access path, not proof that the user's browser has a DNS fault. Server diagnostics were completed through the authorized Termix browser session.

## Revised fix priorities

1. **Make navigation shell visibility independent of a fresh identity round trip.** Keep the layout/navigation visible immediately using the established client session, with an explicit verification state and protected actions/data gated appropriately. Current API endpoints must continue checking active identity, auth version and role. Do not remove revocation checks or expose another account's snapshots merely to improve speed.
2. **Shorten the dependency path for primary content.** Establish a bootstrap/read contract that returns the current identity/placement/clock/setup state needed by the page without repeated serial client round trips. Reconciliation must remain version-aware and preserve withdrawals/changed plans; moving the same work blindly to the background is insufficient.
3. **Use labelled saved read-only content where appropriate during refresh.** Distinguish fresh, saved, loading and failed states. A cached attendance window is not authorization and a pending attempt is not an accepted mark. Account changes and wrong-role redirects must remain safe.
4. **Measure the exact slow request from both sides.** Add sanitized request/upstream durations or Server-Timing data before assigning all remaining response wait to the network. Do not log tokens, passwords or check-in codes. Compare a normal phone/browser as well as the Codex browser; automation call duration is not page performance.
5. **Inspect connection behavior.** Review actual Nginx protocol support, keepalive and TLS resumption. HTTP/2 multiplexing may help concurrent requests but does not eliminate a slow initial connection or the app's serial dependencies. Avoid claiming it alone fixes this symptom.
6. **Verify human interaction, not just eventual success.** Record click-to-visible destination shell, first useful content, and action-ready state under normal and high-latency connections, including navigation after an idle interval. Preserve tests for role changes, revoked accounts, offline snapshots and pending work.

A frontend framework rewrite or a larger VPS is not established as necessary by this evidence. The existing code's fresh-identity gate and serial primary-data dependencies amplify measured connection/response latency. The previous local benchmark was valid for its narrow artificial-delay comparison, but should not have been used to imply that the live user-visible problem was finished.

## Status and retained evidence

This follow-up diagnoses the remaining delay; no new runtime code, server configuration or passwords were changed. The small temporary diagnostic script on the VPS contains no embedded credentials; it reads the existing private credential file when run. No attendance was submitted.

[Sanitized browser and server measurements](test-reports/2026-11-16-live-navigation-diagnosis.json) retain request paths, durations and resource samples. No tokens, credential values or response bodies are included. The browser trace is explicitly marked partial. The user's observation remains the acceptance criterion for the next correction.
