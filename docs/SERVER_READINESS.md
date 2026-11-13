# SAMS VPS readiness observations

Read-only inspection on 11 November 2026 using the user's existing Termix session. Intended SAMS application origin: **https://sams.tirallab.page**. No packages, services, firewall rules, DNS records or application deployments were changed; no files were deleted. The SSH key was used for an attempted direct connection, not copied into the repository or the browser.

Direct SSH to the supplied public address on port 22 timed out from the workstation. The existing Termix session provided terminal access. This distinguishes connectivity from credential validity: a timeout did not establish whether the key would authenticate.

## Observed resources

| Item | Terminal observation |
|---|---|
| Root filesystem | Approximately 29 GiB total, 26 GiB used, 2.8 GiB available; `df` reported 91% usage |
| RAM | 897 MiB total, 376 MiB used, 86 MiB free, approximately 520 MiB available |
| Swap | 6,143 MiB total, approximately 150 MiB used |
| Home directory | Approximately 16 GiB |
| `~/.hermes` | Approximately 8.2 GiB |
| `~/Programming` | Approximately 3.0 GiB |
| `~/.npm`, `~/.cache`, `~/.local` | Approximately 1.2 GiB each |
| `~/node_modules` | Approximately 183 MiB |
| `/usr` | Approximately 3.3 GiB |
| `/var/log` | Approximately 405 MiB, including approximately 265 MiB in journals |
| `/var/cache` | Approximately 153 MiB |

Values are rounded command output from one observation, not capacity measurements or a recommendation to delete these directories. Parent totals overlap child directories. No conclusion was drawn about which Hermes data is disposable.

The listener inspection showed SSH on port 22, an HTTP listener on port 80 and local DNS listeners. Actual domain routing, TLS termination and existing reverse-proxy configuration still require inspection before adding the SAMS domain. Docker availability/permissions and PostgreSQL deployment readiness were not established by this inventory.

## Before deployment

1. Identify the contents and retention needs of the largest directories, especially Hermes data, without deleting project history. Choose any cleanup only after confirming recovery requirements. Check the size and peak disk use of the intended runtime image, database, migrations, logs and backups against available headroom.
2. Verify existing services and the actual proxy/TLS path, DNS control for `sams.tirallab.page`, persistent storage and a backup destination outside this VPS. Preserve unrelated applications.
3. Select a measured Node/PostgreSQL memory and connection budget and test the pilot workload, including check-in/reconnect bursts and reports. This idle resource snapshot does not prove attendance capacity.
4. Deploy prepared artifacts, apply non-destructive migrations, provision real accounts and verify restoration/rollback. Do not build Android packages or run browser-test infrastructure on this small production host.

Implementation order and acceptance checks remain in [WEB_IMPROVEMENT_PHASES.md](WEB_IMPROVEMENT_PHASES.md). This document records readiness observations, not a completed hosting phase.

## Native pilot deployment — 12 November 2026

The earlier read-only inventory above is historical. A native pilot was deployed with the user's authorization on 12 November at **https://sams.tirallab.page**. No Docker daemon/container was introduced. The preserved `~/Programming/sams-attendance` Hermes checkout remains on its recovery branch; the deployment uses a separate pinned release.

| Item | Verified deployment observation |
|---|---|
| Running application release | `fed7aad8d2d59c53ba806b23840597cbdb82f8f3` under `/opt/sams/releases`, selected by `/opt/sams/current` |
| Runtime/services | Existing Node 22.23.2 copied to a root-owned runtime; dedicated systemd `sams`; native PostgreSQL 16; existing Nginx |
| Exposure | Express `127.0.0.1:3100`; PostgreSQL `127.0.0.1:5432`; Nginx serves public HTTPS, HTTP redirects with 308 |
| Certificate | Valid Let's Encrypt certificate retrieved through the domain's webroot; Certbot renewal timer active with Nginx reload hook |
| Accounts/data | Three requested example emails with private generated passwords; 0 courses/enrollments/sessions/attendance at bootstrap; no production seed/reset |
| Schema | All five additive migrations applied to the dedicated new database |
| Application memory | 61,796,352 bytes current (~59 MiB), 128,454,656 bytes peak (~123 MiB); zero systemd restarts at the observation |
| Host memory | 897 MiB total, 437 MiB used, about 459 MiB available; swap 184 MiB used at that observation |
| Disk after approved cleanup | About 3.2 GiB available, 89% used |
| Cleanup scope | Only the explicitly approved `/home/myvps/.npm` package cache was cleaned using npm; approximately 1 GiB recovered. Other caches, Hermes code/history/tools and unrelated files were preserved. |
| HTTPS acceptance | Three role logins/current identity/scoped reads; student-to-admin denial, anonymous denial and wrong-password rejection passed |
| Bounded smoke | Ten HTTPS health/database requests, at most five concurrent: all succeeded; server-side median 56 ms/max 140 ms. This does not establish attendance or institution-wide capacity. |
| Recovery | Daily seven-slot private dump timer active; first dump restored into a separate disposable database, with all six core table counts matching; the scratch database alone was dropped |
| Off-VPS copy | Verified 39,376-byte dump downloaded privately to the operator workstation; SHA-256 matched the server copy. A regularly scheduled external destination remains to be established before real-data use. |

