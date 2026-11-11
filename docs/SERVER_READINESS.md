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
