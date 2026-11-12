import {
  deduplicateReference,
  confirmedInterval,
} from "../services/student-day.js";
import {
  parseGroup,
  matchesGroup,
  ROMAN,
  selectableGroup,
} from "../services/catalogue.js";
import { filters, courseWhere } from "../services/academic-filters.js";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { requireAdmin, requireExaminerOrAdmin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from "../utils/errors.js";
import {
  civilDate,
  dateValue,
  digest,
  json,
  audit,
  enrollmentCovers,
} from "../services/academic.js";
import { courseReport } from "../services/eligibility.js";
import { generateEligibilityPDF } from "../services/pdf.js";
import { sessionDTO } from "../services/attendance.js";
import {
  latestPublication,
  inspectRow,
  DAYS,
  refreshSource,
  calendarReference,
} from "../services/timetable-source.js";
import { previewTimetable, applyTimetable } from "../services/timetable.js";
const router = Router(),
  id = z.string().cuid(),
  reason = z.string().trim().min(5).max(500);
const dayDate = (value) => new Date(value + "T00:00:00Z");
async function owned(actor, courseId, tx = prisma) {
  const course = await tx.course.findUnique({ where: { id: courseId } });
  if (!course) throw new NotFoundError("Course not found");
  if (actor.role !== "ADMIN" && course.examinerId !== actor.userId)
    throw new ForbiddenError();
  return course;
}
router.get(
  "/timetable/calendar",
  asyncHandler(async (req, res) => {
    const [reference, terms] = await Promise.all([
      calendarReference(),
      prisma.academicTerm.findMany({
        orderBy: [{ academicYear: "desc" }, { semester: "asc" }],
      }),
    ]);
    res.json({
      reference,
      terms:
        req.user.role === "ADMIN"
          ? terms
          : terms.map(({ id, academicYear, semester, startsOn, endsOn }) => ({
              id,
              academicYear,
              semester,
              startsOn,
              endsOn,
            })),
    });
  }),
);
router.get(
  "/timetable/reference",
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        group: z.string().max(150).optional(),
        course: z.string().max(40).optional(),
        publicationId: id.optional(),
      })
      .parse(req.query);
    const publication = input.publicationId
      ? await prisma.timetablePublication.findUnique({
          where: { id: input.publicationId },
        })
      : await latestPublication();
    if (!publication) throw new NotFoundError("Source publication not found");
    const all = publication.rows,
      f = filters(req.query);
    let group = input.group;
    if (req.user.role === "STUDENT") {
      const student = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: {
          studyGroupKey: true,
          programmeCode: true,
          program: true,
          year: true,
        },
      });
      group =
        student.studyGroupKey ||
        ((student.programmeCode || student.program) && ROMAN[student.year]
          ? `${student.programmeCode || student.program} ${ROMAN[student.year]}`
          : null);
      if (!group || !parseGroup(group) || !selectableGroup(parseGroup(group)))
        return res.json({
          publication: {
            id: publication.id,
            source: publication.source,
            metadata: publication.metadata,
            checkedAt: publication.checkedAt,
          },
          groups: [],
          total: all.length,
          matched: 0,
          rows: [],
          days: DAYS,
          warnings: [
            "Ask the registrar to confirm your programme, year and track",
          ],
          needsAcademicProfile: true,
        });
    }
    const catalogueProgrammes = await prisma.programme.findMany({
      where: {
        ...(f.faculty ? { facultyCode: f.faculty } : {}),
        ...(f.programme ? { code: f.programme } : {}),
      },
      select: { code: true },
    });
    const codes = new Set(catalogueProgrammes.map((p) => p.code));
    const inScope = (raw) => {
      const p = parseGroup(raw);
      return (
        (!f.faculty && !f.programme && !f.year) ||
        (p && codes.has(p.programmeCode) && (!f.year || p.studyYear === f.year))
      );
    };
    const selected = all.filter(
      (row) =>
        (!group || matchesGroup(row, group)) &&
        [row.program_group, ...(row.shared_with || [])].some(inScope) &&
        (!input.course || row.course_code === input.course),
    );
    const displayRows =
      req.user.role === "STUDENT"
        ? deduplicateReference(selected, group)
        : selected;
    res.json({
      publication: {
        id: publication.id,
        source: publication.source,
        sourceRevision: publication.sourceRevision,
        contentHash: publication.contentHash,
        metadata: publication.metadata,
        checkedAt: publication.checkedAt,
        importedAt: publication.importedAt,
      },
      groups:
        req.user.role === "STUDENT"
          ? [group]
          : [
              ...new Set(
                all.flatMap((r) => [
                  r.program_group,
                  ...(Array.isArray(r.shared_with) ? r.shared_with : []),
                ]),
              ),
            ]
              .filter((g) =>
                req.user.role === "STUDENT" ? g === group : inScope(g),
              )
              .sort(),
      total: all.length,
      matched: displayRows.length,
      rawMatched: selected.length,
      rows: displayRows
        .slice(0, 200)
        .map((r) => ({
          ...r,
          ...inspectRow(r),
          operatorReviewed: confirmedInterval(r, group),
        })),
      days: DAYS,
      warnings: [
        "Weekly reference entries are not completed attendance classes",
        "Source metadata requires review; a recent retrieval does not establish a recent publication",
      ],
    });
  }),
);
router.get(
  "/timetable/sessions",
  asyncHandler(async (req, res) => {
    const input = z.object({ from: civilDate, to: civilDate }).parse(req.query);
    if (
      input.from > input.to ||
      Date.parse(input.to) - Date.parse(input.from) > 31 * 86400000
    )
      throw new ValidationError("Choose a date range of at most 31 days");
    const start = new Date(input.from + "T00:00:00+03:00"),
      end = new Date(Date.parse(input.to + "T00:00:00+03:00") + 86400000);
    const where = {
      startTime: { gte: start, lt: end },
      ...(req.user.role === "STUDENT"
        ? { course: { enrollments: { some: { studentId: req.user.userId } } } }
        : req.user.role === "ADMIN"
          ? {}
          : { course: { examinerId: req.user.userId } }),
    };
    const f = filters(req.query);
    where.course = { AND: [where.course || {}, courseWhere(f)] };
    const rows = await prisma.session.findMany({
      where,
      include: {
        course: {
          include: { enrollments: { where: { studentId: req.user.userId } } },
        },
      },
      orderBy: { startTime: "asc" },
      take: 500,
    });
    res.json(
      rows
        .filter(
          (s) =>
            req.user.role !== "STUDENT" ||
            enrollmentCovers(s.course.enrollments[0], s.startTime),
        )
        .map((s) => {
          const { enrollments, ...course } = s.course;
          return sessionDTO({ ...s, course });
        }),
    );
  }),
);
router.post(
  "/admin/timetable/refresh",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = z
      .object({ source: z.enum(["mylectures", "mylectures-2"]) })
      .strict()
      .parse(req.body);
    res.json(await refreshSource(input.source, req.user.userId));
  }),
);
router.get(
  "/admin/timetable/publications",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    await latestPublication();
    const publications = await prisma.timetablePublication.findMany({
      where: {
        source: { in: ["bundled-reference", "mylectures", "mylectures-2"] },
      },
      select: {
        id: true,
        source: true,
        sourceRevision: true,
        contentHash: true,
        metadata: true,
        importedAt: true,
        checkedAt: true,
      },
      orderBy: { checkedAt: "desc" },
      take: 20,
    });
    const checks = await prisma.auditEvent.findMany({
      where: { entityType: "TimetableSource" },
      orderBy: { recordedAt: "desc" },
      take: 10,
    });
    res.json({ publications, checks });
  }),
);
const termInput = z
  .object({
    academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
    semester: z.number().int().min(1).max(2),
    startsOn: civilDate,
    endsOn: civilDate,
    excludedDates: z.array(z.object({ date: civilDate, reason })).max(180),
    sourceUrl: z.url().startsWith("https://"),
    sourceNote: reason,
    reviewed: z.literal(true),
    baseVersion: z.number().int().min(1).optional(),
  })
  .strict();
