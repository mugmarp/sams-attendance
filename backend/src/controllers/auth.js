import bcrypt from "bcryptjs";
import { prisma } from "../config/db.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { UnauthorizedError } from "../utils/errors.js";
const publicUser = {
  id: true,
  isActive: true,
  email: true,
  name: true,
  role: true,
  regNo: true,
  program: true,
  year: true,
};
function tokens(user) {
  const payload = { userId: user.id, email: user.email, role: user.role };
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}
export const login = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { email: req.body.email.toLowerCase().trim() },
  });
  if (
    !user?.isActive ||
    !(await bcrypt.compare(req.body.password, user.passwordHash))
  )
    throw new UnauthorizedError("Invalid email or password");
  const safe = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: publicUser,
  });
  res.json({ ...tokens(user), user: safe });
});
export const refresh = asyncHandler(async (req, res) => {
  let id;
  try {
    id = verifyRefreshToken(req.body.refreshToken).userId;
  } catch {
    throw new UnauthorizedError("Invalid refresh token");
  }
  const user = await prisma.user.findUnique({
    where: { id },
    select: publicUser,
  });
  if (!user?.isActive) throw new UnauthorizedError();
  res.json({ ...tokens(user), user });
});
export const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: publicUser,
  });
  if (!user?.isActive) throw new UnauthorizedError();
  res.json(user);
});
