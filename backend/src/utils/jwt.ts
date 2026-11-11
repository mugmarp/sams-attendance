// backend/src/utils/jwt.ts
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { UserRole } from "@prisma/client";

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface AccessTokenPayload extends TokenPayload {
  type: "access";
}

export interface RefreshTokenPayload extends TokenPayload {
  type: "refresh";
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign({ ...payload, type: "access" }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign({ ...payload, type: "refresh" }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
  if (decoded.type !== "access") {
    throw new Error("Invalid token type");
  }
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(
    token,
    env.JWT_REFRESH_SECRET,
  ) as RefreshTokenPayload;
  if (decoded.type !== "refresh") {
    throw new Error("Invalid token type");
  }
  return decoded;
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
}