Private environment and initial credentials are outside Git under `/etc/sams`, root-only. Initial passwords are in `/etc/sams/initial-accounts.json` (0600); the operator can read them privately using sudo. They are **not** the public seed password. Do not put this file or a live dump into a PR. The initial identities are presentation accounts, not institutional user records.

The first migration attempt exposed an unquoted DATABASE_URL query string when loading the environment through a shell; it failed before running migrations. Quoting was corrected, migrations then succeeded, and the provisioning template was fixed in commit `53af559`. The running application backend is unchanged by the subsequent operator-script/test fixes. Current source includes the repeatable HTTPS smoke and restore tools.

Both hosted checks passed at `00ac3a7`, including 35 backend tests, 25 browser tests, 95 Postman requests/279 assertions and packaged Compose startup: https://github.com/mugmarp/sams-attendance/actions/runs/43152630643 . Physical-device PWA/install/update testing, approved teaching exceptions/counting policy, real registrar accounts/enrollments, recovery/revocation workflow, recurring off-site backups and broader load testing remain adoption requirements. Android wrapping remains deferred.

## Academic and account updates — 12 November 2026

Current running code: **18849ce101710e606da4e34244bcba655ea93649**, including the account feature in `7158703`. All eight additive migrations are applied. Existing account passwords were preserved. The original bootstrap observations above remain historical, rather than describing the current dataset.

- The private academic import added 51 students: the 11 supplied BSE records and 40 synthetic records across BCS/BIT/BBA/BME. No attendance/enrollment was inferred from their programme or registration. Account credentials and the supplied roster remain outside Git.
- The authorized controlled walkthrough then added two clearly named synthetic BSE Year II students, two `-P` practice offerings and four enrollments. Course titles follow SWE2106 Internet Technology and Web Design and SWE2103 Probability and Statistics. The existing sample lecturer is assigned; no source lecturer name is turned into an account or claimed assignment.
- Three sessions were created: a practical rehearsal on 12 November, and practice Thursday intervals on 19 November (08:00–10:00 and 10:00–13:00 EAT). The current practical's time was an explicit rehearsal, not a claimed official timetable period. A repeated setup created zero courses, enrollments or sessions.
- Only the two synthetic practice students were marked during the HTTPS exercise. One checked in by code; the other used a prepared lecturer roster operation, whose replay preserved one logical change. The practical was completed and its PDF showed one attended/completed class and 100% for each. Future sessions remain scheduled and do not enter the denominator. The supplied 11-person roster remains unenrolled and unmarked.
- Current totals: **56 accounts (54 students), 2 courses, 4 enrollments, 3 sessions, 2 attendance records and 1 attendance-change entry**. This is a pilot dataset, not institutional attendance.
- HTTPS acceptance passed for all three roles after restart. Ten health/database requests at concurrency five passed (median 25 ms, max 52 ms). Observed application memory was approximately 70 MiB with zero service restarts; free disk approximately 3.0 GiB. These observations do not establish whole-university capacity.
- Both hosted checks passed on the deployed source, including PostgreSQL 16/packaged startup: https://github.com/mugmarp/sams-attendance/actions/runs/43242093316 . Local complete checks passed 51 backend tests, 33 browser tests and 129 Postman requests/337 assertions.
- The post-walkthrough daily dump restored in a separate disposable database with matching core counts. The 102,966-byte export was downloaded to the workstation privately and matched SHA-256 `dcf4bfb1fadf131c9b99895fa4e11d69307b878ea789fc2b1257a1df699eeeb5`. The local path is recorded in the private runtime recovery receipt. A recurring off-site destination is still required.

