> Historical planning/reference document from the Hermes work. Its proposed features, regulatory assertions and data models are not the current implementation specification. See README.md, TECH_ARCHITECTURE.md, API_SPEC.md and IMPORT_GUIDE.md for the implemented prototype. Official institutional requirements have not been verified by this codebase.

# Student Attendance Management System (SAMS) — Critical Analysis for MUST

## Executive Summary

**Recommendation: PROCEED WITH CAUTION** — SAMS is a viable registrar process but has significant complexity, regulatory constraints, and adoption risks that must be addressed before committing.

---

## 1. MUST University Context — Regulatory Baseline

### 1.1 Attendance Regulations (MUST Examination Regulations 2023)

| Regulation | Requirement | Source |
|------------|-------------|--------|
| **Minimum attendance** | 80% of lectures, tutorials, practical sessions | Section 2.3 |
| **Qualification to sit exams** | Must meet 80% attendance + coursework + fees paid | Section 2.3.1(a-c) |
| **Recording responsibility** | "Recorded by individual examiners" | Section 2.3 |
| **Semester structure** | 15 teaching weeks + 2 exam weeks | Section 1.1.2 |
| **Coursework weight** | Max 40% (exams = 60%) | Section 2.4.8 |
| **Absence from exams** | Allowed to proceed, sit next offering, no coursework redo | Section 2.4.10 |

### 1.2 Key Compliance Implications for SAMS

1. **80% threshold is non-negotiable** — system must calculate this precisely per course per student
2. **Examiners are the legal record-keepers** — system must support examiner workflow, not replace it
3. **Data feeds exam eligibility** — attendance records directly determine who can sit exams
4. **7-year retention** — exam scripts retained 7 years; attendance records likely similar (PPDA Act)
5. **Audit trail required** — any digital system must be tamper-evident for appeals

### 1.3 Legal Framework (Uganda)

| Law | Relevance to SAMS |
|-----|-------------------|
| **Universities and Other Tertiary Institutions Act, 2001 (as amended)** | Establishes NCHE mandate; universities must maintain academic standards |
| **Data Protection and Privacy Act, 2019 (DPPA)** | Student attendance = personal data; requires consent, purpose limitation, security, access rights |
| **Public Procurement and Disposal of Public Assets (PPDA) Act, 2003** | Governs disposal of records; 7-year retention for exam materials |
| **Computer Misuse Act, 2011** | Unauthorized access/modification of attendance data = offense |

---

## 2. Current State Analysis — What Exists at MUST

### 2.1 Existing Systems (Based on Public Info)

| System | Status | Attendance Role |
|--------|--------|-----------------|
| **MUST Pulse (com.kuyeso.mustapp)** | Official app, credential-gated | Course registration, results, timetables — **not attendance** |
| **Academic Registrar manual processes** | Paper-based attendance registers | Primary legal record (Appendix D: Examination Attendance Register) |
| **Timetable system** | HTML at timetable.must.ac.ug | 92 rooms, 892 sessions — defines *when/where* but not *who attended* |

### 2.2 Pain Points (Inferred from Regulations)

| Problem | Evidence |
|---------|----------|
| **Manual registers** | Appendix D exists as paper form; examiners record by hand |
| **No central visibility** | Academic Registrar cannot see real-time attendance across courses |
| **Exam eligibility disputes** | Section 2.3.1 appeals imply disagreements on attendance counts |
| **Retention burden** | 7-year paper storage (Section 5.0 of Retention Policy) |
| **Fraud risk** | "Giraffing" (peeping), impersonation defined as offenses — paper enables proxy signing |

---

## 3. SAMS — Critical Requirements Analysis

### 3.1 Core Functional Requirements (Must-Have)

| # | Requirement | Regulatory Driver | Complexity |
|---|-------------|-------------------|------------|
| 1 | **Examiner check-in interface** (mobile/web) | Section 2.3 "recorded by individual examiners" | Medium |
| 2 | **Student self check-in** (QR/NFC/geofence) | Reduces proxy signing; DPPA consent needed | High |
| 3 | **Real-time 80% calculation** per student per course | Section 2.3.1(a) exam eligibility | Medium |
| 4 | **Exam eligibility list generation** for Academic Registrar | Direct feed to exam officer | Medium |
| 5 | **Audit trail** (who, when, device, location) | DPPA + appeals process | High |
| 6 | **Export to PDF/Excel** for 7-year retention | PPDA Act retention policy | Low |
| 7 | **Role-based access** (Examiner, HoD, Dean, Academic Registrar, Student) | Organizational hierarchy | Medium |
| 8 | **Offline-first** (poor connectivity in lecture halls) | Practical reality at MUST | High |

### 3.2 Non-Functional Requirements

