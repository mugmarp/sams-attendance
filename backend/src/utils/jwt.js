// backend/src/utils/jwt.ts
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
export function generateAccessToken(payload) {
  return jwt.sign({ ...payload, type: "access" }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  });
}
export function generateRefreshToken(payload) {
  return jwt.sign({ ...payload, type: "refresh" }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  });
}
export function verifyAccessToken(token) {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (decoded.type !== "access") {
    throw new Error("Invalid token type");
  }
  return decoded;
}
export function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  if (decoded.type !== "refresh") {
    throw new Error("Invalid token type");
  }
  return decoded;
}
export function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
}
