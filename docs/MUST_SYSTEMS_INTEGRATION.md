# MUST Systems Integration & Timetable Import Analysis

## Executive Summary

**The data you need already exists in multiple places.** SAMS doesn't need to register students/courses — it needs to **consume** from existing authoritative sources. The challenge is access, not creation.

---

## 1. MUST Digital Systems Ecosystem (Source: systems.must.ac.ug)

| System | URL | Purpose | Data It Owns |
|--------|-----|---------|--------------|
| **SIMS Student Portal** | student-portal.must.ac.ug | Current students (2025+) registration, records | Student enrollment, course registration, grades, fees |
| **AIMS Student Portal** | student.must.ac.ug | Continuing students (≤2024) | Historical academic records |
| **University Timetables** | timetable.must.ac.ug | Published teaching/exam timetables | **Sessions, rooms, lecturers, courses, programs** |
| **MUST-VLE** | vle.must.ac.ug | Course materials, assignments | Course content, submissions |
| **Applications Portal** | applications.must.ac.ug | New student admissions | Applicant data |
| **SIMS Staff Portal** | staff-portal.must.ac.ug | Staff academic/admin services | Lecturer assignments, course management |
| **AIMS Staff Portal** | staff.must.ac.ug | Legacy staff portal | Historical staff data |

### Key Insight
> **Student registration, course registration, and lecturer assignments happen in SIMS/AIMS.** The timetable is *generated* from that data by the "MUST Central Timetabling System under the office of the Academic Registrar" (per timetable.must.ac.ug footer).

---

## 2. Timetable Data — Three Access Paths

### Path A: Public HTML (timetable.must.ac.ug) — **Available Now**
```
https://timetable.must.ac.ug/index_teaching.html     → 200+ program tables
https://timetable.must.ac.ug/index_rooms_teaching.html → 92 room tables
```
- **Format:** HTML tables (scrapeable)
- **Coverage:** 1,304 sessions (per metadata), all programs, all rooms
- **Freshness:** Generated 9/14/26 for Semester I
- **Pros:** Public, no auth, complete
- **Cons:** HTML parsing brittle; no API; manual per-semester

### Path B: mylectures-2 Export — **Available Now (Your Repo)**
```
app/src/main/assets/timetable_export.json    → 1,304 session objects
app/src/main/assets/timetable_metadata.json  → version info
```
- **Format:** Clean JSON (ready to import)
- **Fields:** `natural_key`, `program_group`, `day`, `time_slot`, `start_time`, `end_time`, `course_code`, `course_title`, `session_type`, `lecturer`, `room`, `shared_with`
- **Pros:** Structured, validated, Room-schema aligned, floor resolution logic included
- **Cons:** Static export (Semester I 2026/27); needs refresh per semester

### Path C: Central Timetabling System (Internal) — **Future**
- **Source:** Academic Registrar's office system
- **Access:** Requires ICT partnership / API development
- **Pros:** Real-time, authoritative, includes changes
- **Cons:** Not yet exposed; bureaucratic access

---

## 3. Recommended Import Strategy for SAMS

### Phase 1: Bootstrap (Week 1) — Use Path B
```bash
# 1. Copy JSON to SAMS repo
cp /path/to/mylectures-2/app/src/main/assets/timetable_export.json backend/prisma/seed/timetable.json

# 2. Write Prisma seed script
# backend/prisma/seed.ts
import timetable from './seed/timetable.json'

for (const entry of timetable) {
  await prisma.session.upsert({
    where: { naturalKey: entry.natural_key },
    create: {
      naturalKey: entry.natural_key,
      courseCode: entry.course_code,
      courseTitle: entry.course_title,
      day: entry.day,
      startTime: entry.start_time,
      endTime: entry.end_time,
      sessionType: entry.session_type || 'LECTURE',
      lecturer: entry.lecturer,
      room: entry.room,
      programGroup: entry.program_group,
      sharedWith: entry.shared_with || [],
    },
    update: { /* update fields */ }
  })
}
```

### Phase 2: Automated Refresh (Week 3+) — Scrape Path A
```python
# tools/scrape_timetable.py
import httpx
from bs4 import BeautifulSoup
import json

async def scrape_teaching_timetable():
    url = "https://timetable.must.ac.ug/index_teaching.html"
    html = await httpx.AsyncClient().get(url).text
    soup = BeautifulSoup(html, 'html.parser')
    
    sessions = []
    for table in soup.find_all('table'):
        # Parse each program table...
        # Extract: program, day, time, course, lecturer, room
    
    return sessions
```