| Requirement | Standard | Rationale |
|-------------|----------|-----------|
| **Data residency** | Uganda-hosted or compliant cloud | DPPA Section 1: applies to processing in Uganda |
| **Encryption** | TLS 1.3 in transit, AES-256 at rest | DPPA security safeguards |
| **Access logs** | Immutable, 7-year retention | Audit + PPDA |
| **Availability** | 99.5% during teaching weeks | Exams depend on it |
| **Language** | English (official) | MUST medium of instruction |

---

## 4. Technical Approach — Best Practices & Trade-offs

### 4.1 Architecture Decision Matrix

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Centralized web app** (Express + React) | Real-time, single source of truth | Needs reliable WiFi in all 92 rooms | ❌ Risky |
| **Offline-first PWA** (Service Workers + IndexedDB) | Works offline, syncs when online | Complex sync conflict resolution | ✅ **Recommended** |
| **Native Android app** (Termux/Kotlin) | Hardware access (NFC, Bluetooth) | Distribution, updates, iOS gap | ⚠️ Secondary |
| **QR code + paper backup** | Zero infra in room | Manual fallback defeats purpose | ✅ Hybrid |

### 4.2 Recommended Stack (Pragmatic for Student Team)

| Layer | Technology | Why |
|-------|------------|-----|
| **Backend** | Node.js + Express + TypeScript | Team knows JS; type safety for audit trails |
| **Database** | PostgreSQL + Prisma | Relational (students, courses, sessions); Prisma = type-safe migrations |
| **Auth** | JWT + refresh tokens; integrate with MUST SSO if exists | Role-based; stateless |
| **Offline sync** | Custom sync engine (last-write-wins + server authority) | Avoid heavy frameworks; controllable |
| **Frontend** | React + Vite + Tailwind (PWA) | Fast dev; PWA = installable on phone |
| **QR/Geofence** | `qrcode.react` + Browser Geolocation API | No native code needed |
| **Hosting** | MUST internal server OR Uganda cloud (Raxio, MTN Cloud) | Data residency |
| **CI/CD** | GitHub Actions → Docker → SSH deploy | Free; team already has repo |

### 4.3 Data Model (Critical Entities)

```prisma
model Student {
  id            String   @id @default(cuid())
  regNo         String   @unique // 2025/BSE/108/PS
  email         String   @unique
  fullName      String
  program       String   // BSE, BCS, etc.
  yearOfStudy   Int
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  attendances   Attendance[]
  examEligibility ExamEligibility[]
}

model Course {
  id          String   @id @default(cuid())
  code        String   @unique // SWE2106
  name        String
  creditUnits Int
  program     String
  year        Int
  semester    Int      // 1 or 2
  sessions    Session[]
  examiners   ExaminerCourse[]
}

model Session {
  id          String   @id @default(cuid())
  courseId    String
  course      Course   @relation(fields: [courseId], references: [id])
  date        DateTime
  startTime   DateTime
  endTime     DateTime
  room        String   // From timetable.must.ac.ug
  type        SessionType // LECTURE, TUTORIAL, PRACTICAL
  attendances Attendance[]
  @@index([courseId, date])
}

enum SessionType {
  LECTURE
  TUTORIAL
  PRACTICAL
}

model Attendance {
  id            String   @id @default(cuid())
  studentId     String
  student       Student  @relation(fields: [studentId], references: [id])
  sessionId     String
  session       Session  @relation(fields: [sessionId], references: [id])
  status        AttendanceStatus
  method        CheckInMethod // QR, MANUAL, GEOFENCE
  deviceInfo    String?    // User agent, IP
  location      String?    // Lat,long if geofence
  recordedBy    String?    // Examiner ID if manual
  createdAt     DateTime   @default(now())
  syncedAt      DateTime?  // Null = pending sync
  @@unique([studentId, sessionId])
  @@index([sessionId])
  @@index([studentId, createdAt])
}

enum AttendanceStatus {
  PRESENT
  LATE
  ABSENT
  EXCUSED
}

enum CheckInMethod {
  QR_CODE
  GEOFENCE
  MANUAL_EXAMINER
  MANUAL_STUDENT
}

model ExamEligibility {
  id              String   @id @default(cuid())
  studentId       String
  student         Student  @relation(fields: [studentId], references: [id])
  courseId        String
  course          Course   @relation(fields: [courseId], references: [id])
  attendancePct   Float    // Calculated: present / total_sessions * 100
  eligible        Boolean  // attendancePct >= 80 && courseworkDone && feesPaid
  calculatedAt    DateTime @default(now())
  @@unique([studentId, courseId])
}
```

---

## 5. Risks & Mitigations — Critical Assessment

### 5.1 High-Risk Items

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Examiner adoption fails** | High | Critical — no data = no system | Co-design with 3 examiners; paper fallback; training session |
| **Student proxy check-in** | High | Undermines 80% rule | QR rotates per session; geofence radius 20m; device fingerprinting |
| **Connectivity in lecture halls** | High | Data loss | Offline-first PWA; background sync; local storage 30 days |
| **DPPA non-compliance** | Medium | Legal liability | Privacy notice; consent at registration; data minimization; DPIA |
| **Academic Registrar rejects digital record** | Medium | System unused | Involve Registrar office early; match Appendix D format exactly |
| **Scope creep → missed deadline** | High | Project fails | Fixed scope: MVP = examiner check-in + eligibility list only |

