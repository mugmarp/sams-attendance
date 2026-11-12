import { passwordSchema } from "../utils/passwordPolicy.js";
import {
  profileData,
  registration,
  programmes,
} from "../services/catalogue.js";
import { filters, studentWhere } from "../services/academic-filters.js";
import { civilDate, audit } from "../services/academic.js";
import { kampalaDay } from "../services/rules.js";
import { getCourseEligibility } from "../services/eligibility.js";
import { generateEligibilityPDF } from "../services/pdf.js";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { requireAdmin, requireExaminerOrAdmin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
const router = Router();
const id = z.string().cuid();
const validate = (schema) => (req, _res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    next(error);
  }
};
router.get(
  "/admin/users",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const f = filters(req.query);
    const role = req.query.role
      ? z.enum(["STUDENT", "EXAMINER", "ADMIN"]).parse(req.query.role)
      : undefined;
    res.json(
      await prisma.user.findMany({
        where:
          role === "STUDENT"
            ? studentWhere(f)
            : {
                ...(role ? { role } : {}),
                ...(f.search
                  ? { name: { contains: f.search, mode: "insensitive" } }
                  : {}),
              },
        take: f.limit,
        skip: f.offset,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          regNo: true,
          program: true,
          year: true,
          programmeCode: true,
          studyGroupKey: true,
          studyAcademicYear: true,
          studySemester: true,
        },
        orderBy: { name: "asc" },
      }),
    );
  }),
);
router.post(
  "/admin/users",
  requireAdmin,
  validate(
    z
      .object({
        email: z.string().trim().toLowerCase().email().max(254).optional(),
        name: z.string().trim().min(2).max(120),
        password: passwordSchema,
        role: z.enum(["STUDENT", "EXAMINER", "ADMIN"]),
        regNo: z.string().trim().min(3).max(60).optional(),
        program: z.string().trim().min(1).max(30).optional(),
        year: z.number().int().min(1).max(10).optional(),
        programmeCode: z.string().max(12).optional(),
        studyGroupKey: z.string().max(120).optional(),
        studyAcademicYear: z
          .string()
          .regex(/^\d{4}\/\d{4}$/)
          .optional(),
        studySemester: z.number().int().min(1).max(2).optional(),
      })
      .refine((data) => data.role !== "STUDENT" || !!data.regNo, {
        message: "Students require a registration number",
        path: ["regNo"],
      }),
  ),
  asyncHandler(async (req, res) => {
    const { password, ...data } = req.body;
    const reg = registration(data.regNo);
    if (!data.email && !(data.role === "STUDENT" && reg))
      throw new ValidationError(
        "An email or valid student registration number is required",
      );
    data.email = data.email || reg.emailSuggestion;
    if (data.role === "STUDENT") Object.assign(data, profileData(data));
    const user = await prisma.user.create({
      data: { ...data, passwordHash: await bcrypt.hash(password, 12) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        regNo: true,
        program: true,
        year: true,
      },
    });
    res.status(201).json(user);
  }),
);
router.post(
  "/admin/courses",
  requireAdmin,
  validate(
    z.object({
      code: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/),
      title: z.string().trim().min(3).max(180),
      program: z.string().trim().min(1).max(30),
      year: z.number().int().min(1).max(10),
      semester: z.number().int().min(1).max(2),
      academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
      examinerId: id,
      attendanceThreshold: z.number().int().min(1).max(100).default(80),
      audienceGroups: z.array(z.string().max(120)).max(20).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const examiner = await prisma.user.findUnique({
      where: { id: req.body.examinerId },
    });
    if (!examiner || examiner.role !== "EXAMINER")
      throw new ValidationError("Choose an existing examiner account");
    const { audienceGroups, ...data } = req.body;
    const code = data.program.toUpperCase();
    if (programmes.has(code)) data.programmeCode = code;
    const selected =
      audienceGroups ||
      ((await prisma.programmeGroup.findUnique({
        where: {
          key: code + " " + ["", "I", "II", "III", "IV", "V", "VI"][data.year],
        },
      }))
        ? [code + " " + ["", "I", "II", "III", "IV", "V", "VI"][data.year]]
        : []);
    if (audienceGroups && audienceGroups.length === 0)
      throw new ValidationError("Select at least one programme-group audience");
    if (
      new Set(selected).size !== selected.length ||
      (await prisma.programmeGroup.count({
        where: { key: { in: selected } },
      })) !== selected.length
    )
      throw new ValidationError("Choose existing distinct programme groups");
    res.status(201).json(
      await prisma.course.create({
        data: {
          ...data,
          audiences: { create: selected.map((groupKey) => ({ groupKey })) },
        },
      }),
    );
  }),
);
router.post(
  "/admin/courses/:courseId/enroll",
  requireAdmin,
  validate(
    z.object({
      studentId: id,
      effectiveFrom: civilDate.optional(),
      overrideReason: z.string().trim().min(5).max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    id.parse(req.params.courseId);
    const course = await prisma.course.findUnique({
      where: { id: req.params.courseId },
      include: { audiences: { include: { group: true } } },
    });
    if (!course) throw new NotFoundError("Course not found");
    const student = await prisma.user.findUnique({
      where: { id: req.body.studentId },
    });
    if (!student || student.role !== "STUDENT")
      throw new ValidationError("Choose an existing student account");
    if (
      student.programmeCode &&
      student.year &&
      course.audiences.length &&
      !course.audiences.some(
        (a) =>
          a.group.programmeCode === student.programmeCode &&
          a.group.studyYear === student.year &&
          (!a.group.track || a.groupKey === student.studyGroupKey),
      ) &&
      !req.body.overrideReason
    )
      throw new ValidationError(
        "Student placement is outside the course audiences. Record an explicit retake/cross-programme exception reason.",
      );
    res.status(201).json(
      await prisma.$transaction(async (tx) => {
        const saved = await tx.enrollment.create({
          data: {
            courseId: course.id,
            studentId: student.id,
            effectiveFrom: new Date(
              (req.body.effectiveFrom || kampalaDay()) + "T00:00:00Z",
            ),
          },
        });
        await audit(
          tx,
          req.user.userId,
          "ENROLLMENT_CREATED",
          "Enrollment",
          saved.id,
          undefined,
          saved,
          req.body.overrideReason,
        );
        return saved;
      }),
    );
  }),
);
router.get(
  "/examiner/courses",
  requireExaminerOrAdmin,
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.course.findMany({
        where: req.user.role === "ADMIN" ? {} : { examinerId: req.user.userId },
        orderBy: { code: "asc" },
      }),
    );
  }),
);
router.post(
  "/examiner/courses/:courseId/sessions",
  requireExaminerOrAdmin,
  validate(
    z
      .object({
        startTime: z.string().datetime({ offset: true }),
        endTime: z.string().datetime({ offset: true }),
        room: z.string().trim().min(1).max(120),
        sessionType: z
          .enum(["LECTURE", "TUTORIAL", "PRACTICAL", "LAB", "CLINICAL"])
          .default("LECTURE"),
        naturalKey: z.string().min(1).max(160).optional(),
      })
      .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
        message: "Class end must be after its start",
        path: ["endTime"],
      }),
  ),
  asyncHandler(async (req, res) => {
    id.parse(req.params.courseId);
    const course = await prisma.course.findUnique({
      where: { id: req.params.courseId },
    });
    if (!course) throw new NotFoundError("Course not found");
    if (req.user.role !== "ADMIN" && course.examinerId !== req.user.userId)
      throw new ForbiddenError("This course belongs to another examiner");
    res.status(201).json(
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${course.id} FOR UPDATE`;
        const saved = await tx.session.create({
          data: {
            ...req.body,
            startTime: new Date(req.body.startTime),
            endTime: new Date(req.body.endTime),
            courseId: course.id,
            naturalKey: req.body.naturalKey || "manual:" + randomUUID(),
          },
        });
        await audit(
          tx,
          req.user.userId,
          "SESSION_CREATED",
          "Session",
          saved.id,
          undefined,
          {
            courseId: saved.courseId,
            startTime: saved.startTime,
            endTime: saved.endTime,
          },
        );
        return saved;
      }),
    );
  }),
);
async function ownedCourse(req) {
  id.parse(req.params.courseId);
  const course = await prisma.course.findUnique({
    where: { id: req.params.courseId },
  });
  if (!course) throw new NotFoundError("Course not found");
  if (req.user.role !== "ADMIN" && course.examinerId !== req.user.userId)
    throw new ForbiddenError("This course belongs to another examiner");
  return course;
}
router.get(
  "/examiner/courses/:courseId/attendance-summary",
  requireExaminerOrAdmin,
  asyncHandler(async (req, res) => {
    await ownedCourse(req);
    res.json(await getCourseEligibility(req.params.courseId));
  }),
);
router.get(
  "/examiner/courses/:courseId/attendance-summary/pdf",
  requireExaminerOrAdmin,
  asyncHandler(async (req, res) => {
    const course = await ownedCourse(req);
    res
      .type("pdf")
      .attachment("attendance-" + course.code + ".pdf")
      .send(await generateEligibilityPDF(course.id));
  }),
);
export default router;
