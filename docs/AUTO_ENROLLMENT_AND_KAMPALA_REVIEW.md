# Registration-based course setup and Kampala scheduling

Review date: 13 November 2026. This document distinguishes inspected source behavior from proposed changes. Live VPS inspection timed out during this review; no live enrollment or server timezone was changed.

## What currently works and what is missing

The parser in `services/catalogue.js` already extracts intake year, programme, sequence and sponsorship. `suggestedYear` computes academic-year start minus intake plus one and checks the programme's duration. Existing login authenticates and returns the profile; it does not provision enrollment. CourseAudience and ProgrammeGroup already provide group-to-offering relationships, but automatic registration is absent.

The hosted setup last verified on 12 November had only two BSE practice offerings and four enrollment links for two practice students. That controlled setup explains the limited courses; it does not represent the full timetable. Live counts were not reverified today.

The local source has 1,304 weekly rows. Exact/shared group matching finds BCS II: 14 rows, eight distinct labels; BSE II: 16 rows, nine labels; BIT II: 19 rows, ten labels; BBA I: 20 rows, six labels; BME I: 24 rows, eight labels. Labels are not automatically academic courses: MUCOSA and BM-REP require classification, and duplicate lecture/practical rows are not different offerings. Source metadata claims 2026/2027 Semester 1 but its last_updated value is inconsistent with that label. Source provenance and approval must be retained.

## Registration interpretation

`2025/BCS/199/PS` means intake 2025, BCS programme, student sequence 199 and private sponsorship according to the supplied convention. Programme links to faculty in the catalogue. Sequence is the student's registration sequence; it must not identify a shared classroom/cohort or dictate courses. Preserve leading zeroes. Sponsorship does not select curriculum.

For academic year 2026/2027, 2026 suggests Year I, 2025 Year II, 2024 Year III and 2023 Year IV. BCS duration is three years, so 2023/BCS must require placement review rather than silently becoming Year III or joining nonexistent Year IV courses. Do not infer graduation or disable that account from intake alone. Repeats, deferrals, transfers and tracks can require confirmed overrides. Use academic year, not January's calendar-year rollover, to progress a cohort.

## Recommended student experience

After successful authentication and any mandatory password change, the system resolves placement against the active reviewed academic term. It shows programme, faculty, study year and semester, plus the relevant course list. Compulsory courses are assigned automatically; electives require a constrained selection. The student sees current and next dated classes immediately after setup.

Use a one-time confirmation such as “Confirm my courses” if confirmation is required. Do not make a recurring on/off enrollment switch: students could otherwise remove missed classes from reports. Offer “Report a course or placement problem” for corrections. Repeated login reconciles new eligible compulsory offerings without duplicating enrollment or undoing explicit withdrawals. No course should be invented because none is available; show that course setup is pending.

## Data changes needed

Keep existing Enrollment as the attendance authorization link. Add a reviewed course-plan mapping for academic year, semester, programme group, offering, compulsory/elective classification and publication state. The mapping can build on CourseAudience; currently it lacks approval and required/optional semantics. Add an explicit published/active scope for offerings or plans so practice offerings cannot enter automatic assignment.

Record placement origin, confirmed overrides and the term for which placement was resolved. Extend enrollment with origin and explicit active/withdrawn decision metadata as needed. Existing effective dates remain important. Add a per-student/per-term setup record with plan version and confirmation state. All changes require an additive migration with a conservative backfill: existing assignments and marks must survive.

The present Course uniqueness is code/year/semester. Reuse one offering with multiple audiences for genuinely shared teaching. Separate sections with different teachers or rules need an offering/section key before importing them; do not overwrite examinerId to fit another cohort.

## Implementation sequence

