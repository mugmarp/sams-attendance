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
    select: { role: true, isActive: true },
  });
  if (!user?.isActive)
    throw new UnauthorizedError("This account is unavailable");
  req.user = { ...payload, role: user.role };
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
