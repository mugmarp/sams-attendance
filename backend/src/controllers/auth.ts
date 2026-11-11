import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../config/db";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";
import { asyncHandler } from "../utils/asyncHandler";
import { UnauthorizedError } from "../utils/errors";
const publicUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  regNo: true,
  program: true,
  year: true,
} as const;
function tokens(user: {
  id: string;
  email: string;
  role: import("@prisma/client").UserRole;
}) {
  const payload = { userId: user.id, email: user.email, role: user.role };
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}
export const login = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { email: req.body.email.toLowerCase().trim() },
  });
  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash)))
    throw new UnauthorizedError("Invalid email or password");
  const safe = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: publicUser,
  });
  res.json({ ...tokens(user), user: safe });
});
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  let id: string;
  try {
    id = verifyRefreshToken(req.body.refreshToken).userId;
  } catch {
    throw new UnauthorizedError("Invalid refresh token");
  }
  const user = await prisma.user.findUnique({
    where: { id },
    select: publicUser,
  });
  if (!user) throw new UnauthorizedError();
  res.json({ ...tokens(user), user });
});
export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: publicUser,
  });
  if (!user) throw new UnauthorizedError();
  res.json(user);
});
