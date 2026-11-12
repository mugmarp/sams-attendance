import catalogueRoutes from "./catalogue.js";
import {
  filters,
  courseWhere,
  studentWhere,
} from "../services/academic-filters.js";
import academicRoutes from "./academic.js";
import { enrollmentCovers, enrollmentWhere } from "../services/academic.js";
import syncRoutes from "./sync.js";
import setupRoutes from "./setup.js";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/db.js";
import {
  authenticate,
  requireStudent,
  requireAdmin,
  requireExaminerOrAdmin,
} from "../middleware/auth.js";
import { authRateLimit, checkinRateLimit } from "../middleware/rateLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { login, refresh, me } from "../controllers/auth.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import {
  manageSession,
  submitCheckin,
  correctAttendance,
  sessionDTO,
} from "../services/attendance.js";
import {
  getCourseEligibility,
  getStudentAttendanceSummary,
} from "../services/eligibility.js";
import { generateEligibilityPDF } from "../services/pdf.js";
import { kampalaDay } from "../services/rules.js";
const router = Router();
const validate = (schema) => (req, _res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    next(error);
  }
};
const identity = z.string().cuid();
router.param("id", (req, _res, next, value) => {
  const parsed = identity.safeParse(value);
  next(parsed.success ? undefined : new ValidationError("Invalid session ID"));
});
router.param("courseId", (req, _res, next, value) => {
  const parsed = identity.safeParse(value);
  next(parsed.success ? undefined : new ValidationError("Invalid course ID"));
});
router.get(
  "/health",
  asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      now: new Date().toISOString(),
      timeZone: "Africa/Kampala",
    });
  }),
);
router.post(
  "/auth/login",
  authRateLimit,
  validate(
    z
      .object({
        email: z.string().email().max(254).optional(),
        identifier: z.string().trim().min(3).max(254).optional(),
        password: z.string().min(1).max(200),
      })
      .refine((v) => !!(v.email || v.identifier), {
        message: "Email or registration number is required",
      }),
  ),
  login,
);
router.post(
  "/auth/refresh",
  authRateLimit,
  validate(z.object({ refreshToken: z.string().min(1).max(4096) })),
  refresh,
);
router.get("/auth/me", authenticate, me);
router.use(authenticate);
router.use(syncRoutes);
router.use(academicRoutes);
router.use(catalogueRoutes);
router.get(
  "/student/sessions/upcoming",
  requireStudent,
  asyncHandler(async (req, res) => {
    const now = new Date();
    const sessions = await prisma.session.findMany({
      where: {
        course: { enrollments: { some: { studentId: req.user.userId } } },
        endTime: { gt: now },
        startTime: { lt: new Date(now.getTime() + 14 * 86400000) },
        status: "SCHEDULED",
      },
      include: {
        course: {
          include: { enrollments: { where: { studentId: req.user.userId } } },
        },
        attendances: { where: { studentId: req.user.userId } },
      },
      orderBy: { startTime: "asc" },
    });
    res.json(
      sessions
        .filter((s) => enrollmentCovers(s.course.enrollments[0], s.startTime))
        .map((s) => ({
          ...sessionDTO(s),
          checkedIn: s.attendances.some((a) =>
            ["PRESENT", "LATE"].includes(a.status),
          ),
        })),
    );
  }),
);
router.post(
  "/student/checkin",
  requireStudent,
  checkinRateLimit,
  validate(
    z.object({
      sessionId: identity,
      originatingUserId: identity.optional(),
      code: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-HJ-NP-Z2-9]{6}$/),
    }),
  ),
  asyncHandler(async (req, res) => {
    if (
      req.body.originatingUserId &&
      req.body.originatingUserId !== req.user.userId
    )
      throw new ForbiddenError(
        "This attempt belongs to a different signed-in account",
      );
    res.json(
      await submitCheckin(req.user.userId, req.body.sessionId, req.body.code),
    );
  }),
);
router.get(
  "/student/attendance/summary",
  requireStudent,
  asyncHandler(async (req, res) => {
    res.json(await getStudentAttendanceSummary(req.user.userId));
  }),
);
router.get(
  "/examiner/sessions/today",
  requireExaminerOrAdmin,
  asyncHandler(async (req, res) => {
    const day = req.query.date
      ? z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .parse(req.query.date)
      : kampalaDay();
    const start = new Date(`${day}T00:00:00+03:00`);
    if (Number.isNaN(start.getTime()) || kampalaDay(start) !== day)
      throw new ValidationError("Invalid date");
    const sessions = await prisma.session.findMany({
      where: {
        ...(req.user.role === "ADMIN"
          ? {}
          : { course: { examinerId: req.user.userId } }),
        startTime: { gte: start, lt: new Date(start.getTime() + 86400000) },
      },
      include: { course: true },
      orderBy: { startTime: "asc" },
    });
    res.json(sessions.map((s) => sessionDTO(s, true)));
  }),
);
async function owned(req) {
  const session = await prisma.session.findUnique({
    where: { id: req.params.id },
    include: { course: true },
  });
  if (!session) throw new NotFoundError("Session not found");
  if (
    req.user.role !== "ADMIN" &&
    session.course.examinerId !== req.user.userId
  )
    throw new ForbiddenError();
  return session;
}
router.get(
  "/examiner/sessions/:id",
  requireExaminerOrAdmin,
  asyncHandler(async (req, res) => {
    res.json(sessionDTO(await owned(req), true));
  }),
);
router.get(
  "/examiner/sessions/:id/attendance",
  requireExaminerOrAdmin,
  asyncHandler(async (req, res) => {
    const session = await owned(req);
    const rows = await prisma.enrollment.findMany({
      where: {
        courseId: session.courseId,
        ...enrollmentWhere(session.startTime),
      },
      include: {
        student: { select: { id: true, name: true, regNo: true } },
      },
      orderBy: { student: { regNo: "asc" } },
    });
    const records = await prisma.attendance.findMany({
      where: { sessionId: session.id },
      include: {
        changes: {
          include: { actor: { select: { name: true } } },
          orderBy: { recordedAt: "asc" },
        },
      },
    });
    res.json(
      rows.map((r) => ({
        student: r.student,
        attendance: records.find((a) => a.studentId === r.studentId) ?? null,
      })),
    );
  }),
);
for (const [endpoint, action] of [
  ["start-checkin", "start"],
  ["stop-checkin", "stop"],
  ["complete", "COMPLETED"],
  ["cancel", "CANCELLED"],
]) {
  router.post(
    `/examiner/sessions/:id/${endpoint}`,
    requireExaminerOrAdmin,
    asyncHandler(async (req, res) => {
      res.json(await manageSession(req.user, req.params.id, action));
    }),
  );
}
router.post(
  "/examiner/sessions/:id/attendance",
  requireExaminerOrAdmin,
  validate(
    z.object({
      studentId: identity,
      status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
      reason: z.string().trim().min(5).max(500),
    }),
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await correctAttendance(
        req.user,
        req.params.id,
        req.body.studentId,
        req.body.status,
        req.body.reason,
      ),
    );
  }),
);
router.get(
  "/admin/courses",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const f = filters(req.query);
    res.json(
      await prisma.course.findMany({
        where: courseWhere(f),
        take: f.limit,
        skip: f.offset,
        include: {
          programme: { include: { faculty: true } },
          audiences: { include: { group: true } },
          examiner: { select: { name: true } },
          _count: { select: { enrollments: true, sessions: true } },
        },
        orderBy: { code: "asc" },
      }),
    );
  }),
);
router.get(
  "/admin/students",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const f = filters(req.query);
    res.json(
      await prisma.user.findMany({
        where: studentWhere(f),
        take: f.limit,
        skip: f.offset,
        select: {
          id: true,
          regNo: true,
          name: true,
          program: true,
          year: true,
          programmeCode: true,
          studyGroupKey: true,
          studyAcademicYear: true,
          studySemester: true,
          admissionYear: true,
          email: true,
          dataOrigin: true,
          programme: { include: { faculty: true } },
        },
        orderBy: { regNo: "asc" },
      }),
    );
  }),
);
router.get(
  "/admin/eligibility/:courseId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await getCourseEligibility(req.params.courseId));
  }),
);
router.get(
  "/admin/eligibility/:courseId/pdf",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const pdf = await generateEligibilityPDF(req.params.courseId);
    res
      .type("pdf")
      .attachment(`attendance-${req.params.courseId}.pdf`)
      .send(pdf);
  }),
);
router.use(setupRoutes);
export default router;
