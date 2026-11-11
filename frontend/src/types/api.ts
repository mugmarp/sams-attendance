// frontend/src/types/api.ts
export interface User {
  id: string;
  regNo: string | null;
  name: string;
  email: string;
  role: 'STUDENT' | 'EXAMINER' | 'ADMIN';
  program: string | null;
  year: number | null;
}

export interface Session {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  room: string | null;
  sessionType: 'LECTURE' | 'TUTORIAL' | 'PRACTICAL' | 'LAB' | 'CLINICAL';
  checkinCode: string | null;
  codeExpiresAt: string | null;
  hasActiveCode?: boolean;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  student?: {
    id: string;
    regNo: string;
    name: string;
    email: string;
  };
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  method: 'CODE' | 'QR' | 'MANUAL' | 'GEOFENCE';
  recordedAt: string;
  syncedAt: string | null;
  deviceInfo: string | null;
}

export interface CheckinRequest {
  sessionId: string;
  code: string;
}

export interface CheckinResponse {
  success: boolean;
  attendance: AttendanceRecord;
  session: {
    courseCode: string;
    courseTitle: string;
    date: string;
    startTime: string;
  };
}

export interface EligibilityStudent {
  studentId: string;
  regNo: string;
  name: string;
  presentCount: number;
  totalSessions: number;
  attendancePct: number;
  eligible: boolean;
}

export interface EligibilityResponse {
  course: {
    id: string;
    code: string;
    title: string;
  };
  students: EligibilityStudent[];
}

export interface StudentAttendanceSummary {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  presentCount: number;
  totalSessions: number;
  attendancePct: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Course {
  id: string;
  code: string;
  title: string;
  creditUnits: number;
  program: string;
  year: number;
  semester: number;
  examinerId: string | null;
  examiner?: User | null;
  _count?: {
    enrollments: number;
    sessions: number;
  };
}