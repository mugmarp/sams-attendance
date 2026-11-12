import { prisma } from "../config/db.js";
import { NotFoundError } from "../utils/errors.js";
import { attendanceResult } from "./rules.js";
const select = {
  id: true,
  code: true,
  title: true,
  program: true,
  year: true,
  semester: true,
  academicYear: true,
  attendanceThreshold: true,
  countLate: true,
  countExcused: true,
  policyVersion: true,
};
export async function courseReport(tx, courseId) {
  const course = await tx.course.findUnique({
    where: { id: courseId },
    select,
  });
  if (!course) throw new NotFoundError("Course not found");
  // Aggregate in PostgreSQL rather than loading every attendance row into Node.
  const rows = await tx.$queryRaw`
    SELECT e.id AS "enrollmentId", e."studentId", u.name, u."regNo", e."effectiveFrom", e."effectiveUntil",
      count(s.id)::int AS "totalSessions",
      count(a.id) FILTER (WHERE a.status = 'PRESENT' OR (a.status = 'LATE' AND c."countLate") OR (a.status = 'EXCUSED' AND c."countExcused"))::int AS "presentCount"
    FROM "Enrollment" e JOIN "User" u ON u.id=e."studentId" JOIN "Course" c ON c.id=e."courseId"
    LEFT JOIN "Session" s ON s."courseId"=c.id AND s.status='COMPLETED'
      AND (e."effectiveFrom" IS NULL OR (s."startTime" AT TIME ZONE 'Africa/Kampala')::date >= e."effectiveFrom")
      AND (e."effectiveUntil" IS NULL OR (s."startTime" AT TIME ZONE 'Africa/Kampala')::date < e."effectiveUntil")
    LEFT JOIN "Attendance" a ON a."sessionId"=s.id AND a."studentId"=e."studentId"
    WHERE c.id=${courseId}
    GROUP BY e.id,u.id ORDER BY u."regNo",u.id`;
  const students = rows.map((row) => ({
    ...row,
    ...attendanceResult(
      row.presentCount,
      row.totalSessions,
      course.attendanceThreshold,
    ),
  }));
  const pendingClaims = await tx.attendanceClaim.count({
    where: { session: { courseId }, status: "PENDING" },
  });
  return {
    course,
    students,
    pendingClaims,
    rules: `Completed classes within each student's recorded enrollment dates only. PRESENT${course.countLate ? "/LATE" : ""}${course.countExcused ? "/EXCUSED" : ""} count. Policy v${course.policyVersion}; threshold ${course.attendanceThreshold}%. Legacy undated enrollments remain unbounded. Attendance qualification only; fees and coursework are not assessed.`,
  };
}
export async function getCourseEligibility(courseId) {
  return prisma.$transaction((tx) => courseReport(tx, courseId), {
    isolationLevel: "RepeatableRead",
  });
}
export async function getStudentAttendanceSummary(studentId) {
  const rows = await prisma.$queryRaw`
    SELECT c.id AS "courseId",c.code AS "courseCode",c.title AS "courseTitle",c."academicYear",c.semester,c."attendanceThreshold",c."policyVersion",c."countLate",c."countExcused",
      e."effectiveFrom",e."effectiveUntil",count(s.id)::int AS "totalSessions",
      count(a.id) FILTER (WHERE a.status='PRESENT' OR (a.status='LATE' AND c."countLate") OR (a.status='EXCUSED' AND c."countExcused"))::int AS "presentCount"
    FROM "Enrollment" e JOIN "Course" c ON c.id=e."courseId"
    LEFT JOIN "Session" s ON s."courseId"=c.id AND s.status='COMPLETED'
      AND (e."effectiveFrom" IS NULL OR (s."startTime" AT TIME ZONE 'Africa/Kampala')::date >= e."effectiveFrom")
      AND (e."effectiveUntil" IS NULL OR (s."startTime" AT TIME ZONE 'Africa/Kampala')::date < e."effectiveUntil")
    LEFT JOIN "Attendance" a ON a."sessionId"=s.id AND a."studentId"=e."studentId"
    WHERE e."studentId"=${studentId} GROUP BY e.id,c.id ORDER BY c.code,c.id`;
  return rows.map((row) => ({
    ...row,
    ...attendanceResult(
      row.presentCount,
      row.totalSessions,
      row.attendanceThreshold,
    ),
  }));
}
