#!/usr/bin/python3
"""Restore only into a new disposable database and export a private recovery copy."""
import datetime, hashlib, json, os, pathlib, pwd, shutil, subprocess, time
if os.geteuid()!=0: raise SystemExit('Run with sudo')
now=datetime.datetime.now(datetime.timezone.utc)
source=pathlib.Path(f'/var/backups/sams/daily-{now.isoweekday()}.dump')
restored='sams_restore_check_'+str(time.time_ns())
tables=['User','Course','Enrollment','Session','Attendance','AttendanceChange']
def pg(*args,sql=None):
    return subprocess.run(['runuser','-u','postgres','--',*args],input=sql,text=True,capture_output=True,check=True,cwd='/tmp').stdout.strip()
def counts(database):
    return {table:int(pg('psql','-X','-At',database,sql=f'SELECT count(*) FROM "{table}";')) for table in tables}
pg('createdb',restored)
try:
    pg('pg_restore','--no-owner','--no-acl','--dbname='+restored,str(source))
    expected=counts('sams');actual=counts(restored)
    if expected!=actual: raise RuntimeError('Restored core counts differ; preserve the dump and investigate concurrent writes')
finally:
    # Only this invocation's newly created, explicitly disposable database is dropped.
    pg('dropdb',restored)
export=pathlib.Path('/home/myvps')/('SAMS-recovery-'+now.date().isoformat()+'.dump')
fd=os.open(export,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'wb') as out,source.open('rb') as incoming: shutil.copyfileobj(incoming,out)
owner=pwd.getpwnam('myvps');os.chown(export,owner.pw_uid,owner.pw_gid)
record={'verifiedAt':now.isoformat(),'source':str(source),'export':str(export),'counts':actual,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'bytes':source.stat().st_size}
recordfile=pathlib.Path('/var/backups/sams/restore-verification.json')
with recordfile.open('w') as out: json.dump(record,out,indent=2)
os.chmod(recordfile,0o600)
print(json.dumps(record,indent=2))