### 5.2 Medium-Risk Items

| Risk | Mitigation |
|------|------------|
| **Timetable integration** | Start with manual CSV import from timetable.must.ac.ug; API later |
| **Legacy data migration** | Don't migrate; start fresh for current semester |
| **Multi-campus (Kihumuro vs Town)** | Room field handles this; geofence per room |
| **Server procurement** | Use GitHub Codespaces for dev; MUST ICT for staging |

---

## 6. Recommended MVP Scope (12 Nov Deadline)

### 6.1 In Scope (Must Deliver)

1. **Examiner dashboard** — list today's sessions, tap to open check-in
2. **QR code check-in** — student scans, records attendance instantly
3. **Manual override** — examiner can mark present/absent/excused
4. **Real-time eligibility** — `/api/eligibility/:courseId` returns list with % attendance
5. **Export** — PDF matching Appendix D format for Registrar
6. **Auth + roles** — Examiner, Academic Registrar, Student (view own)
7. **Postman collection** — all endpoints tested

### 6.2 Out of Scope (Defer)

- Student self check-in (geofence)
- Notifications (email/SMS)
- Analytics dashboard
- Timetable auto-import
- Mobile app (PWA covers it)
- Biometric / NFC

---

## 7. Implementation Sequence (Suggested)

| Week | Focus | Deliverable |
|------|-------|-------------|
| **Week 1 (Nov 10-16)** | Setup + Core Models | Repo initialized, Prisma schema, Auth, `/health` |
| **Week 2 (Nov 17-23)** | Examiner Flow | Session CRUD, QR generation, check-in API, offline queue |
| **Week 3 (Nov 24-30)** | Eligibility + Export | 80% calc, eligibility endpoint, PDF export (Appendix D) |
| **Week 4 (Dec 1-7)** | Polish + Test | PWA manifest, Postman collection, role tests, deploy |
| **Week 5 (Dec 8-12)** | Buffer + Demo Prep | Bug fixes, rehearsal, documentation |

---

## 8. Alternative Registrar Processes (If SAMS Too Risky)

| Process | Why Simpler | Trade-off |
|---------|-------------|-----------|
| **Course Registration** | Well-defined workflow; existing data | Less novel; Pulse app may cover it |
| **Graduation Clearance** | Linear workflow; checklist-based | Seasonal (not daily); less real-time need |
| **Transcript Request** | Document generation; status tracking | Lower volume; simpler rules |
| **Examination Results Entry** | Directly supports examiners; high value | Tight security; existing manual process works |

---

## 9. Decision Checklist — Go/No-Go for SAMS

| Criterion | Yes/No | Notes |
|-----------|--------|-------|
| Can we get 3+ examiners to pilot? | ? | Critical — ask today |
| Does MUST ICT provide a test server? | ? | Needed for data residency |
| Can we access timetable.must.ac.ug data programmatically? | ? | CSV export minimum |
| Is team committed to offline-first complexity? | ? | Honest assessment |
| Can we deliver MVP in 5 weeks with 11 people? | ? | Requires parallel workstreams |

**If < 4 Yes → Pivot to Course Registration or Transcript Request.**

---

## 10. Next Actions (This Week)

1. **Confirm examiner buy-in** — approach 3 lecturers (one per faculty: FCI, FAST, FOM)
2. **Request test server** from MUST ICT — specify PostgreSQL, Node 20, HTTPS
3. **Export timetable CSV** — verify room/session structure for 92 rooms
4. **Draft privacy notice** — DPPA compliance template
5. **Finalize team roles** — backend (3), frontend (2), DevOps (1), QA (1), docs (1), PM (1), examiner liaison (2)

---

## Appendix: Key Regulatory Excerpts

### MUST Examination Regulations — Section 2.3 (Full)
> **2.3 Attendance of Class**
> The minimum class attendance in each course shall be constituted **by attending 80% of lectures, tutorials, and practical sessions as recorded by the individual examiners.**
>
> **2.3.1 Qualification to sit University Examinations**
> A candidate shall qualify to sit university examinations if:
> a) They have attended at least 80% of lectures, tutorials, and practical sessions.
> b) If s/he has done course work, tests as stipulated in section 2.2.1
> c) Paid the University dues as stipulated in the **Fees Policy.**

### DPPA 2019 — Key Principles (Sections 5-10)
- **Consent** — Data subject must consent to collection
- **Purpose limitation** — Only for stated purpose (attendance tracking)
- **Data minimization** — Collect only what's needed
- **Accuracy** — Right to rectification
- **Security** — Technical/organizational measures
- **Retention** — No longer than necessary (align with 7-year PPDA)

---

*Document version: 1.0 | Created: 2026-11-10 | For Group B internal use only*