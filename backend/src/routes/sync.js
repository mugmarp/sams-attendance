import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { requireExaminerOrAdmin, requireStudent } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ForbiddenError, NotFoundError } from "../utils/errors.js";
import { prepareRegister, synchronize } from "../services/sync.js";
const router = Router();
const id = z.string().cuid();
const reason = z.string().trim().min(5).max(500);
const base = {
  operationId: z.uuid().toLowerCase(),
  sessionId: id,
  observedAt: z.iso.datetime({ offset: true }),
  reason,
};
const mark = {
  ...base,
  preparationId: id,
  studentId: id,
  baseSessionVersion: z.number().int().min(1),
  baseAttendanceVersion: z.number().int().min(0),
  status: z.enum(["PRESENT", "LATE", "ABSENT", "EXCUSED"]),
};
const operation = z.discriminatedUnion("type", [
  z.object({ ...mark, type: z.literal("MARK") }).strict(),
  z
    .object({
      ...mark,
      type: z.literal("REVIEW_MARK"),
      reviewOf: z.uuid().toLowerCase(),
    })
    .strict(),
  z.object({ ...base, type: z.literal("STUDENT_CLAIM") }).strict(),
  z
    .object({
      ...base,
      type: z.literal("CLAIM_DECISION"),
      claimId: id,
      studentId: id,
      baseClaimVersion: z.number().int().min(1),
      baseSessionVersion: z.number().int().min(1),
      baseAttendanceVersion: z.number().int().min(0),
      decision: z.enum(["APPROVE", "REJECT"]),
      status: z.enum(["PRESENT", "LATE", "EXCUSED"]),
    })
    .strict(),
]);
router.post(
  "/sync/preparations",
  requireExaminerOrAdmin,
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        sessionId: id,
        purpose: z.enum(["MARK", "REVIEW"]).default("MARK"),
      })
      .strict()
      .parse(req.body);
    res
      .status(201)
      .json(await prepareRegister(req.user, input.sessionId, input.purpose));
  }),
);
router.post(
  "/sync/operations",
  asyncHandler(async (req, res) => {
    const input = z
      .object({ actorId: id, operations: z.array(operation).min(1).max(20) })
      .strict()
      .parse(req.body);
    if (input.actorId !== req.user.userId)
      throw new ForbiddenError("These operations belong to another account");
    res.json({ results: await synchronize(req.user, input.operations) });
  }),
);
router.get(
  "/student/attendance-claims",
  requireStudent,
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.attendanceClaim.findMany({
        where: { studentId: req.user.userId },
        select: {
          id: true,
          sessionId: true,
          reason: true,
          status: true,
          createdAt: true,
          decisionReason: true,
          decidedAt: true,
          session: {
            select: {
              course: { select: { code: true, title: true } },
              startTime: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    );
  }),
);
router.get(
  "/examiner/sessions/:id/claims",
  requireExaminerOrAdmin,
  asyncHandler(async (req, res) => {
    const session = await prisma.session.findUnique({
      where: { id: id.parse(req.params.id) },
      include: { course: true },
    });
    if (!session) throw new NotFoundError("Class not found");
    if (
      req.user.role !== "ADMIN" &&
      session.course.examinerId !== req.user.userId
    )
      throw new ForbiddenError();
    res.json(
      await prisma.attendanceClaim.findMany({
        where: { sessionId: session.id },
        include: { student: { select: { id: true, name: true, regNo: true } } },
        orderBy: { createdAt: "asc" },
      }),
    );
  }),
);
export default router;
