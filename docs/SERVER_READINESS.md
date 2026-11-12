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
