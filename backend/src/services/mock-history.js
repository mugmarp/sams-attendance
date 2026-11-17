import { z } from "zod";
import { digest, audit, civilDate, dateValue } from "./academic.js";
import { kampalaDay } from "./rules.js";
import {
  ConflictError,
  ValidationError,
  ForbiddenError,
} from "../utils/errors.js";
const schema = z
  .object({
    batchKey: z.string().regex(/^[a-zA-Z0-9:-]{5,100}$/),
    termId: z.string().cuid(),
    sourceCourseId: z.string().cuid(),
    sourceNote: z.string().min(10).max(1000),
    studentIds: z.array(z.string().cuid()).min(1).max(50),
    from: civilDate,
    to: civilDate,
    sessions: z
      .array(
        z
          .object({
            key: z.string().regex(/^[a-zA-Z0-9:-]{1,120}$/),
            startTime: z.string().datetime({ offset: true }),
            endTime: z.string().datetime({ offset: true }),
            room: z.string().trim().max(120).nullable(),
            sessionType: z.enum([
              "LECTURE",
              "TUTORIAL",
              "PRACTICAL",
              "LAB",
              "CLINICAL",
            ]),
            status: z.enum(["COMPLETED", "CANCELLED"]),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export function mockStatus(studentId, sessionKey) {
  // Stable per-student attendance tendencies, plus deterministic class variation.
  const profile = parseInt(digest(studentId).slice(0, 4), 16) % 5;
  const roll =
    parseInt(digest(studentId + ":" + sessionKey).slice(0, 4), 16) % 100;
  const present = [94, 82, 72, 58, 88][profile];
  return roll < present
    ? "PRESENT"
    : roll < present + 4
      ? "LATE"
      : roll < present + 7
        ? "EXCUSED"
        : "ABSENT";
}
export async function previewMockHistory(tx, input, actorId, now = new Date()) {
  const data = schema.parse(input);
  const [actor, term, source, students, batch] = await Promise.all([
    tx.user.findUnique({ where: { id: actorId } }),
    tx.academicTerm.findUnique({ where: { id: data.termId } }),
    tx.course.findUnique({
      where: { id: data.sourceCourseId },
      include: { audiences: true, examiner: true },
    }),
    tx.user.findMany({ where: { id: { in: data.studentIds } } }),
    tx.mockHistoryBatch.findUnique({ where: { batchKey: data.batchKey } }),
  ]);
  if (!actor?.isActive || actor.role !== "ADMIN" || actor.mustChangePassword)
    throw new ForbiddenError(
      "An active registrar with a completed password setup is required",
    );
  if (
    !term ||
    !source ||
    source.isPractice ||
    source.academicYear !== term.academicYear ||
    source.semester !== term.semester
  )
    throw new ValidationError(
      "Choose a normal source offering in the selected term",
    );
  if (!source.examiner.isActive || source.examiner.dataOrigin !== "SYNTHETIC")
    throw new ValidationError(
      "Mock history requires a synthetic project lecturer",
    );
  const allowed = source.audiences.map((a) => a.groupKey);
  if (
    students.length !== data.studentIds.length ||
    new Set(data.studentIds).size !== data.studentIds.length ||
    students.some(
      (u) =>
        !u.isActive ||
        u.role !== "STUDENT" ||
        u.dataOrigin !== "SYNTHETIC" ||
        u.studyAcademicYear !== term.academicYear ||
        u.studySemester !== term.semester ||
        (allowed.length
          ? !allowed.includes(u.studyGroupKey)
          : u.programmeCode !== source.programmeCode || u.year !== source.year),
    )
  )
    throw new ValidationError(
      "Every learner must be a distinct synthetic student in this offering's programme/year/term audience",
    );
  if (
    data.from > data.to ||
    data.from < dateValue(term.startsOn) ||
    data.to > dateValue(term.endsOn) ||
    data.to >= kampalaDay(now)
  )
    throw new ValidationError(
      "Choose elapsed Kampala dates within the reviewed term; today and future dates are excluded",
    );
  const excluded = new Set(term.excludedDates.map((d) => d.date));
  const keys = new Set();
  const sessions = [...data.sessions].sort(
    (a, b) => Date.parse(a.startTime) - Date.parse(b.startTime),
  );
  for (const [i, s] of sessions.entries()) {
    const start = new Date(s.startTime),
      end = new Date(s.endTime),
      day = kampalaDay(start);
    if (
      keys.has(s.key) ||
      start >= end ||
      end > now ||
      day < data.from ||
      day > data.to ||
      kampalaDay(new Date(end.getTime() - 1)) !== day ||
      excluded.has(day) ||
      (i && new Date(sessions[i - 1].endTime) > start)
    )
      throw new ValidationError(
        "Duplicate, excluded, overlapping or out-of-period historical class",
      );
    keys.add(s.key);
  }
  const offeringKey = "H-" + source.id.toUpperCase();
  const existing = await tx.course.findUnique({
    where: {
      code_academicYear_semester_offeringKey: {
        code: source.code,
        academicYear: source.academicYear,
        semester: source.semester,
        offeringKey,
      },
    },
  });
  if (existing && !batch)
    throw new ConflictError(
      "History offering already exists; never overwrite or extend a previous batch implicitly",
    );
  if (batch && batch.manifestHash !== digest(data))
    throw new ConflictError(
      "Batch key already belongs to a different manifest",
    );
  const counts = { PRESENT: 0, LATE: 0, EXCUSED: 0, ABSENT: 0 };
  for (const s of sessions.filter((s) => s.status === "COMPLETED"))
    for (const u of students) counts[mockStatus(u.id, s.key)]++;
  const fingerprint = digest({
    manifest: data,
    term,
    source,
    students: students
      .map(({ id, updatedAt }) => ({ id, updatedAt }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    existing,
    batch,
  });
  return {
    data,
    source,
    students,
    offeringKey,
    fingerprint,
    summary: {
      batchKey: data.batchKey,
      sourceCourseId: source.id,
      programme: source.programmeCode,
      year: source.year,
      academicYear: source.academicYear,
      semester: source.semester,
      from: data.from,
      to: data.to,
      students: students.length,
      sessions: sessions.length,
      completed: sessions.filter((s) => s.status === "COMPLETED").length,
      cancelled: sessions.filter((s) => s.status === "CANCELLED").length,
      marks: counts,
      alreadyApplied: !!batch,
    },
  };
}
export async function applyMockHistory(
  db,
  input,
  actorId,
  expectedFingerprint,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(20261118)`;
      const plan = await previewMockHistory(tx, input, actorId);
      if (plan.summary.alreadyApplied) return plan.summary;
      if (plan.fingerprint !== expectedFingerprint)
        throw new ConflictError("History preview changed; preview again");
      const { source: c, data, students, offeringKey } = plan;
      const course = await tx.course.create({
        data: {
          code: c.code,
          title: c.title + " (practice history)",
          offeringKey,
          isPractice: true,
          program: c.program,
          programmeCode: c.programmeCode,
          year: c.year,
          semester: c.semester,
          academicYear: c.academicYear,
          examinerId: c.examinerId,
          attendanceThreshold: c.attendanceThreshold,
          countLate: c.countLate,
          countExcused: c.countExcused,
          audiences: {
            create: c.audiences.map((a) => ({ groupKey: a.groupKey })),
          },
        },
      });
      const until = new Date(data.to + "T00:00:00Z");
      until.setUTCDate(until.getUTCDate() + 1);
      await tx.enrollment.createMany({
        data: students.map((u) => ({
          studentId: u.id,
          courseId: course.id,
          origin: "MOCK_HISTORY",
          effectiveFrom: new Date(data.from + "T00:00:00Z"),
          effectiveUntil: until,
        })),
      });
      for (const s of data.sessions) {
        const session = await tx.session.create({
          data: {
            naturalKey: "mock:" + digest(data.batchKey + ":" + s.key),
            courseId: course.id,
            startTime: new Date(s.startTime),
            endTime: new Date(s.endTime),
            room: s.room,
            sessionType: s.sessionType,
            status: s.status,
          },
        });
        if (s.status !== "COMPLETED") continue;
        for (const student of students) {
          const status = mockStatus(student.id, s.key);
          await tx.attendance.create({
            data: {
              studentId: student.id,
              sessionId: session.id,
              status,
              method: "MANUAL",
              changes: {
                create: {
                  actorId,
                  status,
                  reason:
                    "Synthetic history import " +
                    data.batchKey +
                    "; not evidence of real attendance",
                },
              },
            },
          });
        }
      }
      const batch = await tx.mockHistoryBatch.create({
        data: {
          batchKey: data.batchKey,
          manifestHash: digest(data),
          actorId,
          summary: {
            ...plan.summary,
            courseId: course.id,
            sourceNote: data.sourceNote,
          },
        },
      });
      await audit(
        tx,
        actorId,
        "MOCK_HISTORY_IMPORTED",
        "MockHistoryBatch",
        batch.id,
        null,
        {
          ...plan.summary,
          courseId: course.id,
          manifestHash: batch.manifestHash,
        },
        data.sourceNote,
      );
      return { ...plan.summary, courseId: course.id };
    },
    { timeout: 90000, maxWait: 10000 },
  );
}
