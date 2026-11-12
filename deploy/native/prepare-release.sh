#!/bin/bash
# Run as root, passing a full, reviewed Git commit and the existing Node binary.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo'; exit 1; }
sams_commit=${1:?full commit required}
sams_node=${2:?existing Node executable required}
[[ $sams_commit =~ ^[0-9a-f]{40}$ ]] || exit 1
[[ $("$sams_node" -p 'Number(process.versions.node.split(".")[0])') -ge 22 ]] || exit 1
sams_release=/opt/sams/releases/$sams_commit
[[ ! -e $sams_release ]] || { echo 'Release already exists; inspect it before retrying'; exit 1; }
[[ $(df --output=avail -k / | tail -1) -ge 1000000 ]] || { echo 'At least 1 GB disk headroom required before staging'; exit 1; }
id sams >/dev/null 2>&1 || useradd --system --home-dir /var/lib/sams --create-home --shell /usr/sbin/nologin sams
install -d -m 0755 /opt/sams/releases /usr/local/lib/sams-node/bin
install -d -o sams -g sams -m 0700 /var/cache/sams
install -m 0755 "$(readlink -f "$sams_node")" /usr/local/lib/sams-node/bin/node
sams_tmp=$(mktemp -d)
trap 'rm -rf "$sams_tmp"' EXIT
curl --fail --location --proto '=https' --tlsv1.2 "https://codeload.github.com/mugmarp/sams-attendance/tar.gz/$sams_commit" -o "$sams_tmp/release.tgz"
install -d -o sams -g sams "$sams_release"
tar -xzf "$sams_tmp/release.tgz" --strip-components=1 -C "$sams_release"
chown -R sams:sams "$sams_release"
sams_npm=${3:?existing npm CLI required}
[[ -f $sams_npm ]] || { echo 'Supplied npm CLI not found'; exit 1; }
sams_npm_source=$(dirname "$(dirname "$(readlink -f "$sams_npm")")")
install -d /usr/local/lib/sams-node/lib/node_modules
cp -a "$sams_npm_source" /usr/local/lib/sams-node/lib/node_modules/npm
chown -R root:root /usr/local/lib/sams-node
sams_npm=/usr/local/lib/sams-node/lib/node_modules/npm/bin/npm-cli.js
cd "$sams_release/backend"
# Install locked dependencies serially; no frontend build, compiler, browser or Docker.
runuser -u sams -- env PATH=/usr/local/lib/sams-node/bin:/usr/local/bin:/usr/bin:/bin /usr/local/lib/sams-node/bin/node "$sams_npm" ci --cache /var/cache/sams --no-audit --no-fund
runuser -u sams -- /usr/local/lib/sams-node/bin/node node_modules/prisma/build/index.js generate
printf 'Prepared release: %s\n' "$sams_release"
