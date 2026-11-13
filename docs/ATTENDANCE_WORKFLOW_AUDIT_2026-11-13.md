# Attendance and code-sharing workflow audit

Date: 13 November 2026 · Africa/Kampala

## Scope and evidence

Reviewed the live student and registrar pages in their existing sessions, then used the requested Codex in-app browser to sign in as the authorized BSE project lecturer. The in-app lecturer dashboard showed eight assigned offerings and no dated class for 13 November. HTTPS health returned OK and Africa/Kampala. Reviewed the corresponding source at checkout `2cd837f3a4e27efdeb4bb96ea194a9e563a95b4e`.

Only normal sign-in/read navigation was performed on the live application. No check-in window was opened, class created/completed, attendance mark submitted or live load test performed. Synthetic middleware and pure-function checks ran locally without database writes. The prior 61/34/135 regression totals are historical release evidence, not a freshly rerun suite in this audit.

## Current workflow

1. Registrar publishes a programme group's course plan; students receive its compulsory course links and confirm permitted electives.
2. An assigned lecturer creates a dated class, or the registrar reviews and applies timetable generation. A weekly reference does not create a held class or authorize attendance.
3. The lecturer opens a check-in window during a scheduled class. The window lasts at most ten minutes and is clipped to class end. Reopening after a closed/expired window is possible while the class remains scheduled and in progress.
4. The server generates a six-character HMAC-derived code from a random per-window secret. It rotates every two minutes. The lecturer page displays it; there is no dedicated QR/share-link/projector workflow in the inspected page.
5. Students enter the displayed code. The server validates authenticated identity, effective enrollment, scheduled class status, server time and the current code. A successful new check-in records PRESENT through method CODE.
6. Saved offline attempts are pending, not accepted attendance. They still need a valid server-side window on replay; failed attempts can be reviewed by the lecturer.
7. Corrections preserve reasons/history. Completing the class makes it count in reports; cancelled unheld classes are excluded.

## Findings, ordered by practical priority

### F1 — High: shared-network limits can block a legitimate class

`middleware/rateLimit.js` applies login throttling by IP: ten requests per minute in production. The global limit is 600 requests per minute per IP. Authenticated check-in has its own student-based limit, but it is reached only after the global limiter.

A local Express middleware check with production configuration returned ten successful synthetic requests, then HTTP 429 on request eleven. A separate local middleware instance accepted 600 synthetic requests and rejected request 601. No credentials were attempted and no traffic was sent to the live site.

The student check-in page polls two class/day endpoints every ten seconds and review requests every fifteen seconds: approximately sixteen requests per minute per visible tab before startup, check-in, retries and other activity. Thirty-eight such tabs behind one public IP can exceed 600/minute. The staff register also polls its session and roster every five seconds. This is a configuration/traffic-budget finding, not a measured capacity benchmark.

Recommendation: budget limits around shared campus networks. Use validated account-based limits after authentication, retain appropriate IP safeguards for anonymous traffic, combine per-identity/per-IP login controls and reduce polling. Do not trust an unverified client identity or forwarded header as the limiter key. Test a legitimate shared-IP class and anonymous abuse controls together before deployment.

### F2 — High operational gap: enrollment is ready, today's dated class is absent

Both the staff dashboard and inspected timetable view reported no dated class on 13 November. The student page displayed current weekly reference information and no attendance form for that reference. This is correct authorization behavior, but the teaching-to-attendance setup is incomplete for today's workflow.

Recommendation: review and create the actual held/upcoming class, with the right offering, lecturer, room and Kampala interval. Make the difference between “weekly plan,” “dated class,” and “check-in open” clear. Do not generate past completed classes or marks to fill the gap. The remaining timetable-conflict validation issue also needs correction before bulk generation is trusted.

### F3 — High integrity limitation: a shared code does not prove presence

Code possession plus valid enrollment is sufficient for acceptance during the window. An enrolled student outside the room could receive the code from somebody present. Short lifetime and authenticated enrollment restrict acceptance but do not bind a submission to physical presence. There is also no restriction requiring someone to keep one device/account per person; account sharing remains a policy concern.

Recommendation: describe the code as a lecturer-supervised check-in mechanism. Display it in class, keep the window controlled and let the lecturer verify suspicious register entries. If stronger assurance is required, define the evidence/policy first. GPS, campus IP or QR alone are not reliable proof and should not be added as an assumed solution. Avoid claiming that rotation eliminates forwarding.

### F4 — Medium: “Next up” can select a later dated class over an earlier reference

The live student page showed a practice class on 19 November as Next up while its own timetable listed another class later on 13 November. `js/day-model.js` selects `future[0]` before considering upcoming weekly references. A local synthetic check reproduced selection of `dated-next-week` instead of `reference-later-today`.

Recommendation: compare the earliest eligible future items chronologically, retain REFERENCE/DATED labels and prefer a matching dated class for the same occurrence. Do not allow a reference item to become an attendance target. Keep optional practice offerings from obscuring the normal teaching schedule.

### F5 — Medium: code rotation can momentarily look like window closure

`js/examiner.js` hides a code when its expiry is reached. Replacement codes arrive through five-second session polling. During the gap it displays “Check-in is closed” and offers the open-window control, although the server's ten-minute window may still be open. Slow/failed polling can prolong confusion. The server reuses an already active window, so pressing Open does not necessarily start a new one.

Recommendation: distinguish code refresh from closed attendance. Refresh at the rotation boundary, prevent overlapping requests and show a loading/reconnecting state. Keep the server authoritative; do not manufacture a replacement code in the browser. Include boundary/latency tests.

