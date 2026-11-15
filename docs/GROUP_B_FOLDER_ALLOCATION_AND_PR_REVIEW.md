# Group B folder allocation and pull-request review

15 November 2026 · verified before allocation changes

## Review boundary

Reviewed Group B PRs **#1–#15**: thirteen merged, #6 open and #7 open as draft. Snapshot: Group B `main` at `fd8d2a46ffab2377e9677f659a0ebec949ae3677`; SAMS default `main` at `6df288a5af28ce15169dd180b3ba1f403235eca2`; SAMS working branch was `28517d1`. The Group B repository, PR descriptions, comments and merge states were read only. This guide contains proposed messages; none were posted or submitted as reviews.

Git history establishes who opened a PR, who merged it and the recorded commit author. It cannot prove who typed the code or why a decision was made. A clean Git merge does not prove that imports, page paths or runtime dependencies work.

## Corrections to my earlier approach

- I assigned broad overlapping folders such as services/ and frontend/public/ rather than specific modules. That was insufficient guidance for parallel integration.
- I did not reconcile the remote default branch before later work. Mark’s `0fc0156` removes docs/ from Joel’s allocation, but the working branch still listed it. The default branch has now been merged into the working branch to preserve that exact decision; the merge changed only that README row.
- I maintained later tested fixes on the migration branch while the default branch remained at the 12 November revision. Branch-specific results were documented, but the default README still presents older behavior and totals. Default, deployed and educational copies must be named explicitly.
- The working README itself still showed 39 browser tests after the 44-case release. This allocation update corrects that pointer to the latest dated evidence.
- The earlier page-flash patch solved workspace readiness but initially missed class-data readiness. That was corrected separately; tests passing at one revision never established that every later-reported case was covered.

The report assigns responsibility for concrete changes, not intent. Known direct mistakes include Charles’s merged wrong-path copies, Patricia’s merged duplicate attendance service, and Annibow’s deleted lecturer page. Other contributions contain valid baseline work alongside broad scope or incomplete verification. No evidence here shows a malicious or destructive conflict resolution.

## SAMS remote README and PR reconciliation

