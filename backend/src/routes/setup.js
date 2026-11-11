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
    const role = req.query.role
      ? z.enum(["STUDENT", "EXAMINER", "ADMIN"]).parse(req.query.role)
      : undefined;
    res.json(
      await prisma.user.findMany({
        where: role ? { role } : {},
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          regNo: true,
          program: true,
          year: true,
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
        email: z.string().trim().toLowerCase().email().max(254),
        name: z.string().trim().min(2).max(120),
        password: z.string().min(12).max(72),
        role: z.enum(["STUDENT", "EXAMINER", "ADMIN"]),
        regNo: z.string().trim().min(3).max(60).optional(),
        program: z.string().trim().min(1).max(30).optional(),
        year: z.number().int().min(1).max(10).optional(),
      })
      .refine((data) => data.role !== "STUDENT" || !!data.regNo, {
        message: "Students require a registration number",
        path: ["regNo"],
      }),
  ),
  asyncHandler(async (req, res) => {
    const { password, ...data } = req.body;
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
    }),
  ),
  asyncHandler(async (req, res) => {
    const examiner = await prisma.user.findUnique({
      where: { id: req.body.examinerId },
    });
    if (!examiner || examiner.role !== "EXAMINER")
      throw new ValidationError("Choose an existing examiner account");
    res.status(201).json(await prisma.course.create({ data: req.body }));
  }),
);
router.post(
  "/admin/courses/:courseId/enroll",
  requireAdmin,
  validate(z.object({ studentId: id })),
  asyncHandler(async (req, res) => {
    id.parse(req.params.courseId);
    const course = await prisma.course.findUnique({
      where: { id: req.params.courseId },
    });
    if (!course) throw new NotFoundError("Course not found");
    const student = await prisma.user.findUnique({
      where: { id: req.body.studentId },
    });
    if (!student || student.role !== "STUDENT")
      throw new ValidationError("Choose an existing student account");
    res
      .status(201)
      .json(
        await prisma.enrollment.create({
          data: { courseId: course.id, studentId: student.id },
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
    res
      .status(201)
      .json(
        await prisma.session.create({
          data: {
            ...req.body,
            startTime: new Date(req.body.startTime),
            endTime: new Date(req.body.endTime),
            courseId: course.id,
            naturalKey: req.body.naturalKey || "manual:" + randomUUID(),
          },
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
