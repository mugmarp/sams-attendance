# Timetable, enrollment dates and saved reports

Implemented on the JavaScript branch on 11 November 2026. Weekly reference data, actual dated classes and completed attendance are separate records. A weekly reference is useful information; it does not prove enrollment, lecturer assignment or attendance.

## Calendar evidence and the current semester

MUST's [official academic calendar](https://www.must.ac.ug/academic-calendar/) lists lectures beginning **17 August 2026** and semester one ending **12 December 2026** for 2026/2027. The official page's indexed result was accessible on 11 November; direct access returned HTTP 403. These are recorded as a reference with provenance, not a registrar-approved teaching calendar. The semester end is not independently established as the final teaching date. Examination periods, faculty variations and excluded teaching dates still require review.

11 November is 86 days after 17 August: `floor(86 / 7) + 1 = 13`, the thirteenth calendar week from that start. This calculation does not establish a faculty's teaching-week numbering. The [official graduation report](https://www.must.ac.ug/1670-strong-and-49-phds-conferred-as-must-celebrates-historic-33rd-graduation-ceremony-at-kihumuro-main-campus/), published 30 October, identifies **29 October 2026** as the ceremony date. It does not establish a campus-wide teaching closure. SAMS does not automatically cancel that day's classes.

`data/academic_calendar_reference.json` preserves this distinction. The calendar form may display these dates as a starting reference; only an administrator's explicit reviewed submission creates a teaching calendar. Actual class generation is future-only and requires that calendar, a selected existing offering and an explicit reviewed interval. No historical absences are manufactured for the elapsed semester.

## Using the timetable

All roles have **Timetable** in navigation. **My dated classes** reads actual authorized SAMS sessions, refreshing every 15 seconds while visible and on focus/reconnection. Students see classes within their enrollment dates; lecturers see their assigned offerings; administrators see all. Labels use server-adjusted time and recorded lifecycle state. This is bounded polling, not a push stream.

**Weekly reference** filters the 1,304 supplied rows by group/course and includes shared groups. Cached user-scoped views can reopen offline after a successful online visit; the UI labels saved data. No fresh data can be retrieved without connectivity. Reference queries return at most 200 rows, so use filters.

An administrator opens **Timetable setup**, checks `mylectures` or `mylectures-2`, reviews the teaching calendar and excluded dates, selects a source row and maps it to an existing offering/assigned lecturer. The source cannot create enrollment or determine who is authorized to teach. Unknown session types and conflicting source times require explicit decisions. For conflicting times, the end-time input is left blank.

Preview shows proposed CREATE, UPDATE, CANCEL, UNCHANGED and PROTECTED items plus blockers; it writes a review, not classes. Review lasts 15 minutes and belongs to its author. Apply locks affected course/classes/calendar, checks the current fingerprint and rejects stale reviews. A repeated apply returns its original review outcome. Manual overlapping classes block generation. Updating a linked weekly rule retains session IDs, advances versions and invalidates earlier prepared/offline context. Started, finalized or attended classes are protected; cancellations retain records rather than deleting history. Retiming requires a review interval covering affected future classes.

## What source refresh means

The two approved GitHub repositories are fixed server-side. SAMS resolves a commit SHA, retrieves both metadata and timetable at that same SHA, validates bounded JSON and stores a content hash plus revision. Outbound requests have timeouts, redirect rejection and a 2 MiB per-response cap. Checks have a 60-second per-provider cooldown. Once an administrator activates a repository source, a lightweight timer checks it every 30 minutes while the server runs. A failed check retains the last good publication and records failure. A restart resumes checking previously activated sources; it does not immediately apply a new calendar or schedule.

New publications remain staged until reviewed. Retrieval time and upstream metadata are displayed separately. Source metadata declares 2026/2027 but its `last_updated` timestamp resolves to 10 October 2024. Many supplied `time_slot` and actual end-time fields disagree; lecturer/venue/type fields are also incomplete. SAMS flags these inconsistencies instead of silently repairing them. The public institutional timetable returned HTTP 403 during investigation; no institutional API integration is claimed. The GitHub source is a reusable reference, not verified current university authority.

## Enrollment and attendance policy

Enrollment dates are Kampala civil dates. `effectiveFrom` is inclusive; `effectiveUntil` is the first excluded date. New browser/API enrollment defaults to the current Kampala date, which an administrator can change deliberately with a reason. Existing undated enrollment and legacy CLI imports remain unbounded to preserve their previous interpretation; review them before institutional reporting. One continuous enrollment interval per student/offering is supported. Withdrawal preserves existing attendance and audit history. Multiple leave/re-entry periods require a later explicit data-model change.

Eligibility denominators include only COMPLETED classes inside that student's interval. PRESENT always counts; each offering configures whether LATE and EXCUSED count. Defaults retain prior behavior: LATE true, EXCUSED false. Threshold/counting changes increment `policyVersion`, require its current version and a reason, and retain before/after audit data. Live reports reflect current configuration. No configured value is asserted to be approved university regulation. A zero denominator remains not assessed. Enrollment-date changes also invalidate preparations whose recorded bounds no longer match.

## Saved reports and provenance

A lecturer for their offering, or an administrator, can save a report after reviewing pending work and entering a reason. The server freezes consistent report data, enrollment bounds, counts, current policy, pending claim count and a SHA-256 hash in a repeatable-read transaction. Later edits affect live reports, leaving the saved JSON and its generated PDF unchanged. Snapshot download rechecks current offering authorization. The PDF distinguishes a saved snapshot from a live report and states attendance qualification only, not final examination clearance.

The server cannot discover unuploaded work on disconnected devices. Staff must reconcile those devices before treating a report as final; the acknowledgement is not evidence that every device has synchronized. A saved snapshot is an attendance report, not institutional approval/signature or an immutable external archive. No update/delete endpoint is supplied for snapshots; database operators still have administrative powers.

Lifecycle, timetable review/application, enrollment and policy edits, source checks and report issuance record actors, timestamps and reasons where supplied. Existing attendance-change history remains authoritative for individual marks. PostgreSQL aggregates counts rather than loading every mark into Node. Reference/session lists and snapshot/audit histories are bounded; large institutional exports and load capacity still need measured pilot testing.

## Verification and operational boundary

Coverage includes preview without class writes, idempotent application, exclusions, stable IDs, protected history, overlaps/stale reviews, source failure retention, effective enrollment bounds, policy changes, snapshot stability/authorization, phone-width offline reference access and visible polling updates. The saved PDF was rendered and visually checked. See [VALIDATION.md](VALIDATION.md) for totals and reproduction.

Migrations are additive. Hosting, actual registrar policy/calendar approval, physical-device field testing and backup/restore acceptance remain Phase 4 prerequisites. Android packaging remains deferred. No public VPS deployment is claimed by this phase.
