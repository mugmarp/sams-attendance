# Local data import

SAMS imports a normalized local JSON dataset through a plain JavaScript command. Routine account/course/enrollment setup and class creation are also available in the browser. It does not guess dated classes from weekly timetable slots, scrape university systems or silently skip enrollments. Resolve dates, course offerings and enrollment mismatches first.

From backend, with DATABASE_URL set (or in backend/.env):

```bash
IMPORT_INITIAL_PASSWORD='use-a-private-initial-password' npm run import -- /private/path/dataset.json
```

Use this only on a database you operate. Newly created users receive that initial password, hashed with bcrypt. Existing passwords are preserved. Distribute credentials privately and use institutional identity/account management before real deployment. Keep actual import files outside Git.

Example structure (all examples below are synthetic; choose real dated sessions explicitly):

```json
{
  "users": [
    {
      "email": "teacher@example.test",
      "name": "Example Teacher",
      "role": "EXAMINER"
    },
    {
      "email": "learner@example.test",
      "name": "Example Student",
      "role": "STUDENT",
      "regNo": "EXAMPLE/001",
      "program": "BSE",
      "year": 2
    }
  ],
  "courses": [
    {
      "key": "web-2026-1",
      "code": "SWE2106",
      "title": "Internet Technologies and Web Design",
      "academicYear": "2026/2027",
      "semester": 1,
      "program": "BSE",
      "year": 2,
      "examinerEmail": "teacher@example.test"
    }
  ],
  "enrollments": [
    { "studentEmail": "learner@example.test", "courseKey": "web-2026-1" }
  ],
  "sessions": [
    {
      "naturalKey": "web-2026-1:2026-11-12:10:00",
      "courseKey": "web-2026-1",
      "startTime": "2026-11-12T10:00:00+03:00",
      "endTime": "2026-11-12T12:00:00+03:00",
      "room": "Demo Lab",
      "sessionType": "LECTURE"
    }
  ]
}
```

Declare every referenced user and course in the file. Student users require unique registration numbers. Examiners must have the EXAMINER role. Course offering identity is code/academicYear/semester. Course keys link this import's enrollments and sessions. Session natural keys must remain stable across repeated imports. Timestamps must include an explicit UTC offset; end must be after start. Course objects may include attendanceThreshold (integer 1–100, default 80); this is configured policy, not verified university regulation. New sessions start SCHEDULED and become counted only when an examiner completes them.

The importer checks schema, duplicates and references before writing, then applies everything in one transaction. Re-importing the same dataset does not duplicate sessions/enrollments or reset attendance/passwords. Existing user role/registration, course examiner/title/threshold and session course/dates must agree; conflicts roll back the import. Changes to established identities/schedules require deliberate operator review rather than silently rewriting attendance history.

The original reference dataset has 52 student rows, 260 enrollment rows and 1,304 weekly slots. Only 129 enrollment rows match its timetable course codes. It needs reconciliation, actual semester dates and review of shared/multiple-examiner classes before conversion. This prototype assigns one examiner per offering; split independently taught offerings deliberately if necessary. Do not turn weekly slots into attendance records for classes that have not actually been held.

## Reviewed browser timetable workflow

Prefer **Timetable setup** for ongoing weekly schedule changes: review the calendar/exceptions, select a versioned source row, map an existing offering and preview before applying. This workflow can preserve stable IDs while reviewing future changes; the older normalized CLI deliberately rejects schedule conflicts. Neither path creates completed attendance from a weekly slot. See [TIMETABLE_AND_RECORDS.md](TIMETABLE_AND_RECORDS.md).

Legacy normalized CLI enrollments have no explicit date fields and remain unbounded; review effective dates in the registrar report before using historical totals. New browser/API enrollments default to today's Kampala date and support deliberate date correction. Never infer enrollment start from the date a historical import happened.

## Private student cohorts

The operator-supplied personal roster remains outside Git. From backend:

```bash
node scripts/generate-student-cohorts.js /private/bse-roster.json /private/cohorts.json
node scripts/import-student-cohorts.js /private/cohorts.json --preview
node scripts/import-student-cohorts.js /private/cohorts.json --apply /private/new-credentials.json
```

The BSE roster is an array of `{name,regNo}`; the generator adds ten synthetic students each for BCS/BIT/BBA/BME. It uses the reviewed 2026/2027 sample placement, retaining all supplied BSE entries. Derived email addresses are unverified mailbox suggestions; nothing is sent. Apply creates only missing identities with individual private passwords and retains prior accounts on repetition. A conflicting identity aborts rather than overwriting it. Credential output is exclusively created mode 0600. The import creates no course, enrollment, dated class or attendance. Keep personal inputs and credentials outside Git and use normal recovery backups before operational imports.
