import { prisma } from "../config/db";
import { NotFoundError } from "../utils/errors";
import { attendanceResult } from "./rules";
export async function getCourseEligibility(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      sessions: {
        where: { status: "COMPLETED" },
        include: { attendances: true },
      },
      enrollments: {
        include: { student: { select: { id: true, name: true, regNo: true } } },
        orderBy: { student: { regNo: "asc" } },
      },
    },
  });
  if (!course) throw new NotFoundError("Course not found");
  const students = course.enrollments.map(({ student }) => {
    const present = course.sessions.filter((s) =>
      s.attendances.some(
        (a) =>
          a.studentId === student.id && ["PRESENT", "LATE"].includes(a.status),
      ),
    ).length;
    return {
      studentId: student.id,
      regNo: student.regNo ?? "",
      name: student.name,
      ...attendanceResult(present, course.sessions.length),
    };
  });
  return {
    course: {
      id: course.id,
      code: course.code,
      title: course.title,
      program: course.program,
      year: course.year,
      semester: course.semester,
      academicYear: course.academicYear,
    },
    students,
    rules:
      "Completed classes only. PRESENT and LATE count. Attendance qualification only; fees and coursework are not assessed.",
  };
}
export async function getStudentAttendanceSummary(studentId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId },
    include: {
      course: {
        include: {
          sessions: {
            where: { status: "COMPLETED" },
            include: { attendances: { where: { studentId } } },
          },
        },
      },
    },
    orderBy: { course: { code: "asc" } },
  });
  return enrollments.map(({ course }) => ({
    courseId: course.id,
    courseCode: course.code,
    courseTitle: course.title,
    academicYear: course.academicYear,
    semester: course.semester,
    ...attendanceResult(
      course.sessions.filter((s) =>
        s.attendances.some((a) => ["PRESENT", "LATE"].includes(a.status)),
      ).length,
      course.sessions.length,
    ),
  }));
}
