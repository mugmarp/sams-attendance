// backend/src/controllers/examiner.ts
import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { startCheckin, stopCheckin, getActiveCode, validateCode } from '../services/checkinCode';
import { getSessionAttendance } from '../services/eligibility';

export const getTodaySessions = asyncHandler(async (req: Request, res: Response) => {
  const examinerId = req.user!.userId;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const sessions = await prisma.session.findMany({
    where: {
      course: { examinerId },
      date: { gte: today, lt: tomorrow },
    },
    include: {
      course: { select: { code: true, title: true } },
    },
    orderBy: { startTime: 'asc' },
  });
  
  // Add active code info
  const sessionsWithCode = await Promise.all(
    sessions.map(async (session) => {
      const activeCode = await getActiveCode(session.id);
      return {
        ...session,
        hasActiveCode: !!activeCode,
        codeExpiresAt: activeCode?.expiresAt,
      };
    })
  );
  
  res.json(sessionsWithCode);
});

export const getSession = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const examinerId = req.user!.userId;
  
  const session = await prisma.session.findFirst({
    where: { id, course: { examinerId } },
    include: {
      course: { select: { code: true, title: true, program: true, year: true } },
    },
  });
  
  if (!session) {
    throw new NotFoundError('Session not found');
  }
  
  const activeCode = await getActiveCode(session.id);
  
  res.json({ ...session, hasActiveCode: !!activeCode, codeExpiresAt: activeCode?.expiresAt });
});

export const startSessionCheckin = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const examinerId = req.user!.userId;
  
  // Verify examiner owns this session
  const session = await prisma.session.findFirst({
    where: { id, course: { examinerId } },
  });
  
  if (!session) {
    throw new NotFoundError('Session not found');
  }
  
  const { code, expiresAt } = await startCheckin(id);
  
  // Update session in DB
  await prisma.session.update({
    where: { id },
    data: { checkinCode: code, codeExpiresAt: expiresAt, codeRotatedAt: new Date() },
  });
  
  res.json({ code, expiresAt });
});

export const stopSessionCheckin = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const examinerId = req.user!.userId;
  
  const session = await prisma.session.findFirst({
    where: { id, course: { examinerId } },
  });
  
  if (!session) {
    throw new NotFoundError('Session not found');
  }
  
  await stopCheckin(id);
  
  await prisma.session.update({
    where: { id },
    data: { checkinCode: null, codeExpiresAt: null, codeRotatedAt: null },
  });
  
  res.json({ success: true });
});

export const getSessionAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const examinerId = req.user!.userId;
  
  const session = await prisma.session.findFirst({
    where: { id, course: { examinerId } },
  });
  
  if (!session) {
    throw new NotFoundError('Session not found');
  }
  
  const attendance = await getSessionAttendance(id);
  
  res.json(attendance);
});