router.post(
  "/admin/timetable/terms",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = termInput.parse(req.body);
    const [firstYear, lastYear] = input.academicYear.split("/").map(Number);
    if (
      lastYear !== firstYear + 1 ||
      Number(input.startsOn.slice(0, 4)) < firstYear ||
      Number(input.endsOn.slice(0, 4)) > lastYear
    )
      throw new ValidationError(
        "Term dates must fall within the two consecutive academic years",
      );
    if (
      input.endsOn < input.startsOn ||
      Date.parse(input.endsOn) - Date.parse(input.startsOn) > 400 * 86400000
    )
      throw new ValidationError(
        "Review a term interval no longer than 400 days",
      );
    if (
      new Set(input.excludedDates.map((e) => e.date)).size !==
        input.excludedDates.length ||
      input.excludedDates.some(
        (e) => e.date < input.startsOn || e.date > input.endsOn,
      )
    )
      throw new ValidationError(
        "Excluded dates must be unique and within the term",
      );
    const term = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AcademicTerm" WHERE "academicYear"=${input.academicYear} AND semester=${input.semester} FOR UPDATE`;
      const old = await tx.academicTerm.findUnique({
        where: {
          academicYear_semester: {
            academicYear: input.academicYear,
            semester: input.semester,
          },
        },
      });
      if (old && old.version !== input.baseVersion)
        throw new ConflictError(
          "Term already exists or changed; select its current version before editing",
        );
      const data = {
        academicYear: input.academicYear,
        semester: input.semester,
        startsOn: dayDate(input.startsOn),
        endsOn: dayDate(input.endsOn),
        excludedDates: input.excludedDates,
        sourceUrl: input.sourceUrl,
        sourceNote: input.sourceNote,
      };
      const saved = old
        ? await tx.academicTerm.update({
            where: { id: old.id },
            data: {
              ...data,
              version: { increment: 1 },
              reviewedAt: new Date(),
            },
          })
        : await tx.academicTerm.create({ data });
      await audit(
        tx,
        req.user.userId,
        "TERM_REVIEWED",
        "AcademicTerm",
        saved.id,
        old,
        saved,
        input.sourceNote,
      );
      return saved;
    });
    res.status(201).json(term);
  }),
);
router.get(
  "/admin/timetable/entries",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json(
      await prisma.timetableEntry.findMany({
        include: {
          course: { select: { code: true, title: true } },
          term: { select: { academicYear: true, semester: true } },
        },
        orderBy: { id: "asc" },
      }),
    );
  }),
);
const previewInput = z
  .object({
    publicationId: id,
    sourceKey: z.string().min(1).max(500),
    courseId: id,
    termId: id,
    entryId: id.optional(),
    weekday: z.number().int().min(1).max(7),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    room: z.string().trim().max(120).optional(),
    sessionType: z.enum([
      "LECTURE",
      "TUTORIAL",
      "PRACTICAL",
      "LAB",
      "CLINICAL",
    ]),
    from: civilDate,
    to: civilDate,
    reviewed: z.literal(true),
    reason,
  })
  .strict();