Private credentials: initial accounts remain under `/etc/sams/initial-accounts.json`; imported cohort credentials under `/etc/sams/student-cohort-credentials-20261112.json`; the two practice identities under `/etc/sams/practice-student-credentials-20261112.json`. Files are mode 0600. Do not share these passwords in Git or replace them with public test passwords. Registrar recovery still requires verified operator intervention if all registrar credentials are lost.

The academic calendar remains reference information. MUST's current calendar lists 17 August 2026 as lecture start, 29 October as graduation and 12 December as Semester 1 end: https://www.must.ac.ug/academic-calendar/ . No unconfirmed holiday/teaching exceptions or historical attendance were generated. Physical Android PWA installation/update/offline acceptance, recurring off-site scheduling, actual teaching assignments/policy approval and broader workload measurements remain open. Android wrapping stays deferred. The Group B educational repository was not modified.

## Readable initial credentials — 12 November 2026

Running code is now `316e9e88bb684312f48b54ac99c024bdb2cbe97b`. New operational bootstrap and student-cohort imports generate 16-character ASCII credentials with two pronounceable groups and four digits, using crypto.randomInt and uniqueness within a batch. This rollout does not reset any account; existing credential files retain their original contents.

A private pre-upgrade dump was taken, and deployment found no pending migrations. A before/after comparison of all user IDs, password hashes, auth versions, active status and password-change flags matched. Three role sign-ins/scoped HTTPS reads and ten bounded health requests passed. A read-only generator check on the deployed release verified 1,000 distinct formatted credentials and bcrypt verification without creating an account or printing passwords. Observed application memory was about 76 MiB with zero service restarts; disk headroom about 2.8 GiB.

The isolated local provisioning check created three bootstrap and two cohort users, verified hashes/private files/no stdout disclosure, rejected repeated bootstrap, and preserved hashes/auth versions on repeat import. Backend tests now pass 53 cases. The generation change does not fix the separate open audit findings, change the minimum password policy, schedule off-site backups or claim physical-device acceptance.

### Twelve-character cohort credentials — 12 November 2026

Release `6e92d276ccc480b8a7a4c7d69e96247350238390` is active. Generated passwords are now 12 ASCII characters, and account creation, imports, password changes and resets accept passwords from 8 characters through 72 UTF-8 bytes. All 54 backend tests and syntax checks passed before deployment; the native smoke check passed with no automatic restarts.

The operator-authorized cohort reset checked all 51 student identities and confirmed their passwords still matched the private initial credential file. All 51 received distinct readable 12-character temporary passwords. Each reset incremented its sign-in version, required a password change and wrote an audit event in the same database transaction. The previous private credential file was backed up; the current root-owned mode-0600 file and matching operator copy were updated. Every new password was verified against its stored hash, and every previous password was verified as invalid. Other accounts were unchanged.

A bounded live check confirmed a cohort student can sign in with its new password, is asked to change it, and sees an 8-character minimum in the HTTPS account form. The database still contains 56 users, 2 courses, 4 enrollments, 3 sessions, 2 attendance records and 1 attendance change. A fresh recovery dump restored successfully with matching core counts after the reset. No credentials or private roster are included here.

### Server clock verification — 13 November 2026

The operator supplied a fastfetch snapshot showing `2026-11-13 04:21:26`, Ubuntu 24.04.4, 897 MiB RAM (461.47 MiB used), 6 GiB swap (144.10 MiB used) and 91% disk utilization. Termix inspection then returned `2026-11-13T04:23:04+00:00`, `Timezone=Etc/UTC` and `NTPSynchronized=yes`. The supplied 04:21:26 UTC corresponds to 07:21:26 EAT in Kampala. The clock was synchronized; the observed three-hour difference was its display timezone, not proof of clock drift.

PostgreSQL `SHOW TimeZone` returned `Etc/UTC`; `Session.startTime` was verified as `timestamp without time zone`. Existing application values follow a UTC convention. The revised report query explicitly attaches UTC before converting to the Kampala calendar date. The revised SAMS service declares `TZ=Africa/Kampala`, while inputs and displays continue using explicit Kampala offsets/timeZone settings. No global three-hour adjustment or timestamp-type conversion is applied. The host timezone remains UTC.

At this read-only check the running release was `6e92d276ccc480b8a7a4c7d69e96247350238390`, active with zero automatic restarts, and the live database still had only the two BSE practice offerings. Deployment and new course-plan data are recorded separately below after execution.

