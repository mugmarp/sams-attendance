// backend/src/controllers/auth.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { generateAccessToken, generateRefreshToken, TokenPayload } from '../utils/jwt';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError, ValidationError } from '../utils/errors';

const SALT_ROUNDS = 12;

function toTokenPayload(user: { id: string; email: string; role: string }): TokenPayload {
  return { userId: user.id, email: user.email, role: user.role as TokenPayload['role'] };
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new UnauthorizedError('Invalid credentials');
  }
  
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid credentials');
  }
  
  const payload = toTokenPayload(user);
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  
  // Store refresh token hash (optional: for revocation)
  // await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: await bcrypt.hash(refreshToken, SALT_ROUNDS) } });
  
  res.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      regNo: user.regNo,
      name: user.name,
      email: user.email,
      role: user.role,
      program: user.program,
      year: user.year,
    },
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    throw new ValidationError('Refresh token required');
  }
  
  // Verify refresh token
  const { verifyRefreshToken } = await import('../utils/jwt');
  let payload: TokenPayload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }
  
  // Check user still exists
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    throw new UnauthorizedError('User not found');
  }
  
  const newPayload = toTokenPayload(user);
  const accessToken = generateAccessToken(newPayload);
  const newRefreshToken = generateRefreshToken(newPayload);
  
  res.json({ accessToken, refreshToken: newRefreshToken });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }
  
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, regNo: true, name: true, email: true, role: true, program: true, year: true },
  });
  
  if (!user) {
    throw new UnauthorizedError('User not found');
  }
  
  res.json(user);
});