Your explicit README edit is [commit 0fc0156](https://github.com/mugmarp/sams-attendance/commit/0fc0156a74ffac2fe762803de73cd956e86d7bf4): “Remove docs/ from Amen Joel Osuta's responsibilities.” It changed only that allocation cell. The broad differences between the older default README and the migration branch are later feature/documentation work, not evidence that you intentionally removed those newer features. Merge `a71d441` now preserves your edit in the working branch before this revised allocation.

The three inspected SAMS PRs were opened and are recorded as merged by `mugmarp`:

| PR | Recorded title / merge | What the history establishes |
| --- | --- | --- |
| [#1](https://github.com/mugmarp/sams-attendance/pull/1) | “Complete SAMS attendance prototype with verified role and offline workflows”; merge metadata points to `243f863` | This is the earlier React/TypeScript prototype history. Its commits are ancestors included by the later migration; the Git graph does not show a separate destructive reintroduction of React after #2. No comments/reviews were returned. |
| [#2](https://github.com/mugmarp/sams-attendance/pull/2) | “Deliver JavaScript SAMS with offline attendance, academic structure and account controls”; merge `e0b9599`, head `3ea80cd` | Actual merge retains the JavaScript migration and team allocation at that head. Its current description also mentions later course-plan work and `cbcc946`, which postdate this merged head. That description is not reliable evidence that those later commits reached default main. The only returned review is Copilot reporting exhausted quota, not approval. |
| [#3](https://github.com/mugmarp/sams-attendance/pull/3) | Literal current title “docs(team): explain SAMS workflows, architecture and module reading p…”; merge `6df288a`, head `bc693e5` | Adds the team guide and README link. Its description begins with the truncated continuation “…aths”. The awkward title/body should be improved prospectively if the team chooses; no historical title was silently rewritten here. The returned bot review reports exhausted quota. |

**Further correction to my reporting:** a merged PR’s current description discusses newer branch work and obscures which revision was actually merged. PR metadata alone does not identify who edited that description; I should not use it as proof that later code reached main. Future descriptions and validation claims must name the exact head/release. A new integration PR should carry later changes; editing an old PR description does not merge them. The reviewed default main remained at the 12 November revision while the deployed navigation release is `4e821b7`. This task updates the migration branch and its local PC guide; it does not claim that default main or the educational repository now contains the deployment.

## Revised allocation

Keep the existing application layout. Do not create person-named code folders, move modules merely to establish ownership, or treat these allocations as exclusive rights. Each member reviews and changes a coherent workflow; imports of existing SAMS code must be described as imports, with the source revision named.

| Member | Area | Primary files | Coordination / existing work |
| --- | --- | --- | --- |
| Wokwaba Charles | Authentication | `backend/src/controllers/auth.js`, `backend/src/middleware/auth.js`, `frontend/public/js/login.js` | Coordinate JWT/password helpers and shared middleware; reconcile #8, #9 and #14 into canonical paths. |
| Kanyesigye Brian | Academic records and course plans | `data/academic_catalogue.json`, `backend/src/services/catalogue.js`, `course-setup.js`, `backend/src/routes/course-plans.js` | Coordinate `backend/prisma/`, seeds and course-plan pages; narrow future changes beyond the broad #13 import. |
| Kwesiga Lewis | Timetable and personal schedule | `backend/src/services/timetable.js`, `timetable-source.js`, `student-day.js`, `frontend/public/timetable.html`, `js/timetable.js` | Coordinate academic calendar/reference data with Brian and student schedule rendering with Annibow; #10 imported other services too. |
| Akatuwijuka Annibow | Student interface | `frontend/public/student.html`, `courses.html`, `js/student.js`, `js/courses.js`, `js/day-model.js` | Coordinate shared CSS sections; retain #15 history while correcting its deleted lecturer page through integration. |
| Natweta Cyril | Attendance rules and class actions | `backend/src/services/attendance.js`, `rules.js`; check-in/session handlers in `backend/src/routes/api.js` | Coordinate shared route edits with Mark, Charles and Edwine; keep reporting changes separate from attendance mutation. |
| Wawangula Generous | Lecturer interface | `frontend/public/examiner.html`, `frontend/public/js/examiner.js` | #6 is a duplicate-path import of an already present identical module. Agree on its disposition before submitting new lecturer improvements. |
| Mugendawala Mark Paul | Integration and hosting | `backend/src/config/`, `backend/src/app.js`, `backend/src/server.js`, `deploy/native/`, `.github/workflows/` | Coordinate package/lock files, release baseline and CI. Preserve module contributions while assembling a runnable shared tree; #5 covers config only. |
| Katto Andrew | Offline storage and synchronization | `frontend/public/js/offline.js`, `register-offline.js`, `frontend/public/sw.js`, `backend/src/services/sync.js`, `backend/src/routes/sync.js` | Coordinate API/session storage with Charles and Mark, prepared registers with Generous, pending student attempts with Annibow. |
| Nabaweesi Patricia Mirembe | Attendance reports | `backend/src/services/eligibility.js`, `pdf.js`, `frontend/public/admin.html`, `js/admin.js` | Coordinate the common counting helpers in `academic.js`; #11 added a duplicate attendance service, so reporting needs a correctly scoped follow-up. |
| Matovu Edwine Levi | Account management | `backend/src/routes/accounts.js`, `frontend/public/account.html`, `accounts.html`, `js/account.js`, `js/accounts.js` | Coordinate authentication helpers with Charles and migrations with Brian. #7 is a broad integration draft, not an isolated account-only diff. |
| Amen Joel Osuta | API and workflow verification | `postman/`, `backend/tests/`, `frontend/tests/` | Preserve the five validated checks and response examples from #12. No general `docs/` assignment; feature owners maintain their own explanations. |

Paths abbreviated after the first full path stay in the same directory, except `js/` entries, which are under `frontend/public/`. These are starting areas, not leadership appointments. Related tests stay with each feature PR; Joel does not carry sole responsibility for verification.

## Shared files and likely conflicts

| Shared surface | How to coordinate |
| --- | --- |
| `backend/prisma/schema.prisma`, migrations, seed | Brian coordinates model changes with the feature author. Keep published migrations immutable; add a new migration. Do not upload the whole folder over another member’s work. |
| `backend/src/routes/api.js`, `app.js`, `server.js` | Mark coordinates integration; Charles, Cyril and Edwine change only the relevant endpoint/registration sections. Preserve authorization and validation order. |
| `frontend/public/js/api.js`, `common.js`, `login.js` | Coordinate authentication, navigation and queue/session behavior with Charles, Andrew and Mark. Annibow and Generous change their page modules where possible. |
| `frontend/public/css/styles.css` | Scope styles to the affected page/component and communicate shared changes. Do not independently reformat the complete stylesheet. |
| `frontend/public/sw.js`, manifests and loading helpers | Andrew coordinates with page authors and Mark. Check versioned shell/module compatibility, offline queues and old-client updates. |
| `services/academic.js`, `student-day.js`, academic filters | Patricia, Lewis and Brian review cross-workflow counting, enrollment and timetable effects. Avoid concurrent blanket service imports. |
| `postman/SAMS.postman_collection.json` | Joel coordinates request order, captured IDs and examples. Preserve both repositories’ unique cases before rerunning. |
| `backend/tests/api.test.js`, package manifests/locks, CI | Include narrowly scoped tests; coordinate shared fixtures and dependency changes. A copied suite is not an executed result. |
| `README.md` | Preserve explicit member edits and source/default-branch context. Update the latest tested count with a dated report; do not replace it with an older copied README. |

## Canonical paths and integration repairs

Group B main is not yet a complete runnable copy: it lacks the backend/package manifests and server/app/routes needed to start the API, and its lecturer HTML page is missing. Merely having data, services and tests present is not sufficient. #7 supplies many missing pieces, which is why simply discarding that draft would also discard useful integration work.

| Current misplaced/duplicate item | Canonical destination / decision |
| --- | --- |
| root `attendance.js` | Existing `backend/src/services/attendance.js`; exact blob match `dea3458e...`. Reconcile/remove the unused alias through a normal correction commit. |
| root `auth.js`, `backend/src/auth.js` | `backend/src/middleware/auth.js`; current copies are identical and contain middleware. |
| `backend/authenticate.js`, `backend/src/authenticate.js` | `backend/src/controllers/auth.js`; current identical files contain login/refresh/me controllers. Do not preserve the misleading basename solely because it was uploaded that way. |
| `backend/errorHandler.js`, `backend/src/errorHandler.js` | `backend/src/middleware/errorHandler.js`. |
| `backend/rateLimit.js`, `backend/src/rateLimit.js` | `backend/src/middleware/rateLimit.js`. |
| Open #6’s `frontend/public/examiner.js` | Already present as identical `frontend/public/js/examiner.js`; no extra runtime implementation is supplied by the duplicate. |
| Missing `frontend/public/examiner.html` | Deleted in #15; #7 restores it. Preserve the lecturer shell and its `/js/examiner.js` module reference. |
| Former literal file `frontend/public/js` | Created in direct commit `cd4b915` by ANDREW KATTO. #15 correctly replaces it with a directory; retain this repair. |

Do not blindly move a duplicate onto an existing destination. Compare both contents, preserve real unique changes, then remove the unused alias in an explicit correction. Tests should check module resolution and the actual role pages after assembling the complete baseline. Keep all accepted PR/merge history; no force push or retrospective credit reassignment is needed.

## Postman work that must be preserved

Group B’s #12 has **134 requests** and records **362 assertions**; it adds these five named cases absent from the current SAMS collection:

- Login rejects a missing password.
- Login rejects a malformed email.
- Password change requires the current password.
- Password change rejects unexpected privilege fields.
- Password change rejects reusing the current password.

The current SAMS collection has **135 requests** and **351 executed assertions**, including six course-plan cases absent from Group B: signed-in setup, plan/version confirmation validation, client-selected identity rejection, student access denial, registrar options and missing-scope preview validation.

The structural union is **140 uniquely named requests**. This is a comparison result, not an executed collection. Assertion totals must be measured after combining scripts, preserving workflow order and running against a disposable seeded test database. Do not claim either repository’s results validate an untested combined tree. Preserve Joel’s saved examples, static checker and the explicit statement that the backend/browser suites were copied but not rerun for #12.

## Verified PR history and repair decisions

Dates below use the GitHub metadata retained in the linked PRs. Exact commit subjects and comments are recorded here; short or absent messages must not be silently replaced with invented historical explanations. Draft replacement text later in this guide is prospective.

### [PR #1: added XZ](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/1)

Opened by `lewiskwesiga-dot`; **merged**. Merged by `lewiskwesiga-dot` at `2026-11-11T10:15:48Z` (UTC), merge `d345d9a`. 1 changed file(s); 1 commit(s).

- `a6bdc7f` — `added XZ` (recorded author: lewiskwesiga-dot).

No conversation comments or submitted reviews were returned by the connector at inspection.

**Decision:** Practice archive import, not SAMS functionality. The practice file is absent from current main; retain its history without treating it as an application contribution.

### [PR #2: the fygy](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/2)

Opened by `2025bse120-sketch`; **merged**. Merged by `2025bse120-sketch` at `2026-11-11T10:20:50Z` (UTC), merge `f39ba8e`. 1 changed file(s); 1 commit(s).

- `579ae44` — `the fygy` (recorded author: 2025bcs109-pixel).

No conversation comments or submitted reviews were returned by the connector at inspection.

**Decision:** Practice presentation import, not SAMS functionality. It is absent from current main; no rewrite of historical commits is needed.

### [PR #3: hhyhyhhhhh6yhyhy](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/3)

Opened by `brian-khan`; **merged**. Merged by `brian-khan` at `2026-11-11T10:21:23Z` (UTC), merge `728a24d`. 1 changed file(s); 1 commit(s).

- `1b9ead3` — `hhyhyhhhhh6yhyhy` (recorded author: KANYESIGYE BRIAN).

No conversation comments or submitted reviews were returned by the connector at inspection.

**Decision:** Practice audio import, not SAMS functionality. It is absent from current main; distinguish this PR from Brian’s later academic work.

### [PR #4: jshfjshfjsh](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/4)

Opened by `wokwabacharles4-jpg`; **merged**. Merged by `wokwabacharles4-jpg` at `2026-11-11T10:46:31Z` (UTC), merge `1fd9c4b`. 1 changed file(s); 1 commit(s).

- `192cada` — `jshfjshfjsh` (recorded author: wokwabacharles4-jpg).

No conversation comments or submitted reviews were returned by the connector at inspection.

**Decision:** Practice Word document import, not authentication implementation. It is absent from current main.

### [PR #5: backend: added backend config JS files](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/5)

Opened by `mugmarp`; **merged**. Merged by `mugmarp` at `2026-11-12T17:48:15Z` (UTC), merge `8376765`. 2 changed file(s); 1 commit(s).

- `2d77c75` — `backend: added backend config JS files` (recorded author: mugmarp).

Recorded comments/reviews:

- [`copilot-pull-request-reviewer[bot]`](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/5#pullrequestreview-5879320415): Copilot reported that review could not run because the requester’s quota was exhausted; this is not an approval.

**Decision:** Correct canonical config paths, but only two files: this did not establish a runnable complete backend. The bot’s quota message is not an approval or executed review.

### [PR #6: My contribution to SAMS project](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/6)

Opened by `wagegenerous-pixel`; **open**. No completed merge into Group B main. 1 changed file(s); 1 commit(s).

- `c63944a` — `Create examiner.js` (recorded author: wagegenerous-pixel).

No conversation comments or submitted reviews were returned by the connector at inspection.

**Decision:** Open. Adds frontend/public/examiner.js, although the application imports /js/examiner.js. Its 20,748 bytes are identical to main’s frontend/public/js/examiner.js. Do not merge this duplicate. Discuss closing as superseded or amend the same branch with a genuine lecturer-module change; preserve the original PR history.

### [PR #7: SAMS Project Contribution – Account Management Module](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/7)

Opened by `Edwinelevi`; **open draft**. No completed merge into Group B main. 74 changed file(s); 2 commit(s).

- `43ec8e4` — `Import existing SAMS project files into submission repository` (recorded author: Edwinelevi).
- `66950aa` — `Merge main and resolve Postman demonstration conflicts` (recorded author: Edwinelevi).

No conversation comments or submitted reviews were returned by the connector at inspection.

**Decision:** Open draft. Current diff: 74 files, 7,604 additions, no deletions. The original 43ec8e4 commit imported much more than accounts; the later merge brings in accepted main work. Keep draft until scope and runtime checks are agreed. It restores the missing examiner.html and supplies missing app/package/routes/configuration files. Either explicitly describe it as shared baseline integration with provenance, or split dependent scopes with Edwine. Do not overwrite Joel’s collection or claim that all supporting files were newly implemented for accounts.

### [PR #8: Add files via upload](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/8)

Opened by `wokwabacharles4-jpg`; **merged**. Merged by `wokwabacharles4-jpg` at `2026-11-13T06:05:18Z` (UTC), merge `aefa23f`. 2 changed file(s); 1 commit(s).

- `1ff8800` — `Add files via upload` (recorded author: wokwabacharles4-jpg).

Recorded comments/reviews:

- [`wokwabacharles4-jpg`](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/8#issuecomment-6845573215): added

**Decision:** Merged wrong-path middleware duplicates under backend/, rather than backend/src/middleware/. Reconcile with canonical paths in a follow-up, comparing contents before removing aliases. This is a semantic integration defect even though Git accepted the merge.

### [PR #9: Add files via upload](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/9)

Opened by `wokwabacharles4-jpg`; **merged**. Merged by `wokwabacharles4-jpg` at `2026-11-13T06:08:16Z` (UTC), merge `b2e6bcc`. 1 changed file(s); 1 commit(s).

- `1851c9b` — `Add files via upload` (recorded author: wokwabacharles4-jpg).

Recorded comments/reviews:

- [`wokwabacharles4-jpg`](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/9#issuecomment-6845616233): added

**Decision:** Merged root auth.js, which is authentication middleware and belongs under backend/src/middleware/auth.js. The root file is byte-identical to the later backend/src/auth.js; neither location matches the expected imports.

### [PR #10: Lewis js](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/10)

Opened by `lewiskwesiga-dot`; **merged**. Merged by `lewiskwesiga-dot` at `2026-11-13T08:24:34Z` (UTC), merge `8ceba79`. 12 changed file(s); 3 commit(s).

- `154d8e9` — `Timetable processing and its page` (recorded author: lewiskwesiga-dot).
- `3ab1f66` — `demo` (recorded author: lewiskwesiga-dot).
- `f159d5d` — `Timetable processing and its page` (recorded author: lewiskwesiga-dot).

No conversation comments or submitted reviews were returned by the connector at inspection.

**Decision:** Broad services import: includes attendance, reporting, sync and catalogue services beyond timetable scope. Those already accepted files must be acknowledged as shared baseline, not reassigned by pretending they are absent. Later PRs should change specific timetable files only.

### [PR #11: Add attendance functionality](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/11)

Opened by `2025bse120-sketch`; **merged**. Merged by `2025bse120-sketch` at `2026-11-13T08:20:28Z` (UTC), merge `46caba9`. 1 changed file(s); 1 commit(s).

- `f0bf82c` — `Add attendance functionality` (recorded author: 2025bcs109-pixel).

No conversation comments or submitted reviews were returned by the connector at inspection.

**Decision:** Root attendance.js duplicates backend/src/services/attendance.js exactly. Its relative imports do not resolve at the repository root. The PR description concerns summaries/PDFs, while this file implements attendance operations. Preserve history, remove/reconcile the unused alias in a correction PR, and implement any actual report work in eligibility.js/pdf.js. The PR account is 2025bse120-sketch; the commit author is recorded as 2025bcs109-pixel. That mismatch does not establish who physically edited the file.

### [PR #12: Add SAMS test suites and improve Postman validation](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/12)

Opened by `amenosuta`; **merged**. Merged by `amenosuta` at `2026-11-13T08:37:25Z` (UTC), merge `9d51106`. 18 changed file(s); 3 commit(s).

- `00fed34` — `jsahdihd eifhie` (recorded author: Osuta Amen Joel).
- `df84f44` — `delete pratice files` (recorded author: Osuta Amen Joel).
- `116142c` — `Add Amen SAMS verification deliverables` (recorded author: Osuta Amen Joel).

No conversation comments or submitted reviews were returned by the connector at inspection.

**Decision:** Useful verification work. Body reports 134 requests/362 assertions passing and explicitly says copied backend/browser suites were not rerun. Preserve all five new validation cases, examples, checker and setup notes. Its general verification-summary.json still reports 129/337, while postman/VALIDATION.md reports the newer result; align these records in a follow-up. The docs/POSTMAN_DEMO.md edit is a narrow test handoff, not a reason to restore general docs/ ownership to Joel.

### [PR #13: Brian kan](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/13)

Opened by `brian-khan`; **merged**. Merged by `brian-khan` at `2026-11-13T08:42:20Z` (UTC), merge `a015c22`. 39 changed file(s); 3 commit(s).

- `0b64666` — `deleted practice files` (recorded author: KANYESIGYE BRIAN).
- `137fd09` — `pushing backend files` (recorded author: KANYESIGYE BRIAN).
- `64ca135` — `Faculties, programmes, student placement and database relationships; coordinate catalogue-service changes.` (recorded author: KANYESIGYE BRIAN).

No conversation comments or submitted reviews were returned by the connector at inspection.

**Decision:** Broad import of the complete service set, Prisma/schema/migrations and data; also contains inherited changes outside that area. Keep accepted provenance, review cumulative effects by commit, and narrow future academic changes to catalogue/placement/course plans. Do not attribute every file in the PR diff to Brian personally.

### [PR #14: Add files via upload](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/14)

Opened by `wokwabacharles4-jpg`; **merged**. Merged by `wokwabacharles4-jpg` at `2026-11-13T08:59:11Z` (UTC), merge `61c0091`. 4 changed file(s); 1 commit(s).

- `4c521cf` — `Add files via upload` (recorded author: wokwabacharles4-jpg).

Recorded comments/reviews:

- [`wokwabacharles4-jpg`](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/14#issuecomment-6848581216): contributed to the SAMS internet project

**Decision:** Merged more wrong-path authentication copies under backend/src/. Here auth.js contains middleware, while authenticate.js contains controller handlers; their imports expect the missing middleware/controllers nesting. Fix folder placement and names against the runnable baseline, preserving any unique changes. Repeating an upload one directory deeper did not fix the import graph.

### [PR #15: Student pages, check-in feedback and shared styling where needed.](https://github.com/mugmarp/Group_B_Etivity_5_WEB/pull/15)

Opened by `aannibow-wq`; **merged**. Merged by `aannibow-wq` at `2026-11-13T09:49:50Z` (UTC), merge `2e76eae`. 25 changed file(s); 1 commit(s).

- `62367d7` — `Student pages, check-in feedback and shared styling where needed.` (recorded author: @aannibow-wq).

No conversation comments or submitted reviews were returned by the connector at inspection.

**Decision:** Imports the whole frontend, beyond the student-only title. It correctly replaces Andrew’s file named frontend/public/js with a directory of modules, including the canonical examiner module, but deletes frontend/public/examiner.html (193 lines). The lecturer shell is missing in current main and #7 restores it. Keep shared baseline provenance, restore that page through a reviewed integration change, and narrow future student work to specific files.

## PR titles, descriptions and review comments to use next

These are drafts for the team to adapt to actual changes. They were not posted. Do not state “tests passed” until the named tests were executed against that revision. Existing merged PR titles remain historical; a new correction PR can explain the earlier path or scope mistake without rewriting it.

### Wokwaba Charles

**Suggested PR title:** `fix(auth): consolidate authentication modules in their runtime paths`

**Description content:** Reconcile the duplicate files from #8, #9 and #14 into controllers/auth.js and middleware/. Preserve any unique behavior, remove unused aliases, and check login, refresh, role denial and error responses.

**Suggested review/handoff comment:** The earlier uploads were accepted by Git but their paths do not match their imports. Please compare the duplicate contents and verify the canonical entry points before merging this correction.

### Kanyesigye Brian

**Suggested PR title:** `fix(academic): reconcile programme data and course-plan integration`

**Description content:** Use #13 as acknowledged baseline import. Limit this follow-up to academic catalogue, placement, schema/migration and plan changes. State each affected model and test registration mapping, retained withdrawals and new-plan behavior.

**Suggested review/handoff comment:** Please separate inherited files from your actual new edits and avoid replacing the entire services/ tree. Coordinate the schema and seed with the feature authors.

### Kwesiga Lewis

**Suggested PR title:** `fix(timetable): reconcile timetable services and scoped reference handling`

**Description content:** Retain #10’s accepted imported services. Name the actual timetable/reference/student-day changes and check Kampala boundaries, programme scope, shared-group matching and dated/reference separation.

**Suggested review/handoff comment:** The earlier diff included non-timetable services. This follow-up should identify only the timetable changes and retain the other members’ accepted baseline work.

### Akatuwijuka Annibow

**Suggested PR title:** `fix(student): scope student interface changes and preserve lecturer pages`

**Description content:** Acknowledge #15’s frontend import and correct js/ directory. List actual student UI changes; ensure examiner.html is restored through integration and account, report and lecturer modules remain available.

**Suggested review/handoff comment:** Please keep the js/ directory repair, coordinate the missing lecturer page with Generous and Edwine, and avoid another blanket frontend replacement.

### Natweta Cyril

**Suggested PR title:** `fix(attendance): verify class actions and check-in rules`

**Description content:** Change the attendance service and relevant route sections only. Describe the actual rule change; verify enrolled/unenrolled users, expired/closed windows, duplicates and reasoned corrections.

**Suggested review/handoff comment:** Use backend/src/services/attendance.js as the implementation. The root duplicate from #11 must not become a second attendance engine.

### Wawangula Generous

**Suggested PR title:** `fix(lecturer): improve the canonical class-register interface`

**Description content:** For #6, record that its file is identical to the existing js/examiner.js. Agree to close it as superseded or amend it with a real lecturer UI change in the canonical path. Confirm examiner.html loads that module.

**Suggested review/handoff comment:** PR #6 currently adds an identical module at the wrong path. Please preserve its history and agree whether to close it as superseded; any new work should modify frontend/public/js/examiner.js and verify the lecturer page.

### Mugendawala Mark Paul

**Suggested PR title:** `chore(integration): assemble and verify the shared SAMS baseline`

**Description content:** Name the source revision and all preserved contribution PRs. Integrate missing package/app/server/routes/configuration, preserve Joel’s validation cases and correct path aliases. Record executed setup, role, API and browser checks on the assembled tree.

**Suggested review/handoff comment:** Config PR #5 alone does not make the educational tree runnable. Please review the complete import graph, package files, page shells and contribution provenance before treating a clean merge as integration acceptance.

### Katto Andrew

**Suggested PR title:** `fix(offline): verify queues and versioned application-shell updates`

**Description content:** Work on the real js/ directory, offline stores, synchronization service/routes and worker. Describe actual changes; verify user scoping, pending replay, duplicate receipts, reconnect, reload and old/new client compatibility.

**Suggested review/handoff comment:** The earlier literal file named js is already replaced by a directory in #15. Do not recreate it or clear pending queues as a workaround; verify the existing directory and cache versions.

### Nabaweesi Patricia Mirembe

**Suggested PR title:** `fix(reports): implement report changes in canonical reporting modules`

**Description content:** Acknowledge #11’s duplicate attendance import. Describe actual changes in eligibility.js, pdf.js, report handlers or admin report UI; verify completed-session counting, dates, policy and PDF output.

**Suggested review/handoff comment:** Please clarify the PR account/commit-author mismatch rather than inferring authorship. The root attendance copy does not implement the stated PDF/report task; preserve history and submit any real reporting changes in the report modules.

### Matovu Edwine Levi

**Suggested PR title:** `chore(integration): document and verify the imported SAMS baseline`

**Description content:** Keep #7 draft while agreeing whether it is a shared integration PR. If so, rename its scope honestly and list source revision/imports separately from account changes. Preserve main’s Postman checks, restore examiner.html and remove only confirmed unused aliases in an explicit correction.

**Suggested review/handoff comment:** The merge from main preserved the Postman additions and restored useful integration dependencies. Please update the account-only description to reflect the current 74-file diff and record setup/tests before readiness; avoid claiming every imported module as new account work.

### Amen Joel Osuta

**Suggested PR title:** `test(api): combine validation checks with current course-plan coverage`

**Description content:** Retain #12’s five validation cases, examples and checker. Add the six newer course-plan cases without losing request order or captured IDs. Run the combined collection and update both the summary JSON and validation notes with the actual result.

**Suggested review/handoff comment:** Thank you for distinguishing the executed Newman run from copied suites in #12. Please keep that distinction and replace the stale 129/337 summary only after recording the appropriate tested revision; 140 is currently a structural request count, not a passing run.

## Resolving branch and file conflicts

1. Name one shared integration revision before starting new changes. Group B main, the deployed SAMS release and the migration branch currently represent different states; do not alternate between copied directories without recording the source revision.
2. Keep #7 draft while Edwine and the integration reviewer decide whether to use it as the shared baseline import. It contains missing runtime scaffolding and a successful preservation of main’s Postman changes, but it also inherits legacy path problems. A focused correction can follow or be added transparently; no merge is performed by this report.
3. Existing merged imports remain part of the record. Submit explicit corrective PRs for bad paths/missing pages and narrow feature PRs afterward. Compare aliases before removal and record which unique changes survive.
4. On an unmerged member branch, fetch origin and merge the current target main into that branch. Resolve each conflict by understanding both changes; do not select “ours” or “theirs” across whole folders. Stage the reviewed files and commit with a description of the choices. Push the existing branch so its PR preserves discussion/history.
5. For the Postman conflict, combine the five validation cases with the six course-plan cases, preserve ordering and captured variables, then rerun on a disposable seeded database. Keep saved examples and validation helper alongside the collection. Counts alone do not establish compatibility.
6. For schema conflicts, coordinate additions and create a new migration rather than altering an already applied migration. For shared API/CSS/modules, scope changes to the actual feature and inspect related pages/tests.
7. Review the final changed-file list, actual relative imports and the startup path before merging. Run syntax and appropriate backend/browser/Postman checks against that exact assembled revision. A review request that fails because of quota is not a review approval.
8. Prefer a second member’s review where available; the observed self-merges are a process weakness, not proof that every merged PR is defective. Save final checks and review explanations with the PR. Never fabricate earlier test results or retroactively claim another member’s imported code.

Example commands for a member’s existing branch (replace placeholders with real values):

```bash
git status
git fetch origin
git switch <existing-member-branch>
git merge origin/main
# Inspect and resolve only the conflicting files; preserve both valid changes.
git diff --check
git add <reviewed-files>
git commit -m "fix(integration): reconcile module paths and retain reviewed changes"   -m "Describe which changes from each branch were preserved and which checks actually ran."
git push origin <existing-member-branch>
```

If Git merged without conflicts, no manual resolution commit is required merely to create a message. Still review paths and execute the relevant checks. Do not force-push shared branches or manufacture per-member PRs by assigning copied files after the fact.

## Verification of this allocation update

The review compared public PR metadata/comments, exact commit subjects, changed files, main-tree paths and duplicate blob contents. It also compared collection request names and preserved Mark’s remote README allocation edit. No application, database, Postman collection or Group B remote content was changed by this documentation task. No application regression rerun is claimed. The machine-readable [review snapshot](test-reports/2026-11-15-group-b-pr-review.json) retains the PR state used here.