### Programme course-plan rollout — 13 November 2026

Release `cbcc946c6b65988f3eac931d93e8fbf384234a6d` is live after backup-first activation through the operator's Termix browser session. Additive migrations introduced plans, enrollment origin, practice classification and programme-specific offering keys. HTTPS role smoke checks and ten bounded health/database requests passed; the service remained active with zero automatic restarts, approximately 93 MiB measured application memory after provisioning. Both GitHub verification runs passed: [feature](https://github.com/mugmarp/sams-attendance/actions/runs/43366913183), [provisioning fix](https://github.com/mugmarp/sams-attendance/actions/runs/43367210578).

The first provisioning attempt omitted the existing term API's required reviewed flag and stopped at HTTP 400 before account/course/enrollment creation. The fix was committed separately and deployed. The successful run created five synthetic project lecturer accounts, 89 programme-specific offerings and 13 published group plans, covering 53 students. It added 376 COURSE_PLAN enrollment links and preserved all five pre-existing MANUAL links. Final counts: 61 users, 91 courses, 381 enrollments, 3 sessions, 2 attendance records and 1 attendance change. No historical classes or marks were generated. The original three sessions and two marks remain intact.

Plan course counts: BSE II 8; BCS I/II/III 6/7/8; BIT I/II/III 7/9/8; BBA I/II/Accounting III 6/6/3; BME I/II/III 7/7/7. Activities, malformed labels and contradictory titles within a group were excluded, with student-visible review notes. These are project curriculum/lecturer assignments, not institutional approval. Compulsory/elective classification and source anomalies remain registrar review matters. Future dated sessions still require lecturer/timetable review.

The post-change daily backup restored successfully into a separate disposable database with matching core counts. Its 151,727-byte recovery copy was downloaded privately to the operator's PC and verified against SHA-256 `49a0c3c3b18fed3b99ad05ac434093df15b6832346f0a67e8725c1bbd31a0a7e`. New lecturer credentials were saved privately on the server and downloaded into the private PC credential document. No existing account password was reset during this rollout. Recurring external backup scheduling is still pending.

### Attendance audit fixes and confirmed Friday sessions — 13 November 2026

Release `11a5e18302e32ae903d4779e95d14ebe5d082431` is active after a private pre-release dump (`before-release-20261113T092152Z.dump`) and native activation. HTTPS role smoke checks and ten health requests passed. The service reported zero automatic restarts and approximately 135 MiB at the post-restart sample; this is not a workload-capacity result. No migration or credential reset was required for these fixes.

The operator explicitly confirmed BSE II Friday Web Design 11:00–13:00 EAT. The reviewed helper at `4583289` checked the lecturer, BSE II group and room for conflicts, then used timetable preview/apply to create exactly two SCHEDULED sessions on 20 and 27 November (08:00–10:00Z). Preview had no warnings or blockers. No window was opened or attendance mark created. The lecturer page in the Codex browser showed 20 November 11:00–13:00, and Start check-in was disabled for this future class.

Post-change core counts: 61 users, 91 courses, 381 enrollments, 5 sessions, 2 attendance records and 1 attendance change. A fresh daily backup restored into a disposable database with matching counts. Its private server export is `/home/myvps/SAMS-recovery-2026-11-13-094948.dump`, 153,812 bytes, SHA-256 `30fca22e6d35b18986caf44b770186ae870adae1a1e3d21c64f0c69b243280b1`. This latest export is on the server; the previously verified off-server copy predates these two new sessions. Recurring external backup remains pending.

Old open clients need one ordinary reload to obtain the new code; the new client then offers future update notices without clearing pending attendance. Shared-code physical-presence assurance and institutional late rules remain policy matters. Other dated classes need their own reviewed times.

### Page-loading visibility fix — 13 November 2026

Release `f7626bfac94f7a24a3c3c35c950ccc6470474006` is live. The frontend now gates static page bodies behind neutral loading until workspace/login initialization is ready; a compatibility helper handles older cached modules. No database or API behavior changed. All 39 browser cases and frontend syntax checks passed locally. Native activation saved `before-release-20261113T101944Z.dump`; HTTPS role and ten health/database checks passed. The service was active with zero automatic restarts, approximately 106 MiB at the sampled time. Codex-browser acceptance confirmed the new markup and completed account workspace without altering account settings.
