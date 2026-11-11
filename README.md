# Student Attendance Management System (SAMS)

**Course:** SWE2106 — Internet Technologies and Web Design  
**Institution:** Mbarara University of Science and Technology (MUST), Uganda  
**Team:** Group B (11 members)  
**Deadline:** 12 December 2026 (presentation)  
**Repository:** https://github.com/mugmarp/sams-attendance

---

## 1. Problem Statement

The Academic Registrar at MUST requires a digital solution for tracking student class attendance to determine exam eligibility per **MUST Examination Regulations §2.3**:

> **Minimum attendance:** 80% of lectures, tutorials, and practical sessions  
> **Exam eligibility:** Student must meet 80% attendance + coursework + fees paid

**Current process:** Paper registers (Appendix D of Examination Regulations) — manual, error-prone, no central visibility, 7-year retention burden.

---

## 2. Solution: Code-Based Check-in

### 2.1 Core Concept

| Actor | Action |
|-------|--------|
| **Examiner** | Opens session → clicks "Start Check-in" → 6-digit code displayed (e.g., `7K9M2P`) |
| **Student** | Opens app → "Enter Code" → types code → submits |
| **System** | Validates code (match + not expired + student enrolled) → records attendance |
| **Admin** | Views exam eligibility lists (80% calculation) → exports PDF matching Appendix D |

### 2.2 Why Code (Not QR/Geofence)

| Factor | Code (PIN) | QR | Geofence |
|--------|------------|-----|----------|
| Build time | 30 min | 2-3 hrs | Days |
| Phone support | 100% | 90% | GPS issues |
| Lecture hall reality | Works offline, dim light | Camera fails | Indoor GPS unreliable |
| Cheating risk | Shareable (mitigated by 2-min rotation) | Screenshot shareable | Low |
| **Verdict** | ✅ **MVP** | Stretch | Skip |

**Security:** Code rotates every 2 minutes, one-use per student, examiner physically present.

---

## 3. Technical Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SAMS ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐        │
│  │   EXAMINER   │         │    BACKEND   │         │   STUDENT    │        │
│  │   (PWA)      │         │  (Express)   │         │   (PWA)      │        │
│  └──────┬───────┘         └──────┬───────┘         └──────┬───────┘        │
│         │                        │                        │                 │
│         │ GET /sessions/today    │                        │                 │
│         ├───────────────────────►│                        │                 │
│         │                        │                        │                 │
│         │ POST /sessions/:id/    │                        │                 │
│         │ start-checkin          │                        │                 │
│         ├───────────────────────►│                        │                 │
│         │                        │                        │                 │
│         │ { code, expiresAt }    │                        │                 │
│         │◄───────────────────────┤                        │                 │
│         │                        │                        │                 │
│         │ Display code (refresh  │                        │                 │
│         │ every 2 min)           │                        │                 │
│         │                        │                        │                 │
│         │                        │ POST /attendance/      │                 │
│         │                        │ checkin                │                 │
│         │                        │◄───────────────────────┤                 │
│         │                        │   { code, sessionId }  │                 │
│         │                        │                        │                 │
│         │                        │ Validate & record      │                 │
│         │                        │                        │                 │
│         │                        │ { success, session }   │                 │
│         │                        │───────────────────────►│                 │
│         │                        │                        │                 │
└─────────│────────────────────────│────────────────────────│────────────────┘
          │                        │                        │
          ▼                        ▼                        ▼
   ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
   │  Session     │         │  CheckinCode │         │  Attendance  │
   │  (PostgreSQL)│         │  (Redis/     │         │  (PostgreSQL │
   │              │         │   in-memory) │         │   + IndexedDB)│
   └──────────────┘         └──────────────┘         └──────────────┘
```

---

## 4. Data Models (Prisma)

```prisma
// backend/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum SessionType {
  LECTURE
  TUTORIAL
  PRACTICAL
  LAB
  CLINICAL
}

enum AttendanceStatus {
  PRESENT
  ABSENT
  LATE
  EXCUSED
}

