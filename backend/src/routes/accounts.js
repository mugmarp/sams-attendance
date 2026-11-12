import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { requireAdmin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../utils/errors.js";
import { filters, studentWhere } from "../services/academic-filters.js";
import { audit } from "../services/academic.js";

const router = Router();
const identity = z.string().cuid();
export const passwordSchema = z
  .string()
  .min(12)
  .max(72)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Use a password of at most 72 UTF-8 bytes",
  );
const currentPassword = z.string().min(1).max(200);
const reason = z.string().trim().min(5).max(500);
const limit = rateLimit({
  windowMs: 60_000,
  max: env.NODE_ENV === "test" ? 100 : 5,
  keyGenerator: (req) => req.user.userId,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "RATE_LIMITED",
    message: "Too many account changes. Try again shortly.",
  },
});
const safeUser = {
  id: true,
  name: true,
  email: true,
  regNo: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  programmeCode: true,
  year: true,
  studyGroupKey: true,
};
async function reauthenticate(req, password) {
  const actor = await prisma.user.findUnique({
    where: { id: req.user.userId },
  });
  if (
    !actor?.isActive ||
    actor.authVersion !== req.user.authVersion ||
    !(await bcrypt.compare(password, actor.passwordHash))
  )
    throw new UnauthorizedError(
      "Current password is incorrect or this sign-in has ended",
    );
  return actor;
}
async function assertActor(tx, req) {
  const actor = await tx.user.findUnique({ where: { id: req.user.userId } });
  if (!actor?.isActive || actor.authVersion !== req.user.authVersion)
    throw new UnauthorizedError("This sign-in has ended. Sign in again.");
}
async function updateVersion(tx, user, data) {
  const result = await tx.user.updateMany({
    where: { id: user.id, authVersion: user.authVersion },
    data: { ...data, authVersion: { increment: 1 } },
  });
  if (result.count !== 1)
    throw new ConflictError(
      "This account changed. Reload before trying again.",
    );
}
router.post(
  "/auth/password",
  limit,
  asyncHandler(async (req, res) => {
    const data = z
      .object({ currentPassword, newPassword: passwordSchema })
      .strict()
      .parse(req.body);
    const user = await reauthenticate(req, data.currentPassword);
    if (await bcrypt.compare(data.newPassword, user.passwordHash))
      throw new ValidationError("Choose a different password");
    const passwordHash = await bcrypt.hash(data.newPassword, 12);
    await prisma.$transaction(async (tx) => {
      await updateVersion(tx, user, {
        passwordHash,
        mustChangePassword: false,
      });
      await audit(
        tx,
        user.id,
        "PASSWORD_CHANGED",
        "User",
        user.id,
        null,
        { signInsEnded: true },
        "Password changed by account owner",
      );
    });
    res.json({
      message: "Password updated. Sign in again with your new password.",
      signInRequired: true,
    });
  }),
);
router.post(
  "/auth/end-signins",
  limit,
  asyncHandler(async (req, res) => {
    const data = z.object({ currentPassword }).strict().parse(req.body);
    const user = await reauthenticate(req, data.currentPassword);
    await prisma.$transaction(async (tx) => {
      await updateVersion(tx, user, {});
      await audit(
        tx,
        user.id,
        "SIGNINS_ENDED",
        "User",
        user.id,
        null,
        { signInsEnded: true },
        "All sign-ins ended by account owner",
      );
    });
    res.json({
      message: "All sign-ins ended. Sign in again to continue.",
      signInRequired: true,
    });
  }),
);
router.use("/admin/accounts", requireAdmin, (req, _res, next) => {
  if (req.user.mustChangePassword)
    return next(
      new ForbiddenError(
        "Change your temporary password before managing accounts.",
      ),
    );
  next();
});
router.get(
  "/admin/accounts",
  asyncHandler(async (req, res) => {
    const f = filters(req.query);
    const role = req.query.role
      ? z.enum(["STUDENT", "EXAMINER", "ADMIN"]).parse(req.query.role)
      : "STUDENT";
    const active = req.query.active
      ? z.enum(["true", "false"]).parse(req.query.active)
      : undefined;
    const where = {
      ...(role === "STUDENT" ? studentWhere(f) : { role }),
      ...(role !== "STUDENT" && f.search
        ? {
            OR: ["name", "email"].map((key) => ({
              [key]: { contains: f.search, mode: "insensitive" },
            })),
          }
        : {}),
      ...(active ? { isActive: active === "true" } : {}),
    };
    res.json(
      await prisma.user.findMany({
        where,
        take: f.limit,
        skip: f.offset,
        select: safeUser,
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
    );
  }),
);
async function manage(req, action, extra = {}) {
  const targetId = identity.parse(req.params.userId);
  const data = z
    .object({ currentPassword, reason, ...extra })
    .strict()
    .parse(req.body);
  await reauthenticate(req, data.currentPassword);
  const passwordHash =
    action === "PASSWORD_RESET"
      ? await bcrypt.hash(data.temporaryPassword, 12)
      : null;
  return prisma.$transaction(async (tx) => {
    await assertActor(tx, req);
    const user = await tx.user.findUnique({ where: { id: targetId } });
    if (!user) throw new NotFoundError("Account not found");
    if (user.role === "ADMIN")
      throw new ForbiddenError(
        "Registrar accounts cannot be changed here. Use My account for your own password.",
      );
    if (action === "PASSWORD_RESET" && !user.isActive)
      throw new ConflictError(
        "Reactivate this account before resetting its password.",
      );
    const changes =
      action === "PASSWORD_RESET"
        ? { passwordHash, mustChangePassword: true }
        : action === "ACCOUNT_STATUS_CHANGED"
          ? { isActive: data.isActive }
          : {};
    if (action === "ACCOUNT_STATUS_CHANGED" && user.isActive === data.isActive)
      throw new ConflictError(
        "This account already has that status. Reload before trying again.",
      );
    await updateVersion(tx, user, changes);
    await audit(
      tx,
      req.user.userId,
      action,
      "User",
      user.id,
      { isActive: user.isActive, mustChangePassword: user.mustChangePassword },
      {
        isActive: changes.isActive ?? user.isActive,
        mustChangePassword:
          changes.mustChangePassword ?? user.mustChangePassword,
        signInsEnded: true,
      },
      data.reason,
    );
    return tx.user.findUniqueOrThrow({
      where: { id: user.id },
      select: safeUser,
    });
  });
}
router.patch(
  "/admin/accounts/:userId/status",
  limit,
  asyncHandler(async (req, res) => {
    res.json(
      await manage(req, "ACCOUNT_STATUS_CHANGED", { isActive: z.boolean() }),
    );
  }),
);
router.post(
  "/admin/accounts/:userId/reset-password",
  limit,
  asyncHandler(async (req, res) => {
    res.json(
      await manage(req, "PASSWORD_RESET", {
        temporaryPassword: passwordSchema,
      }),
    );
  }),
);
router.post(
  "/admin/accounts/:userId/end-signins",
  limit,
  asyncHandler(async (req, res) => {
    res.json(await manage(req, "SIGNINS_ENDED"));
  }),
);
export default router;
