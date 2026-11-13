import { courseCandidates } from "../services/course-source.js";
import { kampalaDay } from "../services/rules.js";
import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../config/db.js";
import { requireStudent, requireAdmin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { audit, digest, dateValue } from "../services/academic.js";
import { latestPublication, inspectRow } from "../services/timetable-source.js";
import { selectableGroup } from "../services/catalogue.js";
import {
  currentTerm,
  resolvePlacement,
  validPlanCourse,
  planInclude,
  setupStudent,
  ensureStudentCourses,
} from "../services/course-setup.js";
import {
  ValidationError,
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from "../utils/errors.js";
const router = Router(),
  id = z.string().cuid(),
  reason = z.string().trim().min(5).max(500);
const scope = z
  .object({ termId: id, groupKey: z.string().min(1).max(120) })
  .strict();
const planInput = scope.extend({
  items: z
    .array(z.object({ courseId: id, compulsory: z.boolean() }).strict())
    .min(1)
    .max(80),
  expectedVersion: z.number().int().min(0),
  reviewNote: z.string().trim().max(1000).default(""),
  reason,
});
async function reauthenticate(actor, password) {
  const u = await prisma.user.findUnique({ where: { id: actor.userId } });
  if (
    !u?.isActive ||
    u.authVersion !== actor.authVersion ||
    !(await bcrypt.compare(password, u.passwordHash))
  )
    throw new UnauthorizedError(
      "Current password is incorrect or this sign-in has ended",
    );
}
async function context(tx, input) {
  const [term, group] = await Promise.all([
    tx.academicTerm.findUnique({ where: { id: input.termId } }),
    tx.programmeGroup.findUnique({ where: { key: input.groupKey } }),
  ]);
  if (!term || !group || !selectableGroup(group))
    throw new ValidationError(
      "Choose a reviewed term and specific programme group",
    );
  return { term, group };
}
async function inspectPlan(tx, input) {
  const { term, group } = await context(tx, input);
  if (new Set(input.items.map((i) => i.courseId)).size !== input.items.length)
    throw new ValidationError("Choose distinct courses");
  const courses = await tx.course.findMany({
    where: { id: { in: input.items.map((i) => i.courseId) } },
    include: {
      audiences: true,
      examiner: { select: { isActive: true, role: true } },
    },
  });
  if (
    courses.length !== input.items.length ||
    courses.some((c) => !validPlanCourse(c, group, term))
  )
    throw new ValidationError(
      "Every course must match the group and term, have an active lecturer and be outside practice offerings",
    );
  const old = await tx.coursePlan.findUnique({
    where: { termId_groupKey: { termId: term.id, groupKey: group.key } },
  });
  if ((old?.version || 0) !== input.expectedVersion)
    throw new ConflictError(
      "The plan changed. Load the current version before publishing",
    );
  const details = {
    termId: term.id,
    groupKey: group.key,
    academicYear: term.academicYear,
    semester: term.semester,
    termVersion: term.version,
    expectedVersion: input.expectedVersion,
    reviewNote: input.reviewNote,
    items: input.items.map((i) => ({
      courseId: i.courseId,
      compulsory: i.compulsory,
      course: courses.find((c) => c.id === i.courseId),
    })),
  };
  return { term, group, old, details, previewHash: digest(details) };
}
router.post(
  "/student/course-setup",
  requireStudent,
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        confirm: z.boolean().default(false),
        electives: z.array(id).max(80).default([]),
        planId: id.optional(),
        version: z.number().int().positive().optional(),
      })
      .strict()
      .parse(req.body);
    if (input.confirm && (!input.planId || !input.version))
      throw new ValidationError("Reload your course list before confirming");
    res.json(
      await ensureStudentCourses(req.user.userId, {
        confirm: input.confirm,
        electives: input.electives,
        expectedPlanId: input.planId,
        expectedVersion: input.version,
      }),
    );
  }),
);
router.get(
  "/admin/course-plans/options",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = scope.partial().parse(req.query);
    const terms = await prisma.academicTerm.findMany({
      orderBy: { startsOn: "desc" },
      take: 30,
    });
    const lecturers = await prisma.user.findMany({
      where: { role: "EXAMINER", isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 200,
    });
    if (!input.termId || !input.groupKey)
      return res.json({ terms, lecturers, courses: [], plan: null });
    const { term, group } = await context(prisma, input);
    const courses = (
      await prisma.course.findMany({
        where: {
          academicYear: term.academicYear,
          semester: term.semester,
          isPractice: false,
          OR: [
            { audiences: { some: { groupKey: group.key } } },
            {
              programmeCode: group.programmeCode,
              year: group.studyYear,
              audiences: { none: {} },
            },
          ],
        },
        include: {
          audiences: true,
          examiner: { select: { isActive: true, role: true } },
        },
        orderBy: { code: "asc" },
        take: 201,
      })
    ).filter((c) => validPlanCourse(c, group, term));
    if (courses.length > 200)
      throw new ValidationError(
        "This group has too many offerings; review duplicate course setup",
      );
    const plan = await prisma.coursePlan.findUnique({
      where: { termId_groupKey: { termId: term.id, groupKey: group.key } },
      include: { items: true },
    });
    res.json({
      terms,
      lecturers,
      courses: courses.map(({ examiner, audiences, ...c }) => c),
      plan,
    });
  }),
);
router.post(
  "/admin/course-plans/preview",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = planInput.strict().parse(req.body);
    const result = await inspectPlan(prisma, input);
    res.json({ previewHash: result.previewHash, ...result.details });
  }),
);
router.post(
  "/admin/course-plans/publish",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { currentPassword, previewHash, ...input } = planInput
      .extend({
        currentPassword: z.string().min(1).max(200),
        previewHash: z.string().length(64),
      })
      .strict()
      .parse(req.body);
    await reauthenticate(req.user, currentPassword);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AcademicTerm" WHERE id=${input.termId} FOR UPDATE`;
      const { old, details, previewHash: hash } = await inspectPlan(tx, input);
      if (hash !== previewHash)
        throw new ConflictError(
          "Preview is stale. Review the course list again",
        );
      const plan = old
        ? await tx.coursePlan.update({
            where: { id: old.id },
            data: {
              version: { increment: 1 },
              published: true,
              publishedAt: new Date(),
              reviewNote: input.reviewNote,
            },
          })
        : await tx.coursePlan.create({
            data: {
              termId: input.termId,
              groupKey: input.groupKey,
              reviewNote: input.reviewNote,
            },
          });
      await tx.coursePlanItem.deleteMany({ where: { planId: plan.id } });
      await tx.coursePlanItem.createMany({
        data: input.items.map((i) => ({ ...i, planId: plan.id })),
      });
      await audit(
        tx,
        req.user.userId,
        "COURSE_PLAN_PUBLISHED",
        "CoursePlan",
        plan.id,
        old ? { version: old.version } : null,
        { ...details, version: plan.version },
        input.reason,
      );
      return plan;
    });
    res.status(201).json(result);
  }),
);
// Published plans supply the scope; no arbitrary student/course list is accepted.
async function batchPreview(tx, planId) {
  const plan = await tx.coursePlan.findUnique({
    where: { id: planId },
    include: planInclude,
  });
  if (!plan?.published)
    throw new NotFoundError("Published course plan not found");
  const term = await currentTerm(tx);
  if (term?.id !== plan.termId)
    throw new ValidationError("Batch setup requires the single current term");
  if (plan.items.some((i) => !validPlanCourse(i.course, plan.group, term)))
    throw new ValidationError(
      "Review the course plan before assigning students",
    );
  const users = await tx.user.findMany({
    where: {
      role: "STUDENT",
      isActive: true,
      OR: [
        { programmeCode: plan.group.programmeCode },
        { regNo: { contains: "/" + plan.group.programmeCode + "/" } },
      ],
    },
    include: { enrollments: { orderBy: { courseId: "asc" } } },
    orderBy: { id: "asc" },
    take: 501,
  });
  if (users.length > 500)
    throw new ValidationError(
      "Use student sign-in setup for this cohort; batch preview is limited to 500 programme students",
    );
  const matched = users.filter(
    (u) => resolvePlacement(u, term).groupKey === plan.groupKey,
  );
  const rows = matched.map((u) => ({
    id: u.id,
    name: u.name,
    regNo: u.regNo,
    groupKey: plan.groupKey,
    newCourses: plan.items.filter(
      (i) =>
        i.compulsory && !u.enrollments.some((e) => e.courseId === i.courseId),
    ).length,
  }));
  const fingerprint = matched.map((u) => ({
    id: u.id,
    regNo: u.regNo,
    programmeCode: u.programmeCode,
    year: u.year,
    group: u.studyGroupKey,
    academicYear: u.studyAcademicYear,
    semester: u.studySemester,
    enrollments: u.enrollments,
  }));
  return {
    plan,
    rows,
    previewHash: digest({ plan, students: fingerprint }),
    reviewRequired: users.filter(
      (u) => resolvePlacement(u, term).status !== "RESOLVED",
    ).length,
  };
}
router.post(
  "/admin/course-plans/batch-preview",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { planId } = z.object({ planId: id }).strict().parse(req.body);
    const r = await batchPreview(prisma, planId);
    res.json({
      planId,
      rows: r.rows,
      reviewRequired: r.reviewRequired,
      previewHash: r.previewHash,
      effectiveFrom: kampalaDay(new Date()),
      notice:
        "New links start on the Kampala setup date. Existing enrollment and withdrawal decisions are preserved.",
    });
  }),
);
router.post(
  "/admin/course-plans/batch-apply",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        planId: id,
        previewHash: z.string().length(64),
        currentPassword: z.string().min(1).max(200),
        reason,
      })
      .strict()
      .parse(req.body);
    await reauthenticate(req.user, input.currentPassword);
    const result = await prisma.$transaction(
      async (tx) => {
        const before = await batchPreview(tx, input.planId);
        // Serialize with first-login setup before rechecking the preview snapshot.
        for (const row of before.rows)
          await tx.$queryRaw`SELECT id FROM "User" WHERE id=${row.id} FOR UPDATE`;
        const checked = await batchPreview(tx, input.planId);
        if (checked.previewHash !== input.previewHash)
          throw new ConflictError(
            "Student records or plan changed. Preview the batch again",
          );
        let inserted = 0;
        for (const row of checked.rows) {
          const result = await setupStudent(tx, row.id, {
            actorId: req.user.userId,
            reason: input.reason,
            expectedPlanId: checked.plan.id,
            expectedVersion: checked.plan.version,
          });
          if (result.status !== "READY")
            throw new ConflictError("Academic setup changed; preview again");
          inserted += result.inserted;
        }
        return { students: checked.rows.length, inserted };
      },
      { timeout: 60000 },
    );
    res.json(result);
  }),
);

