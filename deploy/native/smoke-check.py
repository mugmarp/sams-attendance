#!/usr/bin/python3
"""Non-destructive HTTPS smoke checks; never print credentials or bearer tokens."""
import concurrent.futures, json, pathlib, statistics, time, urllib.error, urllib.request
origin = 'https://sams.tirallab.page'
accounts = json.loads(pathlib.Path('/etc/sams/initial-accounts.json').read_text())['accounts']
def request(path, token=None, payload=None, expected=200):
    headers={'Accept':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    raw=None
    if payload is not None:
        raw=json.dumps(payload).encode();headers['Content-Type']='application/json'
    req=urllib.request.Request(origin+'/api'+path,data=raw,headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=20) as res:
            status=res.status;body=json.load(res)
    except urllib.error.HTTPError as error:
        status=error.code;body=json.load(error)
    if status != expected: raise RuntimeError(f'{path}: expected {expected}, received {status}')
    return body
for user in accounts:
    signed=request('/auth/login',payload={'email':user['email'],'password':user['password']})
    token=signed['accessToken']
    assert request('/auth/me',token)['role']==user['role']
    path={'ADMIN':'/admin/users','EXAMINER':'/examiner/courses','STUDENT':'/student/sessions/upcoming'}[user['role']]
    request(path,token)
    if user['role']=='STUDENT':
        request('/admin/users',token,expected=403)
        reference=request('/timetable/reference?group=BSE%20II&course=SWE2106',token)
        assert reference['total']==1304 and reference['matched']>0
    print(user['role']+': HTTPS login, current identity and scoped reads verified')
request('/admin/users',expected=401)
request('/auth/login',payload={'email':'admin@demo.sams.test','password':'DefinitelyNotThePrivatePassword!'},expected=401)
def health(_):
    started=time.monotonic();assert request('/health')['status']=='ok';return 1000*(time.monotonic()-started)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    durations=list(pool.map(health,range(10)))
print(f'10 HTTPS health/database requests at concurrency 5: all passed; median {statistics.median(durations):.0f} ms, max {max(durations):.0f} ms')
print('No courses, enrollment, sessions or attendance were created by this check. This is a smoke check, not a capacity result.')
