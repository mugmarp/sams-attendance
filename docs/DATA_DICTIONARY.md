# Data Dictionary — SAMS Attendance

## Core Entities

### User
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID (cuid) | PK, unique | Internal identifier |
| `email` | String | Unique, not null | Login email |
| `passwordHash` | String | Not null | Bcrypt hash |
| `role` | Enum | Not null, default STUDENT | `STUDENT`, `EXAMINER`, `ADMIN` |
| `regNo` | String | Unique, nullable | MUST registration number (`2025/BSE/001/PS`) |
| `name` | String | Not null | Full name |
| `program` | String | Nullable | Program code (BSE, BCS, BBA, BIT, BPCD, BSAF, ECO, PEM, MIE, DLT, HEAP) |
| `year` | Integer | Nullable | Year of study (1-5) |
| `createdAt` | DateTime | Default now | |
| `updatedAt` | DateTime | Auto-update | |

### Course
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK | |
| `code` | String | Unique | e.g., `SWE2106` |
| `title` | String | | e.g., `Internet Technologies and Web Design` |
| `creditUnits` | Integer | Default 3 | |
| `program` | String | | BSE, BCS, etc. |
| `year` | Integer | | 1-5 |
| `semester` | Integer | | 1 or 2 |
| `examinerId` | String | FK → User.id, nullable | Assigned examiner |
| `createdAt` | DateTime | Default now | |
| `updatedAt` | DateTime | Auto-update | |

### Session
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK | |
| `courseId` | String | FK → Course.id | |
| `date` | DateTime | Date only (00:00:00) | |
| `startTime` | DateTime | Full timestamp | |
| `endTime` | DateTime | Full timestamp | |
| `room` | String | Nullable | Room name (e.g., `S211`, `GFL02`) |
| `sessionType` | Enum | Default LECTURE | `LECTURE`, `TUTORIAL`, `PRACTICAL`, `LAB`, `CLINICAL` |
| `checkinCode` | String | Nullable | Current 6-digit code |
| `codeExpiresAt` | DateTime | Nullable | Code expiry |
| `codeRotatedAt` | DateTime | Nullable | Last rotation timestamp |
| `createdAt` | DateTime | Default now | |
| `updatedAt` | DateTime | Auto-update | |

### Enrollment
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK | |
| `studentId` | String | FK → User.id | |
| `courseId` | String | FK → Course.id | |
| `createdAt` | DateTime | Default now | |
| **Unique** | | `(studentId, courseId)` | One enrollment per student per course |

### Attendance
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK | |
| `studentId` | String | FK → User.id | |
| `sessionId` | String | FK → Session.id | |
| `status` | Enum | Default PRESENT | `PRESENT`, `ABSENT`, `LATE`, `EXCUSED` |
| `method` | Enum | Default CODE | `CODE`, `QR`, `MANUAL`, `GEOFENCE` |
| `recordedAt` | DateTime | Default now | When attendance was recorded |
| `syncedAt` | DateTime | Nullable | Null = pending offline sync |
| `deviceInfo` | String | Nullable | User agent, IP, etc. |
| **Unique** | | `(studentId, sessionId)` | One record per student per session |

### CheckinCode (Redis/In-Memory)
| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | String | Key |
| `code` | String | 6-char alphanumeric |
| `expiresAt` | DateTime | TTL: 10 minutes |
| `rotatedAt` | DateTime | Last rotation (every 2 min) |

---

## Enums

### UserRole
| Value | Description |
|-------|-------------|
| `STUDENT` | Enrolled student, can check in |
| `EXAMINER` | Lecturer, manages sessions, generates codes |
| `ADMIN` | Registrar staff, views eligibility, exports PDF |

### SessionType
| Value | Description |
|-------|-------------|
| `LECTURE` | Standard lecture |
| `TUTORIAL` | Tutorial session |
| `PRACTICAL` | Practical/lab session |
| `LAB` | Laboratory |
| `CLINICAL` | Clinical rotation (medical) |

### AttendanceStatus
| Value | Description |
|-------|-------------|
| `PRESENT` | Student attended |
| `ABSENT` | Student did not attend |
| `LATE` | Student attended late |
| `EXCUSED` | Authorized absence |

### CheckInMethod
| Value | Description |
|-------|-------------|
| `CODE` | 6-digit code entry (MVP) |
| `QR` | QR code scan (stretch) |
| `MANUAL` | Examiner manually marks |
| `GEOFENCE` | Location-based (future) |

---

## CSV Data Files (Committed)

### `data/students.csv` — 50 Students
| Column | Example | Notes |
|--------|---------|-------|
| `regNo` | `2025/BSE/001/PS` | MUST format |
| `name` | `Alice Nakato` | |
| `email` | `alice.nakato@student.must.ac.ug` | `@student.must.ac.ug` |
| `program` | `BSE` | 11 programs |
| `year` | `2` | 1-4 |

