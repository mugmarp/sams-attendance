// backend/src/services/eligibility.ts
import { prisma } from '../config/db';

export interface EligibilityStudent {
  studentId: string;
  regNo: string;
  name: string;
  presentCount: number;
  totalSessions: number;
  attendancePct: number;
  eligible: boolean;
}

export interface EligibilityResult {
  course: {
    id: string;
    code: string;
    title: string;
  };
  students: EligibilityStudent[];
}

export async function getCourseEligibility(courseId: string): Promise<EligibilityResult> {
  // Verify course exists
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, code: true, title: true },
  });
  
  if (!course) {
    throw new Error('Course not found');
  }
  
  // Get eligibility data using raw query for performance
  const students = await prisma.$queryRaw<EligibilityStudent[]>`
    SELECT 
      u.id as "studentId",
      u."regNo",
      u.name,
      COUNT(a.id) FILTER (WHERE a.status = 'PRESENT') as "presentCount",
      COUNT(s.id) as "totalSessions",
      ROUND(
        COUNT(a.id) FILTER (WHERE a.status = 'PRESENT') * 100.0 / 
        NULLIF(COUNT(s.id), 0), 2
      ) as "attendancePct",
      CASE 
        WHEN COUNT(s.id) = 0 THEN false
        WHEN COUNT(a.id) FILTER (WHERE a.status = 'PRESENT') * 100.0 / COUNT(s.id) >= 80 
        THEN true ELSE false 
      END as eligible
    FROM "User" u
    JOIN "Enrollment" e ON e."studentId" = u.id
    JOIN "Course" c ON c.id = e."courseId"
    JOIN "Session" s ON s."courseId" = c.id
    LEFT JOIN "Attendance" a ON a."sessionId" = s.id AND a."studentId" = u.id
    WHERE c.id = ${courseId}
    GROUP BY u.id, u."regNo", u.name
    ORDER BY u."regNo"
  `;
  
  return { course, students };
}

export interface StudentAttendanceSummary {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  presentCount: number;
  totalSessions: number;
  attendancePct: number;
}

export async function getStudentAttendanceSummary(studentId: string): Promise<StudentAttendanceSummary[]> {
  const summaries = await prisma.$queryRaw<StudentAttendanceSummary[]>`
    SELECT 
      c.id as "courseId",
      c.code as "courseCode",
      c.title as "courseTitle",
      COUNT(a.id) FILTER (WHERE a.status = 'PRESENT') as "presentCount",
      COUNT(s.id) as "totalSessions",
      ROUND(
        COUNT(a.id) FILTER (WHERE a.status = 'PRESENT') * 100.0 / 
        NULLIF(COUNT(s.id), 0), 2
      ) as "attendancePct"
    FROM "Course" c
    JOIN "Enrollment" e ON e."courseId" = c.id
    JOIN "Session" s ON s."courseId" = c.id
    LEFT JOIN "Attendance" a ON a."sessionId" = s.id AND a."studentId" = ${studentId}
    WHERE e."studentId" = ${studentId}
    GROUP BY c.id, c.code, c.title
    ORDER BY c.code
  `;
  
  return summaries;
}

export async function getSessionAttendance(sessionId: string) {
  return prisma.attendance.findMany({
    where: { sessionId },
    include: {
      student: {
        select: { id: true, regNo: true, name: true, email: true },
      },
    },
    orderBy: { recordedAt: 'asc' },
  });
}