// backend/src/middleware/rateLimit.ts
import rateLimit from "express-rate-limit";
import { env } from "../config/env";

export const globalRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: "RATE_LIMITED",
    message: "Too many requests, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRateLimit = rateLimit({
  windowMs: 60_000, // 1 minute
  max: env.NODE_ENV === "test" ? 100 : 10,
  message: {
    error: "RATE_LIMITED",
    message: "Too many auth attempts, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const checkinRateLimit = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 30,
  message: { error: "RATE_LIMITED", message: "Too many check-in attempts" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId ?? req.ip ?? "unknown",
});
