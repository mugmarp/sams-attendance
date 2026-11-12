import { enrollmentCovers, audit } from "./academic.js";
import { randomBytes } from "node:crypto";
import { prisma } from "../config/db.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from "../utils/errors.js";
import { currentCode, matchesCode, WINDOW_MS } from "./rules.js";
export function sessionDTO(session, lecturer = false) {
  const { checkinSecret, checkinStartedAt, checkinClosesAt, ...safe } = session;
  const active =
    session.status === "SCHEDULED" &&
    checkinSecret &&
    checkinStartedAt &&
    checkinClosesAt
      ? currentCode(checkinSecret, checkinStartedAt, checkinClosesAt)
      : null;
  return {
    ...safe,
    course: Object.fromEntries(
      Object.entries(safe.course).filter(([key]) => key !== "enrollments"),
    ),
    courseCode: session.course.code,
    courseTitle: session.course.title,
    date: session.startTime,
    hasActiveCode: !!active,
    ...(lecturer ? { activeCode: active } : {}),
  };
}
export async function locked(tx, id) {
  await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${id} FOR UPDATE`;
  const session = await tx.session.findUnique({
    where: { id },
    include: { course: true },
  });
  if (!session) throw new NotFoundError("Session not found");
  return session;
}
export function owns(actor, examinerId) {
  if (actor.role !== "ADMIN" && actor.userId !== examinerId)
    throw new ForbiddenError("This class belongs to another examiner");
}
export async function manageSession(actor, id, action) {
  return prisma.$transaction(async (tx) => {
    const session = await locked(tx, id);
    owns(actor, session.course.examinerId);
    const now = new Date();
    if (action === "start") {
      if (
        session.status !== "SCHEDULED" ||
        now < session.startTime ||
        now >= session.endTime
      ) {
        throw new ValidationError(
          "Check-in can only open during a scheduled class",
        );
      }
      if (session.checkinClosesAt && now < session.checkinClosesAt) {
        return sessionDTO(session, true).activeCode;
      }
      const updated = await tx.session.update({
        where: { id },
        data: {
          checkinSecret: randomBytes(32).toString("hex"),
          checkinStartedAt: now,
          checkinClosesAt: new Date(
            Math.min(now.getTime() + WINDOW_MS, session.endTime.getTime()),
          ),
        },
        include: { course: true },
      });
      return sessionDTO(updated, true).activeCode;
    }
    if (action === "COMPLETED" && now < session.startTime)
      throw new ValidationError("A future class cannot be completed");
    if (action !== "stop" && session.status !== "SCHEDULED")
      throw new ConflictError(
        "Completed or cancelled classes cannot be reopened",
      );
    const updated = await tx.session.update({
      where: { id },
      data: {
        ...(action === "stop"
          ? {}
          : { status: action, version: { increment: 1 } }),
        checkinSecret: null,
        checkinStartedAt: null,
        checkinClosesAt: null,
      },
      include: { course: true },
    });
    if (action !== "stop")
      await audit(
        tx,
        actor.userId,
        "SESSION_" + action,
        "Session",
        id,
        { status: session.status, version: session.version },
        { status: updated.status, version: updated.version },
      );
    return sessionDTO(updated, true);
  });
}
export async function submitCheckin(studentId, sessionId, code) {
  return prisma.$transaction(async (tx) => {
    const session = await locked(tx, sessionId);
    const enrolled = await tx.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: session.courseId } },
    });
    if (!enrollmentCovers(enrolled, session.startTime))
      throw new ForbiddenError("You are not enrolled in this course");
    const existing = await tx.attendance.findUnique({
      where: { studentId_sessionId: { studentId, sessionId } },
    });
    if (existing) {
      if (existing.method === "MANUAL")
        throw new ConflictError(
          "An examiner has already recorded your attendance; contact them for corrections",
        );
      return {
        success: true,
        duplicate: true,
        attendance: existing,
        session: { courseCode: session.course.code },
      };
    }
    const now = new Date();
    const active =
      session.checkinSecret &&
      session.checkinStartedAt &&
      session.checkinClosesAt
        ? currentCode(
            session.checkinSecret,
            session.checkinStartedAt,
            session.checkinClosesAt,
            now,
          )
        : null;
    if (
      session.status !== "SCHEDULED" ||
      now < session.startTime ||
      now >= session.endTime ||
      !active ||
      !matchesCode(active.code, code)
    ) {
      throw new ValidationError(
        "Invalid, closed or expired code. Ask your examiner for help.",
      );
    }
    const attendance = await tx.attendance.create({
      data: { studentId, sessionId, status: "PRESENT", method: "CODE" },
    });
    return {
      success: true,
      duplicate: false,
      attendance,
      session: { courseCode: session.course.code },
    };
  });
}
export async function correctAttendance(
  actor,
  sessionId,
  studentId,
  status,
  reason,
) {
  return prisma.$transaction(async (tx) => {
    const session = await locked(tx, sessionId);
    owns(actor, session.course.examinerId);
    if (session.status === "CANCELLED" || new Date() < session.startTime)
      throw new ValidationError("Cannot mark a future or cancelled class");
    const enrollment = await tx.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: session.courseId } },
    });
    if (!enrollmentCovers(enrollment, session.startTime))
      throw new ValidationError("Student is not enrolled for this class date");
    return writeManualAttendance(
      tx,
      actor,
      sessionId,
      studentId,
      status,
      reason,
    );
  });
}
export async function writeManualAttendance(
  tx,
  actor,
  sessionId,
  studentId,
  status,
  reason,
  operationId,
) {
  const previous = await tx.attendance.findUnique({
    where: { studentId_sessionId: { studentId, sessionId } },
  });
  const attendance = await tx.attendance.upsert({
    where: { studentId_sessionId: { studentId, sessionId } },
    create: { studentId, sessionId, status, method: "MANUAL" },
    update: { status, method: "MANUAL", version: { increment: 1 } },
  });
  await tx.attendanceChange.create({
    data: {
      attendanceId: attendance.id,
      operationId,
      actorId: actor.userId,
      previousStatus: previous?.status,
      status,
      reason,
    },
  });
  return attendance;
}
