import { verifyAccessToken } from "../utils/jwt.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";
import { UserRole } from "@prisma/client";
export function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or invalid authorization header");
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
}
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
