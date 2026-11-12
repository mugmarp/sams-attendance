#!/usr/bin/python3
"""Provision the dedicated empty SAMS database; never adopt/reset existing data."""
import os, pathlib, secrets, subprocess
if os.geteuid() != 0: raise SystemExit('Run with sudo')
config = pathlib.Path('/etc/sams')
config.mkdir(mode=0o700, exist_ok=True)
env = config / 'sams.env'
if env.exists(): raise SystemExit('Existing environment preserved; review manually')
def pg(sql):
    return subprocess.run(['runuser','-u','postgres','--','psql','-X','-v','ON_ERROR_STOP=1','-At','postgres'],input=sql,text=True,capture_output=True,check=True).stdout.strip()
if pg("SELECT datname FROM pg_database WHERE datname='sams';") or pg("SELECT rolname FROM pg_roles WHERE rolname='sams';"):
    raise SystemExit('Existing SAMS database/role found; stop and review migration/backup first')
password=secrets.token_hex(32)
# Write secrets first so an interrupted provisioning can be recovered privately.
fd=os.open(env,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:
    f.write(f"DATABASE_URL='postgresql://sams:{password}@127.0.0.1:5432/sams?schema=public&connection_limit=3&pool_timeout=10'\n")
    f.write(f'JWT_SECRET={secrets.token_hex(48)}\nJWT_REFRESH_SECRET={secrets.token_hex(48)}\n')
    f.write('NODE_ENV=production\nHOST=127.0.0.1\nPORT=3100\nFRONTEND_URL=https://sams.tirallab.page\nTRUST_PROXY=1\n')
pg(f"CREATE ROLE sams LOGIN PASSWORD '{password}' NOSUPERUSER NOCREATEDB NOCREATEROLE;\nCREATE DATABASE sams OWNER sams;")
print('Private SAMS environment and dedicated database created; secrets were not printed')
