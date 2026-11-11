// backend/src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import {
  AppError,
  isAppError,
  ValidationError,
  InternalError,
} from "../utils/errors";
import { env } from "../config/env";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (env.NODE_ENV !== "test") console.error("Error:", err.message);
  if (env.NODE_ENV === "development") {
    console.error(err.stack);
  }

  // AppError (our custom errors)
  if (isAppError(err)) {
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      details: err.details,
    });
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    const details = err.issues.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Validation failed",
      details,
    });
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[])?.join(", ") ?? "field";
      return res.status(409).json({
        error: "CONFLICT",
        message: `Duplicate value for ${target}`,
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Record not found",
      });
    }
  }

  // Default: internal error
  const internalErr = new InternalError();
  return res.status(internalErr.statusCode).json({
    error: internalErr.code,
    message: env.NODE_ENV === "development" ? err.message : internalErr.message,
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    error: "NOT_FOUND",
    message: "Route not found",
  });
}