### Phase 3: Official API (Future) — Partner with ICT
- Request read-only API endpoint from Academic Registrar's office
- Webhook on timetable changes → SAMS auto-sync

---

## 4. Student & Course Data — Where It Lives & How SAMS Gets It

### 4.1 Student Data (SIMS/AIMS)
| Data | System | Access for SAMS |
|------|--------|-----------------|
| Student list (regNo, name, program, year) | SIMS Student Portal | **No public API** — CSV export by Registrar |
| Course enrollment (student ↔ course) | SIMS Staff Portal | **No public API** — CSV export by HoD/Dean |
| Fees status | SIMS | Internal only |

**Practical approach for MVP:**
1. **Registrar provides CSV** — `students.csv` (regNo, name, email, program, year)
2. **HoD provides CSV** — `enrollments.csv` (regNo, courseCode, semester)
3. **SAMS imports on semester start** — one-time bulk load
4. **Updates via CSV re-upload** — not real-time sync

### 4.2 Course Data (Timetable + SIMS)
| Data | Primary Source | SAMS Approach |
|------|----------------|---------------|
| Course code, title, credits | Timetable (supplemented by curriculum docs) | Import from timetable_export.json |
| Course ↔ program/year/semester | Timetable `program_group` + curriculum | Derive from timetable + manual review |
| Lecturer assignments | Timetable `lecturer` field | Direct from timetable |
| Room assignments | Timetable `room` field | Direct from timetable |

---

## 5. System Integration Architecture for SAMS

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SAMS ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                 │
│  │  SIMS/AIMS   │     │  Timetable   │     │  Registrar   │                 │
│  │  (Source)    │     │  .must.ac.ug │     │  Office      │                 │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘                 │
│         │                    │                    │                          │
│         │ CSV Export         │ HTML/JSON        │ Manual                   │
│         ▼                    ▼                    ▼                          │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                    SAMS IMPORT PIPELINE                           │       │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │       │
│  │  │ Students    │  │ Courses/    │  │ Timetable   │               │       │
│  │  │ CSV Import  │  │ Enrollments │  │ Sync        │               │       │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │       │
│  └────────────────────────────┬──────────────────────────────────────┘       │
│                               │                                               │
│                               ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                      SAMS DATABASE (PostgreSQL)                   │       │
│  │  Students ◄──► Enrollments ◄──► Courses ◄──► Sessions ◄──► Rooms │       │
│  └────────────────────────────┬──────────────────────────────────────┘       │
│                               │                                               │
│                               ▼                                               │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                      SAMS API (Express)                           │       │
│  │  /api/students  /api/courses  /api/sessions  /api/attendance     │       │
│  └────────────────────────────┬──────────────────────────────────────┘       │
│                               │                                               │
│              ┌────────────────┼────────────────┐                            │
│              ▼                ▼                ▼                            │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐           │
│  │ Examiner PWA     │ │ Student PWA      │ │ Registrar Dashboard│           │
│  │ (QR check-in)    │ │ (View own %)     │ │ (Eligibility lists)│           │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Flow — Semester Start to Exam Eligibility

### 6.1 Semester Start (Week 0)
```
1. Academic Registrar publishes final timetable
   │
2. SAMS admin runs:  npm run import:timetable
   │  → Parses timetable_export.json OR scrapes timetable.must.ac.ug
   │  → Creates/updates: Courses, Sessions, Rooms, Lecturers
   │
3. Registrar provides: students.csv (regNo, name, email, program, year)
   │  → npm run import:students
   │
4. HoDs provide: enrollments.csv (regNo, courseCode)
   │  → npm run import:enrollments
   │  → Links students to courses → creates expected attendance records
   │
5. System ready: Examiners see today's sessions, students enrolled
```

### 6.2 Daily During Semester
```
Examiner opens SAMS → Sees today's sessions for their courses
    │
    ├─► Opens session → Displays QR code
    │       │
    │       Student scans → POST /api/attendance/checkin
    │       │  → Validates: enrolled in course, session active, not duplicate
    │       │  → Records: studentId, sessionId, status=PRESENT, method=QR, timestamp
    │       │
    │       └─► Offline: queued in IndexedDB → syncs when online
    │
    └─► Manual override: Examiner taps student → PRESENT/ABSENT/EXCUSED
```

