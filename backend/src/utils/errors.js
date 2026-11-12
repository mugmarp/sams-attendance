// Shared API errors
export class AppError extends Error {
  code;
  statusCode;
  details;
  constructor(code, message, statusCode = 400, details) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}
export class ValidationError extends AppError {
  constructor(message, details) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super("UNAUTHORIZED", message, 401);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super("FORBIDDEN", message, 403);
  }
}
export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super("NOT_FOUND", message, 404);
  }
}
export class ConflictError extends AppError {
  constructor(message) {
    super("CONFLICT", message, 409);
  }
}
export class InternalError extends AppError {
  constructor(message = "Internal server error") {
    super("INTERNAL_ERROR", message, 500);
  }
}
export function isAppError(err) {
  return err instanceof AppError;
}
