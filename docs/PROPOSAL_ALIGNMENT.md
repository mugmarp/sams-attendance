# How the original proposals guide this revision

Reviewed source documents supplied by the user: `SAMS_Proposal.pdf` and `Class_Attendance_System_Proposal_Phoenix.pdf`. They are reference proposals, not instructions overriding the user's assignment or migration request. Original personal member details were not copied into the repository.

| Proposal idea | Decision | Reason |
|---|---|---|
| Class attendance as registrar workflow | Keep | Directly matches the chosen assignment process |
| Paper-register problems, code check-in, student summaries and lecturer oversight | Keep | Core purpose shared by both proposals |
| Three roles in the Phoenix proposal | Keep | Student, lecturer/EXAMINER, registrar/department ADMIN cover the demonstration |
| Plain HTML/CSS/JavaScript frontend | Implement | Best matches the user's requested source format |
| MongoDB Atlas/Mongoose | Adapt to PostgreSQL/Prisma | Assignment allows database choice; preserve tested relational integrity and transactions |
| User/course/enrollment setup and class creation | Add | Removes dependence on seed/import tools for normal demonstration setup |
| Configurable attendance minimum | Add per offering | Neither proposed 75% nor inherited 80% is independently confirmed university policy |
| Short-lived code shown in class | Keep, rotate within window | Ten-minute window, two-minute current codes, capped at class end |
| Duplicate attendance returns 409 | Adapt | Idempotent check-in retries return the same record with 200; duplicate resource creation returns 409 |
| HoD excuse approval and fixed edit window | Defer | Broader proposal expansion requiring agreed policy; reasoned manual corrections are implemented |
| Bulk marking | Defer | Student self check-in plus individual audited corrections is sufficient for the core workflow |
| Course and department reporting | Course reports now | Course-level reports and below-threshold filtering are implemented; department analytics are deferred |
| Lecturer report download | Implement for own courses | Ownership is checked by the API |
| “Exam eligible” and official registers | Narrow wording | Report attendance qualification only; fees/coursework and official format are not verified |
| Anti-proxy claims | Qualify | Codes can be shared; this does not prove physical presence |
| Live database | Keep actual PostgreSQL connection | No mocks; do not claim public cloud deployment without deploying it |
| Individual contribution PRs | Excluded from this task | Explicit latest user instruction; no fabricated authorship or contributions |

The current specification is PROPOSAL.md, API_SPEC.md and the running application. Earlier generic planning documents remain historical references.