### `data/enrollments.csv` — ~250 Mappings
| Column | Example |
|--------|---------|
| `regNo` | `2025/BSE/001/PS` |
| `courseCode` | `SWE2106` |

### `data/timetable_export.json` — 1,304 Sessions
Source: `mylectures-2` export / `timetable.must.ac.ug` (Semester I 2026/27)

| Field | Example |
|-------|---------|
| `natural_key` | `BSE II\|SWE2106\|Monday\|10:00` |
| `program_group` | `BSE II` |
| `day` | `Monday` |
| `time_slot` | `10:00-11:00` |
| `start_time` | `10:00` |
| `end_time` | `11:00` |
| `course_code` | `SWE2106` |
| `course_title` | `Internet Technologies and Web Design` |
| `session_type` | `LECTURE` |
| `lecturer` | `Dr. John Smith` |
| `room` | `S211` |
| `shared_with` | `[]` |

### `data/timetable_metadata.json`
```json
{
  "version_label": "Final Timetable",
  "status": "Official Final",
  "is_final": true,
  "academic_year": "2026/2027",
  "semester": "Semester 1",
  "total_sessions": 1304,
  "source": "MUST Academic Registrar",
  "last_updated": 1728518400000
}
```

---

## Seed Script Requirements (`backend/prisma/seed.ts`)

```typescript
// Must accomplish:
1. Create 2 admin users (email: admin@must.ac.ug, password: admin123)
2. Create 10 examiner users (from unique lecturers in timetable)
3. Create 50 student users (from students.csv)
4. Create Courses (unique course_code from timetable)
5. Create Sessions (all 1,304 from timetable_export.json)
   - Resolve floor for each room (port logic from mylectures-2)
6. Create Enrollments (from enrollments.csv)
7. Output summary counts
```

---

## Floor Resolution Logic (Port from mylectures-2)

```typescript
// Room → Floor mapping (from RoomDirectory.kt)
const ROOM_FLOORS: Record<string, number> = {
  // Ground floor (0)
  'GFL01': 0, 'GFL02': 0, 'GFS02': 0, 'MLT': 0, 'PAT LAB': 0,
  'SFL01': 0, 'SFL02': 0, 'SFS01': 0, 'SFS02': 0, 'TFL01': 0, 'TFL02': 0,
  // First floor (1)
  'IMSG01': 1, 'IMSG02': 1, 'IMSG03': 1, 'IMSG04': 1,
  'Pharmacy L1': 1, 'S103': 1, 'S109': 1, 'S202': 1, 'S204': 1,
  // Second floor (2)
  'Pharmacy L2': 2, 'S205': 2, 'S210': 2, 'S211': 2,
  // Third floor (3)
  'Pharmacy L3': 3, 'S310': 3, 'S311': 3,
  // Fourth floor (4)
  'S403': 4,
  // Special
  'Wards': 1, 'OBG Ward': 1, 'Medical Ward': 1, 'Paediatric Ward': 1,
  'Surgical Ward': 1, 'Simulation LAB': 1,
  // Kihumuro
  'Kihumuro Library Room 1-LEVEL 1': 1, 'Kihumuro Library Room 2- LEVEL 1': 1,
  'Kihumuro Library Room 3-LEVEL 2': 2, 'Kihumuro Library Room 4-LEVEL 2': 2,
};

// Heuristics for unknown rooms
function resolveFloor(room: string): number | null {
  if (!room) return null;
  if (ROOM_FLOORS[room]) return ROOM_FLOORS[room];
  
  const upper = room.toUpperCase();
  if (/\b(GROUND|GRND|GF|LG)\b/.test(upper) || /^[A-Z]?G\d{1,3}\b/.test(upper)) return 0;
  if (/\b(1ST|FIRST|LEVEL\s+1|FLOOR\s+1|L1)\b/.test(upper) || /^[A-Z]?1\d{2}\b/.test(upper)) return 1;
  if (/\b(2ND|SECOND|LEVEL\s+2|FLOOR\s+2|L2)\b/.test(upper) || /^[A-Z]?2\d{2}\b/.test(upper)) return 2;
  if (/\b(3RD|THIRD|LEVEL\s+3|FLOOR\s+3|L3)\b/.test(upper) || /^[A-Z]?3\d{2}\b/.test(upper)) return 3;
  if (/\b(4TH|FOURTH|LEVEL\s+4|FLOOR\s+4|L4)\b/.test(upper) || /^[A-Z]?4\d{2}\b/.test(upper)) return 4;
  
  return null;
}
```

---

*Version 1.0 | 2026-11-10*