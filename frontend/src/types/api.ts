export type Role = "STUDENT" | "EXAMINER" | "ADMIN";
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  regNo: string | null;
  program: string | null;
  year: number | null;
}
export interface Course {
  id: string;
  code: string;
  title: string;
  academicYear: string;
  semester: number;
  program: string;
  examiner?: { name: string };
  _count?: { enrollments: number; sessions: number };
}
export interface Session {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  course: Course;
  startTime: string;
  endTime: string;
  room: string | null;
  sessionType: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  hasActiveCode: boolean;
  activeCode?: { code: string; expiresAt: string; closesAt: string } | null;
  checkedIn?: boolean;
}
export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
export interface RosterRow {
  student: { id: string; name: string; regNo: string };
  attendance: {
    id: string;
    status: AttendanceStatus;
    method: string;
    recordedAt: string;
    changes: {
      id: string;
      previousStatus: AttendanceStatus | null;
      status: AttendanceStatus;
      reason: string;
      recordedAt: string;
      actor: { name: string };
    }[];
  } | null;
}
export interface Summary {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  academicYear: string;
  semester: number;
  presentCount: number;
  totalSessions: number;
  attendancePct: number | null;
  eligible: boolean;
}
export interface EligibilityStudent extends Omit<
  Summary,
  "courseId" | "courseCode" | "courseTitle" | "academicYear" | "semester"
> {
  studentId: string;
  regNo: string;
  name: string;
}
export interface EligibilityResponse {
  course: Course;
  students: EligibilityStudent[];
  rules: string;
}
