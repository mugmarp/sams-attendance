# SAMS server setup and management

Group B · Updated 13 November 2026

This guide explains the existing native hosting arrangement and routine SAMS administration. Commands are run on the VPS as `myvps` unless stated otherwise. Initial installation instructions apply to a new dedicated host; the current server is already configured. Application accounts and the Linux service account are different identities.

## Hosting arrangement

| Item | Current arrangement |
| --- | --- |
| Subscription | Azure Student Subscription virtual machine |
| Operating system | Ubuntu 24.04.4 LTS, x86_64 |
| Operator / public IP | `myvps` / `74.161.160.42` |
| Application URL | https://sams.tirallab.page |
| Resources | Approximately 897 MiB RAM, 6 GiB swap, 28 GiB root filesystem |
| Public entry point | Nginx HTTPS on 443; HTTP on 80 redirects to HTTPS |
| Application | One Node.js 22 Express process, managed by systemd service `sams` |
| Application listener | `127.0.0.1:3100` |
| Database | Native PostgreSQL 16, database/role `sams`, loopback port 5432 |
| Host/database timezone | `Etc/UTC`, verified 13 November |
| Application timezone | Service configured with `TZ=Africa/Kampala`; explicit Kampala input/display conversions |
| Deployment model | Pinned releases with an active symlink; no Docker on this VPS |

Nginx forwards requests to Express. Express serves HTML/CSS/JavaScript and `/api`; Prisma connects to PostgreSQL. A separate frontend server or frontend compilation is unnecessary. The current resource arrangement is a project pilot, not a measured institution-wide capacity guarantee.

## Important locations

| Path | Purpose |
| --- | --- |
| `/opt/sams/releases/<full-commit>/` | Application releases |
| `/opt/sams/current` | Symlink selecting the running release |
| `/usr/local/lib/sams-node/bin/node` | Root-owned Node runtime |
| `/etc/sams/sams.env` | Private environment: database URL, JWT secrets, port and origin |
| `/etc/systemd/system/sams.service` | Application service unit |
| `/etc/nginx/` | Nginx sites, proxy and HTTPS configuration |
| `/var/backups/sams/` | Private local database backup slots and verification record |
| `/usr/local/sbin/sams-backup` | Installed daily backup command |
| `/home/myvps/sams-private-input/` | Private imports and selected operator copies |
| `~/Programming/sams-attendance` | Preserved development/recovery checkout; separate from the running release |

The process runs as the unprivileged Linux user `sams`. Edit the source checkout and deploy a reviewed commit; avoid editing files inside the active release. Dependency installation and release preparation follow the committed helper's current behavior; inspect ownership rather than assuming every prepared file is already root-owned.

## Access and everyday checks

Use the saved `myvps` host in Termix at https://termix.tirallab.page. Direct SSH is also possible where network access permits it. Verify the server identity when configuring a new connection; keep the PEM key private and outside Git.

```bash
whoami
hostname
date -Is
timedatectl show -p Timezone -p NTPSynchronized
readlink -f /opt/sams/current
sudo systemctl status sams --no-pager
sudo systemctl show sams -p ActiveState -p NRestarts -p MemoryCurrent
curl --fail http://127.0.0.1:3100/api/health
curl --fail https://sams.tirallab.page/api/health
free -h
df -h /
sudo ss -ltnp
```

Health verifies the application/database connection and returns server time. It does not prove every workflow, backup or academic configuration is correct. Express and PostgreSQL should remain loopback listeners; public traffic enters through Nginx.

The observed `2026-11-13 04:21:26` host time was UTC: **07:21:26 EAT** in Kampala. NTP was synchronized. An ISO value ending in `Z` is UTC; 08:00 Kampala is 05:00Z. Do not add three hours to stored timestamps globally. Date-only academic fields remain dates; report conversions explicitly interpret stored UTC-convention timestamps before deriving Kampala dates.

## Initial setup on a new host

First inspect existing services, listeners, disk space and backups. Preserve unrelated sites and databases. The supplied server already has this setup, so do not rerun database/bootstrap provisioning on it.