enum CheckInMethod {
  CODE
  QR
  MANUAL
  GEOFENCE
}

enum UserRole {
  STUDENT
  EXAMINER
  ADMIN
}

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  role          UserRole @default(STUDENT)
  regNo         String?  @unique // for students
  name          String
  program       String?  // BSE, BCS, etc.
  year          Int?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  // Relations
  studentSessions ExamSession[] @relation("StudentSessions")
  examinerCourses Course[]      @relation("ExaminerCourses")
  attendances     Attendance[]
}

model Course {
  id            String   @id @default(cuid())
  code          String   @unique // SWE2106
  title         String
  creditUnits   Int      @default(3)
  program       String   // BSE, BCS, etc.
  year          Int
  semester      Int      // 1 or 2
  examinerId    String?
  examiner      User?    @relation("ExaminerCourses", fields: [examinerId], references: [id])
  sessions      Session[]
  enrollments   Enrollment[]
}

model Session {
  id              String   @id @default(cuid())
  courseId        String
  course          Course   @relation(fields: [courseId], references: [id])
  date            DateTime // Date only (start of day)
  startTime       DateTime
  endTime         DateTime
  room            String?
  sessionType     SessionType @default(LECTURE)
  checkinCode     String?
  codeExpiresAt   DateTime?
  codeRotatedAt   DateTime?
  attendances     Attendance[]
  @@index([courseId, date])
  @@index([date])
}

model Enrollment {
  id        String @id @default(cuid())
  studentId String
  student   User   @relation("StudentSessions", fields: [studentId], references: [id])
  courseId  String
  course    Course @relation(fields: [courseId], references: [id])
  @@unique([studentId, courseId])
}

model Attendance {
  id          String @id @default(cuid())
  studentId   String
  student     User   @relation(fields: [studentId], references: [id])
  sessionId   String
  session     Session @relation(fields: [sessionId], references: [id])
  status      AttendanceStatus @default(PRESENT)
  method      CheckInMethod @default(CODE)
  recordedAt  DateTime @default(now())
  syncedAt    DateTime? // Null = pending offline sync
  deviceInfo  String?
  @@unique([studentId, sessionId])
  @@index([sessionId])
  @@index([studentId, recordedAt])
}

