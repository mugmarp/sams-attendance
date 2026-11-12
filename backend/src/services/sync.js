import {
  enrollmentCovers,
  enrollmentWhere,
  enrollmentContext,
} from "./academic.js";
import { createHash } from "node:crypto";
import { prisma } from "../config/db.js";
import {
  locked,
  owns,
  sessionDTO,
  writeManualAttendance,
} from "./attendance.js";
import { ForbiddenError, ValidationError } from "../utils/errors.js";
const HOURS = 72;
const json = (value) => JSON.parse(JSON.stringify(value));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
const hash = (value) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
function context(session) {
  return {
    version: session.version,
    startTime: session.startTime.toISOString(),
    endTime: session.endTime.toISOString(),
    courseId: session.courseId,
    examinerId: session.course.examinerId,
    threshold: session.course.attendanceThreshold,
    countLate: session.course.countLate,
    countExcused: session.course.countExcused,
    policyVersion: session.course.policyVersion,
    academicYear: session.course.academicYear,
  };
}
async function freshActor(tx, actor) {
  const user = await tx.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, role: true, isActive: true },
  });
  if (!user?.isActive) throw new ForbiddenError("This account is unavailable");
  return { userId: user.id, role: user.role };
}
const teacher = (actor) => ["EXAMINER", "ADMIN"].includes(actor.role);
export async function prepareRegister(actor, sessionId, purpose) {
  return prisma.$transaction(async (tx) => {
    actor = await freshActor(tx, actor);
    if (!teacher(actor)) throw new ForbiddenError();
    const session = await locked(tx, sessionId);
    owns(actor, session.course.examinerId);
    if (
      session.status === "CANCELLED" ||
      (purpose === "MARK" && session.status !== "SCHEDULED")
    )
      throw new ValidationError(
        "Prepare an open class, or review a completed class explicitly",
      );
    const rows = await tx.enrollment.findMany({
      where: {
        courseId: session.courseId,
        ...enrollmentWhere(session.startTime),
      },
      include: { student: { select: { id: true, name: true, regNo: true } } },
      orderBy: { student: { regNo: "asc" } },
    });
    const records = await tx.attendance.findMany({ where: { sessionId } });
    const roster = rows.map((row) => {
      const record = records.find((item) => item.studentId === row.studentId);
      return {
        student: row.student,
        ...enrollmentContext(row),
        attendance: record ? { ...record, changes: [] } : null,
      };
    });
    const snapshot = {
      context: context(session),
      students: Object.fromEntries(
        roster.map((row) => [
          row.student.id,
          {
            enrollmentId: row.enrollmentId,
            effectiveFrom: row.effectiveFrom,
            effectiveUntil: row.effectiveUntil,
            version: row.attendance?.version || 0,
          },
        ]),
      ),
    };
    const expiresAt = new Date(Date.now() + HOURS * 3600000);
    const preparation = await tx.offlinePreparation.create({
      data: { actorId: actor.userId, sessionId, purpose, expiresAt, snapshot },
    });
    const safe = sessionDTO(session);
    // Do not persist live check-in codes or secrets in the prepared register.
    return {
      id: preparation.id,
      userId: actor.userId,
      purpose,
      createdAt: preparation.createdAt,
      expiresAt,
      serverNow: new Date(),
      session: safe,
      roster,
    };
  });
}
const outcome = (kind, code, message, extra = {}) => ({
  outcome: kind,
  code,
  message,
  ...json(extra),
});
async function currentAttendance(tx, op) {
  return tx.attendance.findUnique({
    where: {
      studentId_sessionId: { studentId: op.studentId, sessionId: op.sessionId },
    },
  });
}
async function mark(tx, actor, op, session) {
  const preparation = await tx.offlinePreparation.findUnique({
    where: { id: op.preparationId },
  });
  if (
    !preparation ||
    preparation.actorId !== actor.userId ||
    preparation.sessionId !== session.id
  )
    return outcome(
      "DENIED",
      "PREPARATION_MISMATCH",
      "Prepare this register using your own account",
    );
  const review = op.type === "REVIEW_MARK";
  if (preparation.purpose !== (review ? "REVIEW" : "MARK"))
    return outcome(
      "DENIED",
      "PREPARATION_PURPOSE",
      "Use a preparation made for this action",
    );
  if (review) {
    const original = await tx.syncReceipt.findUnique({
      where: {
        actorId_operationId: {
          actorId: actor.userId,
          operationId: op.reviewOf,
        },
      },
    });
    if (
      !original ||
      original.payload.sessionId !== op.sessionId ||
      original.payload.studentId !== op.studentId ||
      !["CONFLICT", "NEEDS_REVIEW"].includes(original.result.outcome)
    )
      return outcome(
        "DENIED",
        "REVIEW_MISMATCH",
        "Choose an unresolved mark for this student and class",
      );
  }
  if (session.status === "CANCELLED")
    return outcome(
      "DENIED",
      "CLASS_CANCELLED",
      "A cancelled class cannot receive attendance",
    );
  const previous = await currentAttendance(tx, op);
  const current = { sessionVersion: session.version, attendance: previous };
  if (preparation.expiresAt <= new Date())
    return outcome(
      "NEEDS_REVIEW",
      "PREPARATION_EXPIRED",
      "The 72-hour preparation expired; review the current register",
      { current },
    );
  if (
    op.baseSessionVersion !== preparation.snapshot.context.version ||
    hash(context(session)) !==
      hash({
        countLate: true,
        countExcused: false,
        policyVersion: 1,
        ...preparation.snapshot.context,
      })
  )
    return outcome(
      "CONFLICT",
      "CLASS_CHANGED",
      "The class or its policy changed after preparation",
      { current },
    );
  if (!review && session.status !== "SCHEDULED")
    return outcome(
      "NEEDS_REVIEW",
      "CLASS_FINALIZED",
      "The class was finalized; review its current register",
      { current },
    );
  if (new Date() < session.startTime)
    return outcome(
      "DENIED",
      "CLASS_NOT_STARTED",
      "A future class cannot receive attendance",
    );
  const prepared = preparation.snapshot.students[op.studentId];
  const enrollment = await tx.enrollment.findUnique({
    where: {
      studentId_courseId: {
        studentId: op.studentId,
        courseId: session.courseId,
      },
    },
  });
  if (
    !prepared ||
    !enrollmentCovers(enrollment, session.startTime) ||
    enrollment.id !== prepared.enrollmentId ||
    (prepared.effectiveFrom || null) !==
      enrollmentContext(enrollment).effectiveFrom ||
    (prepared.effectiveUntil || null) !==
      enrollmentContext(enrollment).effectiveUntil
  )
    return outcome(
      "DENIED",
      "ENROLLMENT_CHANGED",
      "The prepared enrollment is no longer valid",
    );
  if (
    op.baseAttendanceVersion !== prepared.version ||
    (previous?.version || 0) !== op.baseAttendanceVersion
  )
    return outcome(
      "CONFLICT",
      "ATTENDANCE_CHANGED",
      "Attendance changed after this roster was prepared",
      { current },
    );
  const attendance = await writeManualAttendance(
    tx,
    actor,
    session.id,
    op.studentId,
    op.status,
    op.reason,
    op.operationId,
  );
  return outcome(
    "ACCEPTED",
    "ATTENDANCE_RECORDED",
    "Attendance recorded by the server",
    { attendance },
  );
}
async function studentClaim(tx, actor, op, session) {
  if (session.status === "CANCELLED" || new Date() < session.startTime)
    return outcome(
      "DENIED",
      "CLASS_UNAVAILABLE",
      "Request review for a class that took place",
    );
  const enrollment = await tx.enrollment.findUnique({
    where: {
      studentId_courseId: {
        studentId: actor.userId,
        courseId: session.courseId,
      },
    },
  });
  if (!enrollmentCovers(enrollment, session.startTime))
    return outcome(
      "DENIED",
      "NOT_ENROLLED",
      "You are not enrolled in this course",
    );
  const attendance = await tx.attendance.findUnique({
    where: {
      studentId_sessionId: { studentId: actor.userId, sessionId: session.id },
    },
  });
  if (attendance && ["PRESENT", "LATE"].includes(attendance.status))
    return outcome(
      "DENIED",
      "ALREADY_RECORDED",
      "Attendance is already recorded; ask your lecturer about other corrections",
    );
  const existing = await tx.attendanceClaim.findUnique({
    where: {
      studentId_sessionId: { studentId: actor.userId, sessionId: session.id },
    },
  });
  if (existing)
    return outcome(
      "DENIED",
      "CLAIM_EXISTS",
      "A review request already exists for this class",
      { claim: existing },
    );
  const claim = await tx.attendanceClaim.create({
    data: { studentId: actor.userId, sessionId: session.id, reason: op.reason },
  });
  return outcome(
    "ACCEPTED",
    "CLAIM_SUBMITTED",
    "Review requested; attendance has not been counted",
    { claim },
  );
}
async function decideClaim(tx, actor, op, session) {
  const claim = await tx.attendanceClaim.findUnique({
    where: { id: op.claimId },
  });
  if (
    !claim ||
    claim.sessionId !== session.id ||
    claim.studentId !== op.studentId
  )
    return outcome(
      "DENIED",
      "CLAIM_MISMATCH",
      "Review request does not match this class and student",
    );
  if (claim.status !== "PENDING" || claim.version !== op.baseClaimVersion)
    return outcome(
      "CONFLICT",
      "CLAIM_CHANGED",
      "This request has already been decided or changed",
    );
  let attendance = await currentAttendance(tx, op);
  if (op.decision === "APPROVE") {
    if (session.status === "CANCELLED" || new Date() < session.startTime)
      return outcome(
        "DENIED",
        "CLASS_UNAVAILABLE",
        "A future or cancelled class cannot receive attendance",
      );
    const enrollment = await tx.enrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId: op.studentId,
          courseId: session.courseId,
        },
      },
    });
    if (!enrollmentCovers(enrollment, session.startTime))
      return outcome(
        "DENIED",
        "NOT_ENROLLED",
        "The student is no longer enrolled",
      );
    if (
      session.version !== op.baseSessionVersion ||
      (attendance?.version || 0) !== op.baseAttendanceVersion
    )
      return outcome(
        "CONFLICT",
        "REGISTER_CHANGED",
        "The register changed; inspect the latest record before approving",
        { current: { sessionVersion: session.version, attendance } },
      );
    attendance = await writeManualAttendance(
      tx,
      actor,
      session.id,
      op.studentId,
      op.status,
      op.reason,
      op.operationId,
    );
  }
  const decided = await tx.attendanceClaim.update({
    where: { id: claim.id },
    data: {
      status: op.decision === "APPROVE" ? "APPROVED" : "REJECTED",
      version: { increment: 1 },
      reviewerId: actor.userId,
      decisionReason: op.reason,
      decidedAt: new Date(),
    },
  });
  return outcome(
    "ACCEPTED",
    "CLAIM_DECIDED",
    op.decision === "APPROVE"
      ? "Review approved and attendance recorded"
      : "Review rejected; attendance unchanged",
    { claim: decided, attendance },
  );
}
export async function synchronize(actor, operations) {
  const results = [];
  for (const op of operations) {
    results.push(
      await prisma.$transaction(
        async (tx) => {
          // Lock operation identity before reading its receipt; concurrent retries serialize.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.userId + ":" + op.operationId}, 0))::text AS locked`;
          const currentActor = await freshActor(tx, actor);
          const existing = await tx.syncReceipt.findUnique({
            where: {
              actorId_operationId: {
                actorId: actor.userId,
                operationId: op.operationId,
              },
            },
          });
          const payloadHash = hash(op);
          if (existing)
            return existing.payloadHash === payloadHash
              ? { ...existing.result, replayed: true }
              : {
                  operationId: op.operationId,
                  ...outcome(
                    "CONFLICT",
                    "OPERATION_ID_REUSED",
                    "This operation ID already has different content",
                  ),
                };
          let result;
          const allowed =
            op.type === "STUDENT_CLAIM"
              ? currentActor.role === "STUDENT"
              : teacher(currentActor);
          if (!allowed)
            result = outcome(
              "DENIED",
              "ROLE_CHANGED",
              "Your current account cannot perform this action",
            );
          else {
            const found = await tx.session.findUnique({
              where: { id: op.sessionId },
              select: { id: true },
            });
            if (!found)
              result = outcome("DENIED", "CLASS_MISSING", "Class not found");
            else {
              const session = await locked(tx, op.sessionId);
              const owned =
                currentActor.role === "ADMIN" ||
                session.course.examinerId === currentActor.userId;
              if (op.type !== "STUDENT_CLAIM" && !owned)
                result = outcome(
                  "DENIED",
                  "OWNERSHIP_CHANGED",
                  "This class is not currently assigned to you",
                );
              else if (op.type === "STUDENT_CLAIM")
                result = await studentClaim(tx, currentActor, op, session);
              else if (op.type === "CLAIM_DECISION")
                result = await decideClaim(tx, currentActor, op, session);
              else result = await mark(tx, currentActor, op, session);
            }
          }
          const receivedAt = new Date();
          result = json({
            ...result,
            operationId: op.operationId,
            receivedAt,
            replayed: false,
          });
          await tx.syncReceipt.create({
            data: {
              actorId: actor.userId,
              operationId: op.operationId,
              payloadHash,
              payload: json(op),
              result,
              receivedAt,
            },
          });
          return result;
        },
        { maxWait: 10000, timeout: 15000 },
      ),
    );
  }
  return results;
}