### F6 — Medium: code-window opening/closing lacks dedicated audit events

`manageSession` audits completion/cancellation but returns from start without an audit write and omits audit for stop. Manual attendance changes do retain reasons and history. CODE attendance retains its record time/method, but a later reviewer cannot reconstruct every open/close/reopen action from audit events.

Recommendation: audit window opened, closed and reopened with actor, session, timestamps and a non-secret window identifier. Record a code-submission window/slot reference if operationally needed. Never log the secret or plaintext code. Repeated requests that reuse an existing window should be distinguished from new openings.

### F7 — Medium policy gap: late opening/reopening still records PRESENT

`submitCheckin` unconditionally creates PRESENT for a new valid CODE submission. No lateness cutoff is applied. A window opened near class end can therefore produce PRESENT. This may be acceptable if the lecturer deliberately checks attendance later, but the implementation does not establish an institutional late-arrival policy. Completion can also occur before scheduled end once class start has passed; this permanently closes the session and starts report counting.

Recommendation: decide whether check-in means presence at the check moment or arrival on time. Apply a configurable, approved late rule only if required. Consider an early-completion reason/confirmation and meaningful handling of a class that genuinely finishes early. Do not silently change historical marks or infer late status from offline device time.

### F8 — Medium usability issue: long-lived tabs can retain an older client

The inspected student tab showed a new page link but lacked My courses in shared navigation; a fresh staff navigation loaded the new Course setup navigation. The service worker caches script assets, and already loaded pages retain their modules. This is consistent with mixed old/new client state after rollout; the exact active worker version was not inspected.

Recommendation: display a release/version update notice and offer a safe reload. Preserve pending local attendance before applying updates. Refresh server-clock offset after reconnection/resume as well: `common.js` currently samples it during initialization, so later device-clock changes can make countdowns inaccurate while the server remains correct.

## Controls that are working in the inspected implementation

- Student class responses omit the secret and active code; only authorized assigned lecturers/registrars receive lecturer code data.
- A random per-window secret and HMAC-derived rotating code are used; comparison normalizes case and uses constant-time comparison for equal-length values.
- Time decisions use the server. Local rule checks confirmed rotation changes and rejection at the close boundary.
- Effective enrollment is checked for the session date; programme membership alone is insufficient.
- Session locking and unique attendance identity prevent duplicate accepted records. Retrying an existing CODE record returns the existing result; it does not make a new mark or establish that the supplied code is currently valid.
- An existing manual attendance decision is protected from CODE overwrite.
- A class cannot open check-in before start, after end or after completion/cancellation. Closing removes the live secret.
- Pending offline attempts are explicitly labelled; manual/offline register changes have separate conflict and audit handling.

These controls were confirmed through source review, the local focused checks and retained regression coverage. No new live attendance submission was used to validate them in this audit.

## Recommended implementation order

1. Correct shared-network throttling/polling budgets and add realistic multi-user network regression cases.
2. Correct chronological Next up selection and code-rotation refresh states; add update-safe client reload handling.
3. Review the dated teaching sessions needed for actual attendance, after addressing scheduling conflicts.
4. Add non-secret window lifecycle audit records and decide late/early-completion policy.
5. Run the full isolated API/browser/Postman suites, then conduct a bounded lecturer/two-student walkthrough in designated practice classes with recorded operator approval. Do not mark the supplied student roster merely for testing.

Stronger presence verification is a policy/product decision after the basic workflow is reliable. The findings above remain open; this audit changed documentation and retained evidence only.

## Remediation update

The follow-up implementation replaces the 600/minute shared-IP ceiling with a broader 6,000/minute network guard and a separate 600/minute verified-account budget. Login retains an IP guard of 120 unsuccessful/in-flight requests per minute and a normalized, hashed identity limit of ten unsuccessful requests per minute; successful requests do not consume those failed-login budgets. These are pilot budgets, not a throughput guarantee.

Next up compares dated and reference occurrences chronologically, preferring a dated occurrence on a tied start. The lecturer refreshes at code expiry with single-flight loading and an explicit open-window refresh state. Window open/close and newly accepted CODE attendance now write non-secret audit events; repeated start/accepted replay does not manufacture another window/attendance event. Completion audit records whether the class ended early, and its confirmation warns before scheduled end.

The client resynchronizes clock offset after online/focus/resume and periodically while visible. A service-worker update notice offers an explicit reload without clearing saved attendance. Tabs running the older client still need a normal reload once before this new notice handler exists. Code display reminds the lecturer to show the code in the room and verify the register.

F1, F4, F5 and F6 have code corrections and new regression checks. F8 has reload/clock improvements; release acceptance must still check long-lived tabs. F2 requires reviewed dated sessions. F3 remains a physical-presence limitation. F7 remains a policy decision: CODE submissions still mean PRESENT at the supervised check moment, with early-completion warning/audit context rather than an unapproved lateness policy. No historical marks are rewritten.

### Executed fix verification

Release `11a5e18302e32ae903d4779e95d14ebe5d082431` is deployed. All 65 backend tests, 35 browser tests and 135 Postman requests / 351 assertions passed. Live HTTPS role/health smoke checks passed. The operator confirmed Friday Web Design 11:00–13:00 EAT; reviewed sessions were created for 20 and 27 November with no conflicts/blockers. No check-in window was opened and attendance stayed at two records. In the Codex in-app browser, the lecturer saw the 20 November class at the correct Kampala interval and its Start check-in button was disabled because it is future-dated. The fresh backup restored with matching core counts. Only these confirmed future sessions resolve F2 for the selected offering; other programme sessions still require lecturer review.
