// backend/src/utils/validation.ts
import { z } from 'zod';

// Auth
export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1),
  }),
});

// Check-in
export const checkinSchema = z.object({
  body: z.object({
    sessionId: z.string().cuid(),
    code: z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/),
  }),
});

// Examiner session control
export const sessionIdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
});

// Admin eligibility
export const courseIdParamSchema = z.object({
  params: z.object({
    courseId: z.string().cuid(),
  }),
});

// Pagination
export const paginationQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
    status: z.string().optional(),
    program: z.string().optional(),
  }),
});