const sourceScope = scope.extend({
  items: z
    .array(
      z.object({ code: z.string().min(2).max(20), examinerId: id }).strict(),
    )
    .min(1)
    .max(80),
  reason,
});
async function sourceInspection(tx, input) {
  const { term, group } = await context(tx, input),
    source = await latestPublication();
  if (
    source.metadata.academic_year !== term.academicYear ||
    !String(source.metadata.semester).endsWith(String(term.semester))
  )
    throw new ValidationError(
      "Source academic year and semester do not match the selected term",
    );
  const candidates = courseCandidates(source.rows, group.key);
  return { term, group, source, candidates };
}
router.post(
  "/admin/course-plans/source",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = scope.parse(req.body);
    const r = await sourceInspection(prisma, input);
    res.json({
      publicationId: r.source.id,
      candidates: r.candidates,
      notice:
        "Review course labels and lecturer assignments. Creating offerings does not publish a course plan or create dated classes.",
    });
  }),
);
async function inspectImport(tx, input) {
  const r = await sourceInspection(tx, input);
  if (new Set(input.items.map((i) => i.code)).size !== input.items.length)
    throw new ValidationError("Choose distinct course codes");
  const changes = [];
  for (const item of input.items) {
    const candidate = r.candidates.find((c) => c.code === item.code);
    if (
      !candidate ||
      candidate.blocked ||
      !candidate.title ||
      candidate.title.length > 180
    )
      throw new ValidationError(
        "Choose valid academic course labels from this group",
      );
    const lecturer = await tx.user.findUnique({
      where: { id: item.examinerId },
      select: { id: true, name: true, role: true, isActive: true },
    });
    if (!lecturer?.isActive || lecturer.role !== "EXAMINER")
      throw new ValidationError(
        "Assign an active lecturer account to every course",
      );
    const existing = await tx.course.findUnique({
      where: {
        code_academicYear_semester_offeringKey: {
          offeringKey: r.group.programmeCode,
          code: item.code,
          academicYear: r.term.academicYear,
          semester: r.term.semester,
        },
      },
      include: { audiences: true },
    });
    if (
      existing &&
      (existing.isPractice ||
        existing.code.endsWith("-P") ||
        existing.examinerId !== lecturer.id ||
        existing.title !== candidate.title)
    )
      throw new ConflictError(
        "An existing offering has different teaching details. Review it rather than overwriting it: " +
          item.code,
      );
    if (
      existing &&
      !existing.audiences.length &&
      (existing.programmeCode !== r.group.programmeCode ||
        existing.year !== r.group.studyYear)
    )
      throw new ConflictError(
        "Existing offering needs explicit audience review before sharing: " +
          item.code,
      );
    changes.push({
      code: item.code,
      title: candidate.title,
      examinerId: lecturer.id,
      lecturer: lecturer.name,
      existingId: existing?.id || null,
      addAudience: !existing?.audiences.some((a) => a.groupKey === r.group.key),
      existingAudiences:
        existing?.audiences.map((a) => a.groupKey).sort() || [],
      issues: candidate.issues,
    });
  }
  return {
    ...r,
    changes,
    previewHash: digest({
      term: r.term,
      group: r.group,
      publicationId: r.source.id,
      changes,
    }),
  };
}
router.post(
  "/admin/course-plans/import-preview",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = sourceScope.strict().parse(req.body);
    const r = await inspectImport(prisma, input);
    res.json({ changes: r.changes, previewHash: r.previewHash });
  }),
);
router.post(
  "/admin/course-plans/import",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { currentPassword, previewHash, ...input } = sourceScope
      .extend({
        currentPassword: z.string().min(1).max(200),
        previewHash: z.string().length(64),
      })
      .strict()
      .parse(req.body);
    await reauthenticate(req.user, currentPassword);
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "AcademicTerm" WHERE id=${input.termId} FOR UPDATE`;
        const r = await inspectImport(tx, input);
        if (r.previewHash !== previewHash)
          throw new ConflictError("Source preview changed. Review it again");
        for (const change of r.changes) {
          const course = change.existingId
            ? { id: change.existingId }
            : await tx.course.create({
                data: {
                  code: change.code,
                  offeringKey: r.group.programmeCode,
                  title: change.title,
                  examinerId: change.examinerId,
                  academicYear: r.term.academicYear,
                  semester: r.term.semester,
                  program: r.group.programmeCode,
                  programmeCode: r.group.programmeCode,
                  year: r.group.studyYear,
                },
              });
          if (change.addAudience)
            await tx.courseAudience.create({
              data: { courseId: course.id, groupKey: r.group.key },
            });
          await audit(
            tx,
            req.user.userId,
            "COURSE_SOURCE_IMPORT",
            "Course",
            course.id,
            null,
            { ...change, groupKey: r.group.key, publicationId: r.source.id },
            input.reason,
          );
        }
        return { offerings: r.changes.length, groupKey: r.group.key };
      },
      { timeout: 30000 },
    );
    res.status(201).json(result);
  }),
);
export default router;
