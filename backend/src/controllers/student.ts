// backend/src/controllers/student.ts
import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import { validateCode } from '../services/checkinCode';
import { getStudentAttendanceSummary } from '../services/eligibility';

export const checkin = asyncHandler(async (req: Request, res: Response) => {
  const studentId = req.user!.userId;
  const { sessionId, code } = req.body;
  
  // Verify session exists and is active
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { course: { select: { id: true, code: true, title: true } } },
  });
  
  if (!session) {
    throw new NotFoundError('Session not found');
  }
  
  // Check if student is enrolled in this course
  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId, courseId: session.courseId } },
  });
  
  if (!enrollment) {
    throw new ValidationError('Not enrolled in this course');
  }
  
  // Check if already checked in
  const existing = await prisma.attendance.findUnique({
    where: { studentId_sessionId: { studentId, sessionId } },
  });
  
  if (existing) {
    throw new ConflictError('Already checked in for this session');
  }
  
  // Validate code
  const valid = await validateCode(sessionId, code);
  if (!valid) {
    throw new ValidationError('Invalid or expired check-in code');
  }
  
  // Record attendance
  const attendance = await prisma.attendance.create({
    data: {
      studentId,
      sessionId,
      status: 'PRESENT',
      method: 'CODE',
      deviceInfo: req.headers['user-agent'],
    },
  });
  
  res.json({
    success: true,
    attendance: {
      id: attendance.id,
      sessionId: attendance.sessionId,
      status: attendance.status,
      method: attendance.method,
      recordedAt: attendance.recordedAt,
    },
    session: {
      courseCode: session.course.code,
      courseTitle: session.course.title,
      date: session.date,
      startTime: session.startTime,
    },
  });
});

export const getAttendanceSummary = asyncHandler(async (req: Request, res: Response) => {
  const studentId = req.user!.userId;
  
  const summary = await getStudentAttendanceSummary(studentId);
  
  res.json(summary);
});

export const getUpcomingSessions = asyncHandler(async (req: Request, res: Response) => {
  const studentId = req.user!.userId;
  const now = new Date();
  
  const sessions = await prisma.session.findMany({
    where: {
      course: { enrollments: { some: { studentId } } },
      startTime: { gte: now },
    },
    include: {
      course: { select: { code: true, title: true } },
    },
    orderBy: { startTime: 'asc' },
    take: 20,
  });
  
  // Check which ones already have attendance
  const sessionIds = sessions.map(s => s.id);
  const attendances = await prisma.attendance.findMany({
    where: { studentId, sessionId: { in: sessionIds } },
    select: { sessionId: true },
  });
  
  const attendedSet = new Set(attendances.map(a => a.sessionId));
  
  const sessionsWithStatus = sessions.map(s => ({
    ...s,
    checkedIn: attendedSet.has(s.id),
  }));
  
  res.json(sessionsWithStatus);
});