model CheckinCode {
  id        String @id @default(cuid())
  sessionId String @unique
  code      String
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

---

## 5. API Specification

### 5.1 Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Email/password → JWT access + refresh |
| POST | `/api/auth/refresh` | Refresh token → new access token |
| GET | `/api/auth/me` | Current user profile |

### 5.2 Examiner Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/examiner/sessions/today` | List today's sessions for examiner |
| GET | `/api/examiner/sessions/:id` | Session details |
| POST | `/api/examiner/sessions/:id/start-checkin` | Generate/rotate code |
| POST | `/api/examiner/sessions/:id/stop-checkin` | Invalidate code |
| GET | `/api/examiner/sessions/:id/attendance` | Live attendance list |

### 5.3 Student Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/student/checkin` | Submit code → record attendance |
| GET | `/api/student/attendance/summary` | Own attendance % per course |
| GET | `/api/student/sessions/upcoming` | Upcoming sessions for enrolled courses |

### 5.4 Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/eligibility/:courseId` | Exam eligibility list (80% rule) |
| GET | `/api/admin/eligibility/:courseId/pdf` | Export PDF (Appendix D format) |
| GET | `/api/admin/students` | Manage students |
| GET | `/api/admin/courses` | Manage courses |

### 5.5 Request/Response Examples

**POST `/api/student/checkin`**
```json
// Request
{
  "sessionId": "cuid...",
  "code": "7K9M2P"
}

// Response (200)
{
  "success": true,
  "attendance": {
    "id": "cuid...",
    "sessionId": "cuid...",
    "status": "PRESENT",
    "method": "CODE",
    "recordedAt": "2026-11-15T10:05:00Z"
  },
  "session": {
    "courseCode": "SWE2106",
    "date": "2026-11-15",
    "startTime": "10:00"
  }
}
```

**GET `/api/admin/eligibility/:courseId`**
```json
// Response (200)
{
  "course": { "code": "SWE2106", "title": "Internet Technologies and Web Design" },
  "students": [
    {
      "regNo": "2025/BSE/001/PS",
      "name": "Alice Nakato",
      "presentCount": 28,
      "totalSessions": 30,
      "attendancePct": 93.33,
      "eligible": true
    },
    {
      "regNo": "2025/BSE/002/PS",
      "name": "Bob Kato",
      "presentCount": 22,
      "totalSessions": 30,
      "attendancePct": 73.33,
      "eligible": false
    }
  ]
}
```

---

## 6. Offline-First Design (Student PWA)

### 6.1 IndexedDB Queue
```typescript
// frontend/src/services/offlineQueue.ts
interface QueuedCheckin {
  id: string;
  sessionId: string;
  code: string;
  timestamp: number;
  retries: number;
}

// On submit (online or offline):
await queueCheckin(sessionId, code);

// Background sync (service worker):
navigator.serviceWorker.ready.then(reg => {
  reg.sync.register('attendance-sync');
});
```

### 6.2 Sync Strategy
- Queue failed requests in IndexedDB
- Service Worker `sync` event triggers retry
- Max 5 retries, then discard
- Visual indicator: "Synced" / "Pending" / "Failed"

---

## 7. Eligibility Calculation (80% Rule)

```sql
-- Single optimized query
SELECT 
  u.id as student_id,
  u.reg_no,
  u.name,
  COUNT(a.id) FILTER (WHERE a.status = 'PRESENT') as present_count,
  COUNT(s.id) as total_sessions,
  ROUND(
    COUNT(a.id) FILTER (WHERE a.status = 'PRESENT') * 100.0 / 
    NULLIF(COUNT(s.id), 0), 2
  ) as attendance_pct,
  CASE 
    WHEN COUNT(s.id) = 0 THEN false
    WHEN COUNT(a.id) FILTER (WHERE a.status = 'PRESENT') * 100.0 / COUNT(s.id) >= 80 
    THEN true ELSE false 
  END as eligible
FROM users u
JOIN enrollments e ON e.student_id = u.id
JOIN courses c ON c.id = e.course_id
JOIN sessions s ON s.course_id = c.id
LEFT JOIN attendances a ON a.session_id = s.id AND a.student_id = u.id
WHERE c.id = $1
GROUP BY u.id, u.reg_no, u.name;
```

---

## 8. PDF Export (Appendix D Format)

Matches MUST Examination Regulations **Appendix D: Examination Attendance Register** exactly:

```
MBARARA UNIVERSITY OF SCIENCE AND TECHNOLOGY
EXAMINATION ATTENDANCE REGISTER

Course: SWE2106 - Internet Technologies and Web Design
Program: BSE Year: II Semester: I
Date: 15/11/2026

| No. | Reg No.         | Name           | Status   | Signature |
|-----|-----------------|----------------|----------|-----------|
| 1   | 2025/BSE/001/PS | Alice Nakato   | PRESENT  |           |
| 2   | 2025/BSE/002/PS | Bob Kato       | ABSENT   |           |
...
```

Generated via `@react-pdf/renderer` or `pdfkit`.

---

## 9. Project Structure

```
sams-attendance/
├── backend/
│   ├── src/
│   │   ├── config/           # env.ts, db.ts, redis.ts
│   │   ├── controllers/      # auth, examiner, student, admin
│   │   ├── middleware/       # auth.ts, validate.ts, rateLimit.ts
│   │   ├── routes/           # API route definitions
│   │   ├── services/         # checkinCode.ts, eligibility.ts, pdf.ts
│   │   ├── utils/            # errors.ts, asyncHandler.ts, jwt.ts
│   │   ├── app.ts            # Express app setup
│   │   └── server.ts         # Entry point
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts           # Loads data/students.csv, timetable
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── ExaminerDashboard.tsx
│   │   │   ├── ExaminerSession.tsx       # Rotating code display
│   │   │   ├── StudentCheckin.tsx        # Code input
│   │   │   ├── StudentSummary.tsx        # My attendance %
│   │   │   └── AdminEligibility.tsx      # Exam lists + PDF
│   │   ├── components/
│   │   │   ├── CodeDisplay.tsx           # Large 6-digit with countdown
│   │   │   ├── CodeInput.tsx             # 6-char input with auto-focus
│   │   │   ├── AttendanceTable.tsx
│   │   │   └── EligibilityTable.tsx
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useOfflineQueue.ts
│   │   │   └── useSessions.ts
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   ├── indexedDB.ts
│   │   │   └── sync.ts
│   │   ├── types/
│   │   │   └── api.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── vite-env.d.ts
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── data/
│   ├── students.csv              # 50 synthesized students
│   ├── enrollments.csv           # Student ↔ Course
│   ├── timetable_export.json     # 1,304 real sessions (mylectures-2)
│   └── timetable_metadata.json
├── docs/
│   ├── ARCHITECTURE.md           # This file (system design)
│   ├── API_SPEC.md               # Full OpenAPI spec
│   ├── DATA_DICTIONARY.md        # Entity definitions
│   ├── ATTENDANCE_METHODS.md     # Code vs QR vs Geofence analysis
│   ├── FEASIBILITY_ANALYSIS.md   # SAMS vs Transcript vs Course Reg
│   ├── MUST_SYSTEMS_INTEGRATION.md # MUST ecosystem map
│   └── DEPLOYMENT.md             # Docker, env, MUST server
├── docker-compose.yml
├── README.md
└── .github/workflows/ci.yml
```

---

## 10. Development Setup

### 10.1 Prerequisites
- Node 20+
- PostgreSQL 15+ (local or Docker)
- Redis 7+ (for check-in codes, optional for dev)

### 10.2 Quick Start
```bash
# Clone
git clone https://github.com/mugmarp/sams-attendance
cd sams-attendance

# Backend
cd backend
cp .env.example .env  # Edit DATABASE_URL
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev           # http://localhost:3000

# Frontend (new terminal)
cd frontend
npm install
npm run dev           # http://localhost:5173
```

### 10.3 Environment Variables
```bash
# backend/.env
DATABASE_URL="postgresql://user:pass@localhost:5432/sams?schema=public"
JWT_SECRET="your-super-secret-key-min-32-chars"
JWT_REFRESH_SECRET="different-super-secret-key-min-32-chars"
JWT_ACCESS_TTL="15m"
JWT_REFRESH_TTL="7d"
PORT=3000
NODE_ENV=development
FRONTEND_URL="http://localhost:5173"
REDIS_URL="redis://localhost:6379"  # optional
```

---

## 11. Deployment

### 11.1 Docker Compose (Local/Prod)
```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: sams
      POSTGRES_USER: sams
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports: ["5432:5432"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  backend:
    build: ./backend
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://sams:${DB_PASSWORD}@postgres:5432/sams
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
    depends_on: [postgres, redis]

  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    depends_on: [backend]

volumes:
  postgres_data:
```

### 11.2 MUST Server Deployment
- Request test server from MUST ICT (PostgreSQL + Node 20 + HTTPS)
- Or deploy to Render/Railway free tier for demo
- Configure `FRONTEND_URL` and CORS for production domain

---

## 12. Testing Strategy

| Layer | Tool | Coverage Target |
|-------|------|-----------------|
| Unit | Jest | 80% services, utils |
| Integration | Supertest | All API endpoints |
| E2E | Playwright | Critical flows (check-in, eligibility) |
| Contract | Postman | Collection in `postman/` |

### Postman Collection Structure
```
SAMS Attendance/
├── Auth/
│   ├── Login (Student)
│   ├── Login (Examiner)
│   ├── Login (Admin)
│   └── Refresh Token
├── Examiner/
│   ├── Get Today's Sessions
│   ├── Start Check-in
│   ├── Stop Check-in
│   └── View Live Attendance
├── Student/
│   ├── Submit Check-in Code
│   ├── My Attendance Summary
│   └── Upcoming Sessions
└── Admin/
    ├── Get Eligibility List
    ├── Export Eligibility PDF
    └── Manage Students/Courses
```

---

## 13. Team Workstreams (5 Weeks)

| Week | Backend (2-3) | Frontend (2) | QA/Docs (1-2) | Deliverable |
|------|---------------|--------------|---------------|-------------|
| **1** | Prisma schema, auth, `/health`, Session CRUD, Seed script | Login, routing, Examiner session list | CI setup, Postman skeleton | Examiner sees today's sessions |
| **2** | Code gen/rotation/validation, Attendance recording, Offline queue API | Examiner "Start Check-in" → code display; Student code input | Unit tests, integration tests | **Code check-in works end-to-end** |
| **3** | Eligibility query, PDF export (Appendix D), Admin endpoints | Student summary, Admin eligibility list + PDF | E2E tests, Postman collection complete | Exam eligibility report |
| **4** | Polish, rate limiting, error handling, deploy | PWA manifest, responsive, offline indicator | Demo rehearsal, docs final | **Presentation ready** |
| **5** | Buffer, bug fixes, load test | Buffer, demo rehearsal | Final demo | **Live demo** |

---

## 14. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Examiner adoption fails | High | Critical | Code is simplest method; 2-min rotation; paper fallback |
| Offline sync bugs | Medium | High | IndexedDB + Service Worker; test in airplane mode |
| PDF format rejection | Low | Medium | Match Appendix D exactly; get Registrar preview |
| No test server | Medium | Low | Deploy to Render free tier (public HTTPS) |
| Scope creep | High | High | **Freeze scope Nov 17** — only MVP endpoints |

---

## 15. References & Context

| Document | Purpose |
|----------|---------|
| `docs/FEASIBILITY_ANALYSIS.md` | Why SAMS over Transcript/Course Reg |
| `docs/MUST_SYSTEMS_INTEGRATION.md` | MUST ecosystem, data sources, import strategy |
| `docs/ATTENDANCE_METHODS.md` | Code vs QR vs Geofence decision |
| `data/timetable_export.json` | 1,304 real sessions from timetable.must.ac.ug |
| `data/students.csv` | 50 synthesized students (realistic MUST format) |
| `backend/prisma/seed.ts` | Loads all CSV/JSON into DB |

---

## 16. For Codex / Coding Agent

### Starting Context
You are implementing **SAMS Attendance System** — a code-based attendance check-in for Mbarara University of Science and Technology (MUST). 

**Key constraints:**
- **No external APIs** — all data is local (CSV/JSON seeded)
- **Code-based check-in** — 6-digit rotating codes, not QR/geofence
- **Offline-first** — student PWA works in lecture halls without WiFi
- **80% rule** — exam eligibility per MUST Examination Regulations §2.3
- **5-week deadline** — MVP scope frozen, no feature creep

### Implementation Priority
1. **Week 1:** Backend auth + Prisma + Session CRUD + Seed data
2. **Week 2:** Check-in code generation/validation + Attendance recording + Offline queue
3. **Week 3:** Eligibility calculation + PDF export (Appendix D format)
4. **Week 4:** Frontend polish + PWA + Postman collection + Deploy

### Coding Standards
- TypeScript strict mode
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`
- PR required for all changes (see `docs/GIT_PR_GUIDE.md`)
- Tests for every service function
- No console.log in production code

### Data Files (Already in Repo)
```
data/
├── students.csv              # 50 students, 11 programs
├── enrollments.csv           # ~250 student-course mappings
├── timetable_export.json     # 1,304 sessions (real MUST data)
└── timetable_metadata.json   # Version info
```

### Seed Script Must Handle
- Users (students + examiners + admins)
- Courses (from timetable_export.json unique course codes)
- Sessions (all 1,304 from timetable_export.json)
- Enrollments (from enrollments.csv)
- Floor resolution for rooms (port logic from mylectures-2)

---

*Version 1.0 | 2026-11-10 | Ready for Codex implementation*