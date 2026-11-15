// Shared-network guard plus per-account controls.
import { createHash } from "node:crypto";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
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
  max: env.NODE_ENV === "test" ? 1000 : 120,
  skipSuccessfulRequests: true,
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

export const loginIdentityRateLimit = rateLimit({
  windowMs: 60_000,
  max: env.NODE_ENV === "test" ? 100 : 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) =>
    createHash("sha256")
      .update(
        String(req.body.identifier || req.body.email || "unknown")
          .trim()
          .toLowerCase()
          .slice(0, 254),
      )
      .digest("hex"),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "RATE_LIMITED",
    message:
      "Too many unsuccessful sign-ins for this identity. Try again shortly.",
  },
});
export const authenticatedRateLimit = rateLimit({
  windowMs: 60_000,
  max: 600,
  keyGenerator: (req) => req.user.userId,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "RATE_LIMITED",
    message: "Too many requests for this account. Try again shortly.",
  },
});
