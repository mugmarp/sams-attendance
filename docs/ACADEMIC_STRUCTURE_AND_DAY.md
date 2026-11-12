# Academic structure, registration and the student's live day

SAMS remains a plain HTML/CSS/browser JavaScript web application with Express and PostgreSQL. `mylectures` and `mylectures-2` are Android reference applications; their Kotlin/Compose/Room implementation is not ported and Android wrapping remains deferred.

## Evidence and interpretation

MUST's [programme page](https://www.must.ac.ug/programme/bachelor-of-software-engineering/) places BSE in the Faculty of Computing and Informatics and lists four years. The operator specified the display name **B.Sc. in Software Engineering**. MUST's [joining instructions](https://www.must.ac.ug/downloads/admission/UG%20JOINING%20INSTRUCTIONS%202024.pdf) and [fees page](https://www.must.ac.ug/study-at-must/tuition-fees/) use the example `2024/BCS/000/PS`, supporting the four-part registration shape. These sources do not verify the supplied people's identities or mailbox ownership. The institutional email transformation and current intake-to-year examples were supplied by the operator. No independent official source confirming the email algorithm or sponsorship-code expansion was located; SAMS stores the sponsorship token without inventing its meaning.

Registration is parsed as intake year / programme code / sequence / sponsorship code. The sequence retains leading zeroes and is not used as a class number. Faculty comes from the programme catalogue, rather than being directly encoded as a registration segment. The email suggestion concatenates intake, lowercased programme and sequence, omitting sponsorship, then adds the operator-supplied student domain. It is a suggested SAMS identity address, not evidence that a mailbox exists. No email is sent and this project provisions no university mailboxes.

Suggested study year is `academic-year start − intake year + 1`. For 2026/2027, intake 2026 suggests Year 1, 2025 Year 2, and 2024 Year 3. Out-of-duration results require review. A registrar explicitly confirms programme/group/year/academic year/semester. Repeat-year placement is allowed deliberately and audited; no annual background job promotes students. Sponsorship changes that collide on a derived email require identity reconciliation, not a second account or automatic merge. Registration/email are sign-in identifiers with a separate private password; registration is never the default password.

## Normalized records

Faculty → Programme → ProgrammeGroup separates academic structure from accounts and teaching. The catalogue contains six reference faculties and 27 programmes, with source URLs. The chosen five-programme sample covers Computing (BSE/BCS/BIT), Business (BBA) and Applied Sciences/Technology (BME). Current MUST VLE [2026/2027 categories](https://vle.must.ac.ug/course/search.php?perpage=all&search=2026) corroborate these faculty names; the remaining reference catalogue still needs registrar review.

User keeps a stable identity, intake/sponsorship tokens, confirmed placement and record origin. Course remains an academic-year/semester offering with an assigned lecturer. CourseAudience explicitly relates one offering to multiple programme groups, so a shared lecture does not need duplicate class/attendance identities. Enrollment still grants attendance access and has effective dates. A matching registration or programme **does not automatically enroll** a student. An out-of-audience enrollment requires an explicit recorded exception, supporting retakes/electives without silently mixing groups.

Legacy programme strings and attendance are preserved. Known programme/year values are linked additively; unknown codes are left unassigned for review. Programme/year/group indexes support bounded queries. Central ADMIN remains a registrar role across faculties: filters improve navigation, not faculty-specific permission delegation. Student directory routes remain staff-only. Faculty-admin delegation would need an explicit future permission model.

## What the Android references contributed

Inspected revisions: [mylectures b5b633f](https://github.com/mugmarp/mylectures/tree/b5b633f7c632ac33dfdc5ef1d488b7034725e012), [mylectures-2 62a6e27](https://github.com/mugmarp/mylectures-2/tree/62a6e27fbdd0b13b109fa86861207bf671852f59).

Both contain faculty/programme/year selection, shared-group aliases, specialisation matching and duplicate handling. Their matching implementations inspected here are identical; these are not all new fixes exclusive to mylectures-2. The concrete faculty-data difference is mylectures-2's BGWH Year III-only selection, avoiding unsupported Year I/II choices. SAMS also requires specific tracks for BS, HEAP, DLT II, BBA III and BPCD III instead of treating every track as one student's schedule.

SAMS reimplements these concepts in JavaScript. Exact shared-event duplicates collapse for the personal view when code/day/interval/room/lecturer agree. Different venues or lecturers remain separate, exposing conflicts rather than silently choosing one. Raw source rows remain available to registrar import review. Unknown groups are not guessed. Android account-free self-selection is not reused as attendance authorization, and suspicious course-code/lecturer/room anomalies are not silently rewritten.

## Student experience

The first view shows academic identity, **Happening now**, **Next up**, scheduled progress and today's chronological timetable. Dated, enrolled classes take priority. A single current enrolled class automatically becomes the check-in target; there is no routine class dropdown. Concurrent enrolled classes expose an overlap warning and a selector restricted to those current candidates. Future and reference entries never become check-in targets. Lecturer-opened code windows and server validation remain authoritative.

With no dated enrollment, the personal weekly plan still supplies useful next-up information, clearly labelled as reference. The operator confirmed the BSE II Thursday intervals Web Design 08–10, Probability and Statistics 10–13, and Data Structures 14–17 on 12 November. This confirmation concerns those exact intervals, not all source fields, holidays or institutional approval. Other inconsistent time fields remain flagged. Unreviewed ambiguous reference intervals do not receive an authoritative progress bar. Reference projection is bounded to the published reference calendar; it does not repeat an old semester forever.

Server-adjusted time drives display updates each second. Visible pages refresh data every ten seconds and on focus/reconnection. After an online visit, account-scoped saved views can reopen offline with a saved-data label. Offline clocks remain estimates and cannot backdate attendance. The update preserves IndexedDB v3, queued operation identities, leases, prepared registers and receipts. Check-in and report rules remain in their existing server workflows.

## Registrar experience

Course reports, account/enrollment options and timetable setup have dependent faculty/programme/year/group and search controls. Academic-year/semester filters constrain course/student lists; explicit shared audiences are included in course filters. Lists default to 100 rows and reject limits above 200, with offset available through the API. The initial registrar scope is Computing; All faculties is an explicit choice. Large cohorts should be narrowed by programme/group/search rather than rendered as one unrestricted directory.

Registration preview suggests an email and placement but requires confirmation. Profile corrections retain history and audit before/after placement, never password hashes. Account forms and shared course-audience options use the selected academic scope. Sample origins are visible to the registrar without littering the student's interface with “demo”.

## Sample dataset and other data decisions

The authorized private dataset contains **51 students**: all 11 supplied BSE identities, plus ten synthetic students each in BCS, BIT, BBA and BME. Synthetic cohorts span intake 2024–2026 to exercise year and track filters. Synthetic registration sequences and derived addresses are examples, not assertions about actual university assignments. User-supplied and synthetic origins remain distinguishable. Personal roster data and generated passwords stay outside Git.

| Data                        | Handling                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student identity            | Preview and validate registrations/emails/programmes, reject collisions, preserve existing accounts/passwords, use private generated credentials                                                  |
| Programme/faculty catalogue | Versioned source-backed reference; verify names/aliases before institutional adoption                                                                                                             |
| Study year/track            | Suggested from intake, explicitly confirmed; reviewed exceptions rather than automatic promotion                                                                                                  |
| Course definitions          | Reconcile code/title/year/semester with the curriculum; the old SWE2103 “Database Systems” sample was incorrect for this BSE timetable, so the current local seed uses Probability and Statistics |
| Lecturer records            | Source names are reference, not teaching permissions; map to confirmed staff accounts, never invent staff emails or silently assign all courses to one person                                     |
| Weekly timetable            | Keep publication/revision/hash and raw issues; deduplicate personal display without destroying source provenance                                                                                  |
| Dated classes               | Require reviewed times/calendar and an existing offering/lecturer; no historical absences generated from weekly rows                                                                              |
| Enrollment                  | Explicit course access with dates and audited exceptions; programme membership alone grants nothing                                                                                               |
| Attendance/reports          | Accepted marks only; retain correction history and frozen report policy/counts; never generate real people's attendance as sample content                                                         |
| Credentials/backups         | Private files outside Git; backup before additive migration, restore-check and retain an off-server recovery copy                                                                                 |

The private importer supports preview, detects conflicting identities, writes new accounts transactionally and preserves existing identities on repeat runs. Credentials are generated per new account into an exclusively created 0600 file. It creates no enrollment, course, dated session or attendance. Staff/course/calendar reconciliation is deliberately separate from generating student profiles.

Validation: 44 backend tests, 29 browser tests, and 106 Postman requests/301 assertions; importer verification created 51 synthetic test records once and preserved all 51 on repeat. Physical-device checks, institutional identity/mailbox verification, approved policy/calendar exceptions and recurring off-site backups remain adoption requirements.