1. Use Ubuntu packages for PostgreSQL 16/client, Nginx and Certbot; use a verified Node.js 22+ runtime with npm. Check package footprints and existing installations before installing. Browser-test tooling belongs on the development/CI machine.
2. Configure DNS for `sams.tirallab.page` to the intended public host. Azure/network rules must allow the intended SSH access and public 80/443; application/database ports stay private.
3. From a reviewed checkout, run `deploy/native/prepare-release.sh` as root with the full commit SHA, verified Node binary and npm CLI path. It stages the pinned source and locked dependencies and checks at least 1 GB free disk headroom.
4. For a new dedicated PostgreSQL cluster only, review `deploy/native/postgresql-small.conf`. Its conservative budgets include 20 connections and 64 MiB shared buffers. Applying cluster-wide settings to a shared server needs separate review.
5. Run `sudo python3 deploy/native/configure-database.py` only for a new empty installation. It creates the dedicated role/database and a mode-0600 environment file. It refuses existing configuration or database identities.
6. Load the private environment and deploy migrations. Bootstrap the first accounts only on an empty User table, using `backend/scripts/bootstrap-accounts.js` with a new private credential output path. It creates no courses or marks. Preserve the generated file privately.
7. Install the systemd unit from `deploy/native/sams.service`, select the prepared release and start SAMS. Confirm health locally before configuring public routing.
8. Use `nginx-http.conf` for the existing webroot/ACME procedure; obtain the domain certificate, then apply the reviewed `nginx-https.conf`. Run `sudo nginx -t` before every Nginx reload. Keep unrelated sites intact and configure certificate renewal/reload.
9. Install the backup script/service/timer, verify an actual restore and export a private off-host copy. Check HTTPS role access with `smoke-check.py`.

See `NATIVE_DEPLOYMENT.md` and the templates for exact installation details. This guide does not supply a destructive “reset the server” command.

## Environment and service management

The root-only `/etc/sams/sams.env` contains DATABASE_URL, distinct JWT secrets, NODE_ENV, HOST, PORT, FRONTEND_URL and TRUST_PROXY. Never paste its contents into Git, chat, slides or logs. Quote DATABASE_URL because its ampersands are shell operators when loaded by a shell.

```bash
# Review/edit privately on the server:
sudoedit /etc/sams/sams.env

# After an environment-only change:
sudo systemctl restart sams
curl --fail http://127.0.0.1:3100/api/health

# After a reviewed unit-file change:
sudo systemctl daemon-reload
sudo systemctl restart sams
```

Changing JWT secrets invalidates existing token validation. Do not rotate them as a routine restart step. Service budgets include a 160 MiB V8 old-space target and systemd memory controls; old-space is not total process memory. Investigate growth or killed requests before raising limits on the small VM.

## Deploying an application update

Commit and push reviewed changes, run the isolated verification suites, and obtain the full 40-character commit SHA. From a reviewed checkout on the VPS:

```bash
sudo bash deploy/native/activate-release.sh FULL_40_CHARACTER_COMMIT_SHA
```

Replace the placeholder; it is not a literal commit. The activator takes a private custom-format dump, prepares the release if missing, applies migrations, switches the active symlink, installs the service unit, restarts and runs health/HTTPS smoke checks. Activation errors restore the previous application/unit; additive database changes remain. It does not seed/reset the live database.

Inspect the helper before running it. It assumes the existing native layout and installed runtime. Verify migration compatibility and preserve the previous working release. Confirm the deployed path with `readlink -f /opt/sams/current`; use `SERVER_READINESS.md` for the latest executed rollout record rather than assuming the checkout's HEAD is live.

For application rollback, select a known compatible earlier release and service unit, restart and check health. Application rollback does not reverse a migration. Do not replace live data with an older dump merely to roll back code; accepted attendance since the backup would need reconciliation.

## Logs and troubleshooting

```bash
sudo journalctl -u sams -n 100 --no-pager
sudo journalctl -u sams --since '30 minutes ago' --no-pager
sudo systemctl status nginx postgresql --no-pager
sudo nginx -t
sudo systemctl list-timers --all
```

| Symptom | Start here |
| --- | --- |
| HTTPS gives 502 | Check SAMS status, loopback health, journal and Nginx upstream configuration. |
| Local health fails | Check application logs, environment loading and PostgreSQL availability; do not reset the database. |
| SSH times out while website works | Check network route/Azure SSH access and use the saved Termix session. A timeout does not prove the key is wrong. |
| Three-hour difference in a timestamp | Identify UTC versus EAT and explicit offsets before changing anything. Check service TZ and timestamp conversion. |
| Student sees no courses | Check My courses status, valid registration/placement, one current term, published group plan and effective enrollment dates. |
| Courses exist but check-in is unavailable | Enrollment alone does not create a dated session or open the lecturer's attendance window. |
| First sign-in opens My account | The account has a temporary password and must replace it before workspace access. |
| Memory/disk pressure | Inspect `free`, `df`, service memory, logs, release sizes and backup retention. Present candidate cleanup before deleting unrelated files. |

