# Account management and recovery

Every signed-in user has **My account**. Changing a password requires the current password, accepts 8 or more characters up to bcrypt's 72 UTF-8 byte limit, rejects the existing password, and ends all sign-ins. **End all sign-ins** also requires the current password. Both actions leave browser attendance outboxes and accepted database history intact. Sign back in with the same account to reconcile saved work; ordinary Sign out only ends the current browser sign-in.

Registrars have **Accounts**, with dependent academic filters, role/status/search controls and bounded pagination. Select a student or lecturer, enter a reason and your own current password, then reset their password, end their sign-ins, disable access or reactivate them. A reset requires identity verification outside SAMS and private delivery of the temporary password. There is no email delivery or mailbox-ownership claim. The API never returns the password or hash. Temporary-password sign-ins can view their identity and change the password, but cannot enter the attendance workspace until changed. Their pending work pauses without becoming failed attendance.

Registrar accounts cannot be reset or disabled through this management screen. This prevents accidental loss of the last registrar and does not create an impersonation feature. Use My account for the registrar's own password. Recovery of a registrar who has lost all credentials remains an operator procedure requiring verified authority; do not create an unauthenticated recovery endpoint.

## Persistence and concurrency

Migration `202611120008_account_lifecycle` adds `User.authVersion` and `User.mustChangePassword` without rewriting identity or attendance. JWTs carry the version; protected requests and refresh check the persisted current version and active state. Existing version-less JWTs match only version zero, preserving existing sign-ins on upgrade. Every password/reset/status/end-sign-ins mutation increments the version, so disable followed by reactivation cannot resurrect old tokens. Password writes use a compare-and-update guard; a competing reset/change cannot silently overwrite a later credential. Audit writes share the account mutation transaction and contain reasons and state changes, never credentials.

These controls apply to requests received after the mutation; an operation already authorized and in flight is not retroactively undone. Revocation remains in PostgreSQL across server restarts. Access is checked online; cached offline views cannot learn that an account was disabled until reconnection. This phase does not add per-device session tracking, MFA, email verification or institutional identity integration.

The v7 app-shell cache includes the account screens; the existing v3 IndexedDB schema and pending operations are preserved. Guidance: [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Verification

Local checks on 12 November 2026: **51 backend tests, 33 browser tests, 129 Postman requests and 337 assertions** pass. Cases cover password validation, both token types, disabled/reactivated accounts, mandatory password change, protected registrar accounts, credential-free bounded lists, concurrent changes, private audit content and pending-attendance preservation. The complete mutating collection runs only against a disposable database.

The local preview migration followed a recovery database copy and preserved User 7, Course 2, Enrollment 10, Session 14, Attendance 50 and AttendanceChange 0. Live deployment evidence is recorded separately in SERVER_READINESS.md.

## Readable initial passwords

The operational bootstrap and student-cohort importer generate 12-character ASCII initial passwords: two four-letter pronounceable groups around four digits. For example, `Mavo4826Leri` illustrates the format and is not a working account password. Characters are sampled with Node crypto.randomInt; no name, registration number, date or sequence determines a password. A shared set prevents duplicates within each import/bootstrap batch. The pattern provides approximately 38 bits of random choice; it is intended for the controlled pilot and does not replace an institutional credential policy or MFA.

The minimum accepted password length is 8 characters; the UTF-8 limit remains 72 bytes. Generation alone does not change current passwords. Bootstrap still requires an empty User table, and repeated cohort imports preserve existing hashes. Credential output stays mode 0600 and exclusive-create; passwords are not logged. A credential file records initial passwords only, not subsequent user changes or resets. Changing the generator is not a bulk reset of hosted accounts.

### Password length revision — 12 November 2026

Generated initial passwords now contain 12 ASCII characters: two four-letter pronounceable groups around four digits. Account creation, import, password changes and registrar resets share an 8-character minimum and a maximum of 72 UTF-8 bytes. This also prevents initial-account entry from exceeding bcrypt's byte limit. Existing credentials are unchanged by a deployment; an explicit reset is required to replace them.

Account selection now retains unfinished recovery fields when an unchanged selected identity emits another selection event. A genuine target change still clears the action form. Browser checks wait for the debounced scoped account response before choosing the target, so the test exercises the intended visible state rather than racing an old option list.