### 6.3 Exam Eligibility (Week 13-15)
```
Registrar opens /api/eligibility/:courseCode
    │
    → Calculates: attendance% = presentSessions / totalSessions * 100
    │
    → Checks: attendance% >= 80 AND courseworkDone AND feesPaid
    │
    → Returns: { eligible: [{ regNo, name, attendancePct, eligible: true }, ...] }
    │
    → Export PDF matching Appendix D format → Submit to Exam Office
```

---

## 7. What SAMS Does NOT Need to Build

| Function | Owner | SAMS Role |
|----------|-------|-----------|
| Student admission | Applications Portal + Registrar | Consume student list |
| Course registration | SIMS Student Portal | Consume enrollments |
| Lecturer assignment | SIMS Staff Portal / HoD | Consume from timetable |
| Timetable generation | Central Timetabling System | Consume published timetable |
| Fee payment | Finance / SIMS | Accept `feesPaid` flag from Registrar |
| Grade submission | SIMS Staff Portal | Out of scope |
| Graduation clearance | Registrar | Out of scope |

---

## 8. Privacy & Compliance (DPPA 2019)

| Data | Classification | Handling |
|------|----------------|----------|
| Student regNo, name, email | Personal data | Consent at registration; purpose-limited |
| Attendance records | Personal data (behavioral) | Minimal retention (semester + 1 year); pseudonymize after |
| Location (geofence) | Sensitive personal data | **Avoid in MVP** — use QR only |
| Device fingerprint | Personal data | Disclose in privacy notice; opt-out |

**Action:** Draft privacy notice; get Registrar sign-off before student data import.

---

## 9. Immediate Next Steps (This Week)

| Task | Owner | Deliverable |
|------|-------|-------------|
| **Verify mylectures-2 export covers BSE II** | You | Confirm `program_group` includes `BSE II` in JSON |
| **Request students.csv from Registrar** | Team lead | CSV with 2025/BSE/* students |
| **Request enrollments.csv from HoD (FCI)** | Team lead | CSV for SWE2106 + other BSE II courses |
| **Test scrape of timetable.must.ac.ug** | Backend dev | Python script outputting JSON |
| **Draft privacy notice** | Legal/compliance | 1-page DPPA-compliant notice |
| **Confirm test server with MUST ICT** | DevOps | PostgreSQL + Node 20 + HTTPS endpoint |

---

## 10. File References (Your Repos)

| File | Location | Use |
|------|----------|-----|
| `timetable_export.json` | mylectures-2/app/src/main/assets/ | **Primary seed data** (1,304 sessions) |
| `timetable_metadata.json` | mylectures-2/app/src/main/assets/ | Version tracking |
| `generate_prepopulated_db.py` | mylectures-2/tools/ | **Floor resolution logic** — port to SAMS |
| `DATABASE_SCHEMA.md` | mylectures-2/docs/ | Entity definitions reference |
| `RoomDirectory.kt` | mylectures-2/app/src/main/java/.../rooms/ | Room → floor mapping |

---

## 11. Critical Decision: SAMS vs Alternative

| Factor | SAMS | Course Registration | Transcript Request |
|--------|------|---------------------|-------------------|
| **Data availability** | Timetable ✅, Students ❓ (needs CSV) | SIMS has it ❌ (no API) | SIMS has it ❌ |
| **Regulatory clarity** | High (80% rule explicit) | Medium | Low |
| **User adoption risk** | High (examiners must use daily) | Low (students self-serve) | Low (admin only) |
| **Technical complexity** | High (offline, QR, sync) | Medium | Low |
| **Impact if successful** | High (daily use, exam eligibility) | Medium | Low |
| **Deadline feasibility** | **Tight** (5 weeks) | **Feasible** | **Easy** |

**Recommendation:** Proceed with SAMS **only if**:
1. ✅ Registrar commits to providing students.csv + enrollments.csv by Nov 15
2. ✅ 3+ examiners confirm they'll pilot
3. ✅ MUST ICT provides test server by Nov 15

**Otherwise:** Pivot to **Transcript Request System** (simpler, same registrar domain, lower adoption risk).

---

*Document version: 1.0 | Created: 2026-11-10 | For Group B internal use only*