A service restart does not repair invalid academic data. Validate course plans, placement and session dates through their normal workflows.

## Academic administration

1. Confirm faculties, programmes, durations and student registrations. Resolve repeat/deferral/track exceptions with recorded reasons.
2. Configure one current reviewed academic term in Timetable setup, with known teaching dates and exclusions. Semester end is not automatically a verified final teaching day.
3. In Course setup, choose faculty, programme, group and term. Preview source labels, exclude activities/contradictions and assign lecturer accounts.
4. Publish the compulsory/elective course list after preview and registrar reauthentication. Students receive missing compulsory courses on sign-in/workspace entry; My courses supports permitted elective confirmation.
5. Use cohort preview/apply to prepare existing students together. Existing withdrawals/manual enrollment dates are preserved; new links start on the Kampala setup date.
6. Review future dated classes through the lecturer/timetable workflow. A weekly reference does not open attendance. Complete held classes and retain reasons for corrections.

The project pilot contains synthetic lecturer accounts and provisional compulsory classifications. They are not verified institutional teaching assignments or an approved curriculum. Source corrections and remaining scheduling/audit limitations are documented in the README and review documents.

## Credentials and account recovery

Private server files include:

- `/etc/sams/initial-accounts.json`
- `/etc/sams/student-cohort-credentials-20261112.json`
- `/etc/sams/practice-student-credentials-20261112.json`
- `/etc/sams/programme-lecturer-credentials-20261113.json`

An authorized operator can read a particular file privately, for example:

```bash
sudo cat /etc/sams/programme-lecturer-credentials-20261113.json
```

These files record initial/reset values and become stale after user password changes. The private PC Markdown file is also a snapshot. Neither files nor passwords belong in Git. Generated credentials are 12 characters; chosen passwords accept at least 8 characters through a maximum of 72 UTF-8 bytes.

Use Accounts for verified student/lecturer resets, disable/reactivate actions and ending sign-ins. Recovery requires the registrar's current password and a reason. A reset revokes prior sign-ins and requires password replacement. Use My account for your own password. Provisioning scripts do not replace normal account recovery.

The project pilot provisioning command is `backend/scripts/provision-course-pilot.js --preview`; `--apply PRIVATE_CREDENTIAL_OUTPUT.json` makes the explicitly authorized pilot changes. It is not a general importer for institutional staff/curriculum, and rerunning it is unnecessary for ordinary student login.

## Backups and recovery

```bash
sudo systemctl status sams-backup.timer --no-pager
sudo systemctl start sams-backup.service
sudo journalctl -u sams-backup.service -n 30 --no-pager
sudo python3 /opt/sams/current/deploy/native/verify-backup.py
```

The backup job uses seven UTC weekday slots, `/var/backups/sams/daily-1.dump` through `daily-7.dump`. Each slot replaces the previous week's corresponding backup only after dump validation. The verifier restores today's slot into a newly created disposable database, compares six core-table counts, drops that disposable database and exports a private timestamped copy under `/home/myvps/`. It does not restore over live SAMS.

Download the exported copy through Termix SFTP to a private PC location. Compare the printed SHA-256 using `sha256sum PATH_TO_DOWNLOADED_DUMP` on the PC. Keep it outside Git and restrict file permissions. The latest recorded restore on 13 November covered 61 users, 91 courses, 381 enrollments, 3 sessions, 2 attendance records and 1 attendance change; later legitimate activity can change those counts.

A matching table count is a useful restore check, not an exhaustive comparison of every row or every new course-plan table. A full recovery rehearsal must also check authentication, plan relationships and application workflows in isolation. Recurring external backup scheduling remains unfinished; daily copies on the same VPS do not protect against losing that VPS/disk.

For actual data recovery, pause conflicting writes, preserve a copy of the current state, restore into a separate recovery database, inspect it and reconcile accepted records before choosing a cutover. Do not improvise a destructive restore command against the live database.

## Verification and maintenance routine

After a deployment: verify the release, service/health, scoped role access, course setup and backup restoration. After academic changes: review affected group/course lists and effective dates without generating artificial attendance. Regularly check disk/RAM, failed units, certificate renewal, backup success and availability of an external recovery copy.

Run backend fixtures, browser suites and the mutating Postman collection only against a disposable test database on development/CI infrastructure. The final recorded course-setup baseline is 61 backend tests, 34 browser tests and 135 Postman requests / 351 assertions. See `TESTING_HISTORY.md` for evidence and limits.

Keep detailed commits, reviewed migration notes and dated deployment records. Remaining open audit findings and physical-device/load acceptance still matter even when the service is healthy.