router.post(
  "/admin/timetable/preview",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await previewTimetable(req.user, previewInput.parse(req.body)));
  }),
);
router.post(
  "/admin/timetable/reviews/:reviewId/apply",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await applyTimetable(req.user, id.parse(req.params.reviewId)));
  }),
);
router.patch(
  "/admin/courses/:courseId/policy",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const courseId = id.parse(req.params.courseId),
      input = z
        .object({
          attendanceThreshold: z.number().int().min(1).max(100),
          countLate: z.boolean(),
          countExcused: z.boolean(),
          basePolicyVersion: z.number().int().min(1),
          reason,
        })
        .strict()
        .parse(req.body);
    res.json(
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${courseId} FOR UPDATE`;
        const before = await owned(req.user, courseId, tx);
        if (before.policyVersion !== input.basePolicyVersion)
          throw new ConflictError("Policy changed; reload before editing");
        const after = await tx.course.update({
          where: { id: courseId },
          data: {
            attendanceThreshold: input.attendanceThreshold,
            countLate: input.countLate,
            countExcused: input.countExcused,
            policyVersion: { increment: 1 },
          },
        });
        await audit(
          tx,
          req.user.userId,
          "POLICY_CHANGED",
          "Course",
          courseId,
          before,
          after,
          input.reason,
        );
        return after;
      }),
    );
  }),
);
router.patch(
  "/admin/enrollments/:enrollmentId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const enrollmentId = id.parse(req.params.enrollmentId),
      input = z
        .object({
          effectiveFrom: civilDate.nullable(),
          effectiveUntil: civilDate.nullable(),
          reason,
        })
        .strict()
        .parse(req.body);
    if (
      input.effectiveFrom &&
      input.effectiveUntil &&
      input.effectiveUntil <= input.effectiveFrom
    )
      throw new ValidationError(
        "Withdrawal must be after enrollment start; withdrawal date is excluded",
      );
    res.json(
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Enrollment" WHERE id=${enrollmentId} FOR UPDATE`;
        const before = await tx.enrollment.findUnique({
          where: { id: enrollmentId },
        });
        if (!before) throw new NotFoundError("Enrollment not found");
        const after = await tx.enrollment.update({
          where: { id: enrollmentId },
          data: {
            effectiveFrom: input.effectiveFrom
              ? dayDate(input.effectiveFrom)
              : null,
            effectiveUntil: input.effectiveUntil
              ? dayDate(input.effectiveUntil)
              : null,
          },
        });
        await audit(
          tx,
          req.user.userId,
          "ENROLLMENT_DATES_CHANGED",
          "Enrollment",
          enrollmentId,
          before,
          after,
          input.reason,
        );
        return after;
      }),
    );
  }),
);
router.post(
  "/reports/courses/:courseId/snapshots",
  requireExaminerOrAdmin,
  asyncHandler(async (req, res) => {
    const courseId = id.parse(req.params.courseId),
      input = z
        .object({
          reason,
          reviewedPendingWork: z.literal(true),
          basePolicyVersion: z.number().int().min(1),
        })
        .strict()
        .parse(req.body);
    const snapshot = await prisma.$transaction(
      async (tx) => {
        await owned(req.user, courseId, tx);
        const data = await courseReport(tx, courseId);
        if (data.course.policyVersion !== input.basePolicyVersion)
          throw new ConflictError("Policy changed; inspect the report again");
        const saved = await tx.reportSnapshot.create({
          data: {
            courseId,
            actorId: req.user.userId,
            data: json(data),
            contentHash: digest(data),
            reason: input.reason,
          },
        });
        await audit(
          tx,
          req.user.userId,
          "REPORT_SNAPSHOT_CREATED",
          "ReportSnapshot",
          saved.id,
          undefined,
          {
            courseId,
            contentHash: saved.contentHash,
            pendingClaims: data.pendingClaims,
          },
          input.reason,
        );
        return saved;
      },
      { isolationLevel: "RepeatableRead" },
    );
    res.status(201).json(snapshot);
  }),
);
router.get(
  "/reports/courses/:courseId/snapshots",
  requireExaminerOrAdmin,
  asyncHandler(async (req, res) => {
    const courseId = id.parse(req.params.courseId);
    await owned(req.user, courseId);
    res.json(
      await prisma.reportSnapshot.findMany({
        where: { courseId },
        select: { id: true, createdAt: true, contentHash: true, reason: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    );
  }),
);
router.get(
  "/reports/snapshots/:snapshotId/pdf",
  requireExaminerOrAdmin,
  asyncHandler(async (req, res) => {
    const snapshot = await prisma.reportSnapshot.findUnique({
      where: { id: id.parse(req.params.snapshotId) },
    });
    if (!snapshot) throw new NotFoundError("Snapshot not found");
    await owned(req.user, snapshot.courseId);
    res
      .type("pdf")
      .attachment(`attendance-snapshot-${snapshot.id}.pdf`)
      .send(
        await generateEligibilityPDF(snapshot.courseId, {
          ...snapshot.data,
          generatedAt: snapshot.createdAt,
          snapshotId: snapshot.id,
        }),
      );
  }),
);
router.get(
  "/reports/snapshots/:snapshotId",
  requireExaminerOrAdmin,
  asyncHandler(async (req, res) => {
    const snapshot = await prisma.reportSnapshot.findUnique({
      where: { id: id.parse(req.params.snapshotId) },
    });
    if (!snapshot) throw new NotFoundError("Snapshot not found");
    await owned(req.user, snapshot.courseId);
    res.json(snapshot);
  }),
);
router.get(
  "/admin/audit",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = z
      .object({ entityType: z.string().max(60), entityId: z.string().max(150) })
      .parse(req.query);
    res.json(
      await prisma.auditEvent.findMany({
        where: input,
        orderBy: { recordedAt: "desc" },
        take: 100,
      }),
    );
  }),
);
export default router;
