// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "../utils/jwt";
import { UnauthorizedError, ForbiddenError } from "../utils/errors";
import { UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
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

export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
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
