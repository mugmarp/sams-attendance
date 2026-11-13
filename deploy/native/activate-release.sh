#!/bin/bash
# Activate a reviewed commit on the existing native SAMS host. No seed/reset.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo'; exit 1; }
sams_commit=${1:?full reviewed commit required}
[[ $sams_commit =~ ^[0-9a-f]{40}$ ]] || exit 1
sams_release=/opt/sams/releases/$sams_commit
sams_previous=$(readlink -f /opt/sams/current)
sams_backup=/var/backups/sams/before-release-$(date -u +%Y%m%dT%H%M%SZ).dump
umask 077
runuser -u postgres -- pg_dump -Fc sams > "$sams_backup"
pg_restore --list "$sams_backup" >/dev/null
if [[ ! -d $sams_release ]]; then
  sams_prepare=$(mktemp)
  curl -fsSL --proto '=https' "https://raw.githubusercontent.com/mugmarp/sams-attendance/$sams_commit/deploy/native/prepare-release.sh" -o "$sams_prepare"
  bash "$sams_prepare" "$sams_commit" /usr/local/lib/sams-node/bin/node /usr/local/lib/sams-node/lib/node_modules/npm/bin/npm-cli.js
  rm "$sams_prepare"
fi
set -a
. /etc/sams/sams.env
set +a
cd "$sams_release/backend"
runuser -u sams -- env DATABASE_URL="$DATABASE_URL" /usr/local/lib/sams-node/bin/node node_modules/prisma/build/index.js migrate deploy
sams_old_unit=$(mktemp)
cp /etc/systemd/system/sams.service "$sams_old_unit"
sams_activated=false
rollback() {
  if [[ $sams_activated = true ]]; then
    ln -sfn "$sams_previous" /opt/sams/current
    install -m 0644 "$sams_old_unit" /etc/systemd/system/sams.service
    systemctl daemon-reload
    systemctl restart sams
    echo "Restored previous application release; additive database schema retained. Backup: $sams_backup"
  fi
}
trap rollback ERR
ln -sfn "$sams_release" /opt/sams/current
sams_activated=true
install -m 0644 "$sams_release/deploy/native/sams.service" /etc/systemd/system/sams.service
systemctl daemon-reload
systemctl restart sams
sams_healthy=false
for sams_attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3100/api/health >/dev/null; then sams_healthy=true; break; fi
  sleep 1
done
[[ $sams_healthy = true ]]
python3 "$sams_release/deploy/native/smoke-check.py"
sams_activated=false
trap - ERR
rm "$sams_old_unit"
readlink -f /opt/sams/current
systemctl show sams -p ActiveState -p NRestarts -p MemoryCurrent
printf 'Pre-release private recovery dump: %s\n' "$sams_backup"