1. Establish the active reviewed term and approve programme-group course plans in one registrar batch preview. Display proposed courses, excluded activities, duplicates, ambiguous tracks, unresolved lecturers and source issues. Confirm teaching assignments without turning source lecturer names into login accounts. No need to enroll individual students manually.
2. Add the plan publication and placement/enrollment metadata. Preserve existing practice data and exclude it from production plans. Add a registrar cohort preview/apply operation using the same service as student setup.
3. Implement a shared transactional course-setup service called after authenticated student sign-in/first workspace access. Resolve programme from the stored identity, apply any valid confirmed placement override, and match the current academic term and published plan. Never accept a client-submitted student ID or arbitrary course list as authority.
4. Insert only missing approved compulsory links, with uniqueness and concurrent-login protection. Audit the plan version and inserted links. Preserve manual enrollments, explicit withdrawals and prior effective dates. If the server fails partway, roll back setup rather than displaying partial success. Avoid blocking password-change access on course setup errors.
5. Add the student course-confirmation view and constrained elective selection. Explain missing plans, out-of-duration placement and review-required tracks. Add registrar filters and batch setup status by faculty/programme/year/semester.
6. Review timetable intervals, assign real offering/lecturer relationships and generate future dated sessions against the approved teaching calendar. Do not fabricate historical completed sessions or marks. Existing attendance remains unchanged.
7. Test locally, review the migration and batch preview, then deploy and verify on the VPS when access is available. Audit the resulting counts and sample one student per programme.

## Mid-semester enrollment dates

A first login in November must not silently mark all earlier teaching as absence. For new automatically generated links, use the setup date as effectiveFrom unless a registrar-approved enrollment start is available. A cohort backfill can use a reviewed semester/enrollment start date, but its impact on denominators must be previewed. Do not erase prior attendance or rewrite effective dates automatically when a student returns.

## Kampala time findings

The current class-creation form formats defaults using Africa/Kampala and sends explicit +03:00 timestamps. Timetable generation builds dates with +03:00. Shared page formatting and the student-day API explicitly identify Africa/Kampala. UTC host settings alone therefore do not establish a three-hour application error.

For example, 08:00 Kampala is 05:00Z. Seeing 05:00Z in an API/database representation can be correct while the page must show 08:00 EAT. Node's TZ setting controls implicit local-time operations; explicit offsets and timeZone formatting should be used regardless of the host default. Store instants consistently as UTC, interpret institutional date/time input as Kampala, and keep date-only academic fields as dates.

Prisma Session DateTime fields currently have no explicit @db.Timestamptz annotation. Verify actual database types and the existing UTC convention before any migration. Changing SQL session TimeZone or converting columns without inspecting existing values can shift records. Audit raw SQL, import paths, API offset requirements and browser datetime-local handling together. A future timestamp-type migration must demonstrate preservation of every existing instant.

On restored VPS access: check UTC date against a trusted clock, timedatectl Timezone/NTPSynchronized, Node's resolved timezone, service environment, PostgreSQL SHOW TimeZone and one known class end-to-end. Consider TZ=Africa/Kampala for service/log convenience, while keeping explicit application conversions. Never add three hours to timestamps globally. Confirm the browser's server clock offset refresh and countdown behavior after reconnect/sleep; client time never authorizes attendance.

A concrete calendar defect was fixed in this review: student-day previously accepted a mismatched source academic year through an OR condition. It now requires matching year AND an in-range Kampala date. This fix is local/committed, not yet deployed. It prevents old reference timetables from being projected into the current term; it does not validate the source or establish the live server clock.

## Acceptance checks

- 2025/BCS/199/PS resolves to BCS II in 2026/2027; 2024 BCS to III; 2023 BCS requires review. Confirmed repeat/deferral placement wins over a suggestion.
- A BCS student receives only published BCS/shared compulsory offerings for the relevant term, never all faculty courses or BSE practice courses. Tracks and electives remain distinct.
- First login, repeated login, simultaneous login and later plan publication cannot duplicate links or restore withdrawn courses.
- A programme with no published plan gets a useful setup-pending state. Student-controlled selections cannot bypass programme/term permissions.
- Setup and cohort backfill preserve existing attendance and preview report denominators. Historical attendance is never generated automatically.
- Tests run with UTC, Africa/Kampala and another process timezone produce the same instants for Kampala input. Verify 08:00 EAT = 05:00Z, midnight boundaries, check-in open/close and date-only exclusions.
- Weekly references require matching academic year, semester and reviewed date bounds. A stale reference cannot authorize attendance.

## Technical references

[Node.js TZ configuration](https://nodejs.org/api/cli.html#tz) explains process timezone configuration. [PostgreSQL date/time types](https://www.postgresql.org/docs/current/datatype-datetime.html) explains the important difference between timestamp types and timezone conversion. These references support the time-handling design; local source inspection supplies the project-specific findings.
