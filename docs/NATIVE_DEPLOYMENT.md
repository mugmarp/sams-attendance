# Native deployment on the small VPS

Chosen on 12 November 2026: systemd + one Node 22 process + native PostgreSQL 16 + existing Nginx. Docker remains an optional local/CI tool. The application origin is https://sams.tirallab.page. Native deployment avoids container image storage and an extra daemon; it does not remove application/database memory costs or prove capacity.

## Layout and budgets

- `/opt/sams/releases/<full-commit>`: pinned release, root-owned after dependency installation; `/opt/sams/current` selects the active release. Preserve the previous release for rollback.
- `/usr/local/lib/sams-node/bin/node`: root-owned copy of the verified existing Node 22 binary. systemd does not execute an operator-writable home-directory binary.
- `/etc/sams/sams.env`: root-only environment; loopback port 3100, production mode, exact HTTPS origin, separate random JWT secrets and three Prisma database connections.
- Dedicated unprivileged `sams` service account; systemd filesystem protections, restart limits, `MemoryHigh=256M`, `MemoryMax=320M`, and V8 old-space target 160 MiB. Old-space is not a total-process memory cap. Exceeding the service cap can terminate requests, so validate under load before increasing usage.
- Dedicated PostgreSQL database/role, TCP bound to 127.0.0.1, 20 total connections, 64 MiB shared buffers, 2 MiB work memory, bounded maintenance/WAL settings. These are pilot starting budgets, not a guarantee. Do not apply cluster-wide settings to a shared database server without review.
- Nginx handles HTTPS and proxies to loopback; it overwrites forwarding headers for the single trusted proxy. Existing default/unrelated sites remain intact. DNS must resolve to this VPS; upstream firewalls must allow 80/443.
- Dedicated Nginx logs rotate independently. systemd logs have service-level rate limits; inspect journal disk growth without changing unrelated logging policy.

## Prepare, migrate and start

Read every command/configuration before applying. Use the committed templates in `deploy/native`. Installation is deliberately staged; these files do not indiscriminately reconfigure an existing host.

1. Inventory current listeners, site configuration, free RAM/disk, databases and backups. The initial observed root disk had 2.8 GiB available. Preserve the Hermes checkout and its recovery branch. Do not clean unrelated caches/history implicitly.
2. Install PostgreSQL 16/client and Certbot from the Ubuntu repositories. Reuse installed Nginx/Node. Inspect the simulated package footprint first. No frontend build or browser-test tools belong on this VPS.
3. Run `sudo bash deploy/native/prepare-release.sh FULL_COMMIT EXISTING_NODE_BINARY EXISTING_NPM_CLI`. It validates the commit shape/Node version and at least 1 GB free headroom, fetches the pinned archive and installs locked dependencies serially. Prisma tooling is initially retained for migrations; after migration/bootstrap, prune dev dependencies. No frontend compilation is required.
4. Confirm the PostgreSQL cluster is new/dedicated before installing `postgresql-small.conf` into its conf.d and restarting it. Run `configure-database.py` as root. It refuses any existing SAMS database/role/environment and prints no secrets. An interrupted setup is reviewed manually rather than resetting data. For an existing operational database, take and verify a dump first and follow an explicit reviewed migration instead.
5. In a root shell, load `/etc/sams/sams.env` with export enabled and run the release's Prisma `migrate deploy` as `sams`. Never use `migrate reset`, `db push` or production seeding. Configure new releases with the same private environment. Before each later migration, save a custom-format dump and test restore.
6. For this requested presentation instance only, bootstrap the familiar example emails with `backend/scripts/bootstrap-accounts.js /var/lib/sams/initial-accounts.json`, running as `sams` with the private environment. This refuses nonempty User tables and exclusively creates a 0600 credentials file. It generates strong passwords, creates no course/attendance records and never uses the public seed password. Move the credentials file to `/etc/sams/initial-accounts.json` root-only afterward. Real account provisioning still requires actual registrar data and policy.
7. Prune development dependencies, make the release root-owned/read-only to the service, link current, install/verify the systemd unit, and start it. Verify loopback health and the absence of public Node/PostgreSQL listeners.
8. Install the domain's HTTP-only Nginx block for ACME. Test `nginx -t` before reloading. Obtain a certificate using the existing HTTP listener/webroot; then add the HTTPS block and test/reload again. Do not replace the default site or claim TLS works until externally verified. Configure certificate renewal to reload Nginx after a successful renewal.
9. Test external HTTPS, login/role rejection and application/database access with private credentials; do not execute destructive Postman/backend tests against the live database. Observe memory, connection counts and disk growth during a bounded synthetic smoke check.

## Backups and rollback

Install the provided backup service/timer and `/usr/local/sbin/sams-backup`; create `/var/backups/sams` owned by postgres mode 0700. The job produces verified custom-format dumps in seven alternating daily slots, using an atomic rename after success. Local backup slots overwrite the previous week's corresponding slot. These are recovery copies on the same disk, **not disaster recovery**. Copy at least one verified backup off the VPS and establish an external destination/retention schedule before real student data or pilot expansion. Keep private credentials and dumps out of Git.

Test restoration into a separate temporary database and compare core counts; drop only that explicitly disposable restoration database after verification. Record the procedure and result. A database dump contains sensitive records even when the application is public.

For application rollback, stop SAMS, point `/opt/sams/current` to the previous verified release and restart/check health. Reverting an executable does not undo database migrations. The present migrations are additive, but compatibility with the chosen old release must be checked. Never restore a stale dump over accepted new attendance without reconciliation. Stop the public service and investigate if data compatibility is uncertain.

## Scope of hosting acceptance

A healthy HTTPS application is not institution-wide capacity proof. Confirm teaching dates/exceptions, actual users/enrollments, institutional counting policy, credential recovery/revocation, physical-device offline behavior and external backup restoration before operational adoption. Android remains deferred. The familiar sample email addresses are test identities, not university accounts.

## Environment loading detail

Quote DATABASE_URL in the private environment file. Its `&connection_limit=3&pool_timeout=10` query parameters are shell operators when left unquoted; systemd and the documented migration shell must both read the same full value. Initial provisioning exposed this quoting issue before any migration/attendance data was written; the environment was corrected and all five migrations then applied successfully.
