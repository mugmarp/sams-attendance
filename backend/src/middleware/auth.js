import { prisma } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";
import { UserRole } from "@prisma/client";
export const authenticate = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    throw new UnauthorizedError("Missing or invalid authorization header");
  let payload;
  try {
    payload = verifyAccessToken(authHeader.slice(7));
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      role: true,
      isActive: true,
      authVersion: true,
      mustChangePassword: true,
    },
  });
  if (!user?.isActive)
    throw new UnauthorizedError("This account is unavailable");
  if ((payload.authVersion ?? 0) !== user.authVersion)
    throw new UnauthorizedError("This sign-in has ended. Sign in again.");
  req.user = {
    ...payload,
    authVersion: user.authVersion,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
  next();
});
export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      throw new UnauthorizedError("Not authenticated");
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    next();
  };
}
export const requireStudent = authorize(UserRole.STUDENT);
export const requireExaminer = authorize(UserRole.EXAMINER);
export const requireAdmin = authorize(UserRole.ADMIN);
export const requireExaminerOrAdmin = authorize(
  UserRole.EXAMINER,
  UserRole.ADMIN,
);
