import { z } from "zod";
import { studentDay } from "../services/student-day.js";
import { getStudentAttendanceSummary } from "../services/eligibility.js";
import { ensureStudentCourses } from "../services/course-setup.js";
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
  mustChangePassword: true,
  email: true,
  name: true,
  role: true,
  regNo: true,
  program: true,
  year: true,
  programmeCode: true,
  studyGroupKey: true,
  studyAcademicYear: true,
  studySemester: true,
  admissionYear: true,
  sponsorshipCode: true,
};
function tokens(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    authVersion: user.authVersion,
  };
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}
export const login = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: (req.body.identifier || req.body.email).includes("@")
      ? { email: (req.body.identifier || req.body.email).toLowerCase().trim() }
      : { regNo: req.body.identifier.trim().toUpperCase() },
  });
  if (
    !user?.isActive ||
    !(await bcrypt.compare(req.body.password, user.passwordHash))
  )
    throw new UnauthorizedError("Invalid sign-in or password");
  if (user.role === "STUDENT" && !user.mustChangePassword)
    await ensureStudentCourses(user.id);
  const safe = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: publicUser,
  });
  res.json({ ...tokens(user), user: safe });
});
export const refresh = asyncHandler(async (req, res) => {
  let payload;
  try {
    payload = verifyRefreshToken(req.body.refreshToken);
  } catch {
    throw new UnauthorizedError("Invalid refresh token");
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { ...publicUser, authVersion: true },
  });
  if (!user?.isActive || (payload.authVersion ?? 0) !== user.authVersion)
    throw new UnauthorizedError("This sign-in has ended. Sign in again.");
  const { authVersion, ...safe } = user;
  res.json({ ...tokens(user), user: safe });
});
export const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: publicUser,
  });
  if (!user?.isActive) throw new UnauthorizedError();
  res.json(user);
});

// One authenticated response supplies the destination's initial student state.
// Client role hints select a view, never another identity or server permissions.
export const workspace = asyncHandler(async (req, res) => {
  const started = performance.now();
  const { view } = z.object({ view: z.enum(["profile", "student-day", "student-summary", "student-workspace"]).default("profile") }).strict().parse(req.body || {});
  let user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.userId }, select: publicUser });
  if (!user.isActive) throw new UnauthorizedError();
  const result = {};
  if (user.role === "STUDENT" && !user.mustChangePassword && view !== "profile") {
    await ensureStudentCourses(user.id);
    user = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: publicUser });
    if (view === "student-day") result.day = await studentDay(user.id);
    if (view === "student-summary") result.summary = await getStudentAttendanceSummary(user.id);
  }
  res.set("Cache-Control", "no-store");
  res.set("Server-Timing", `workspace;dur=${(performance.now() - started).toFixed(1)}`);
  res.json({ user, now: new Date().toISOString(), timeZone: "Africa/Kampala", ...result });
});
