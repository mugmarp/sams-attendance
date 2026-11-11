// backend/src/controllers/admin.ts
import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError } from '../utils/errors';
import { getCourseEligibility } from '../services/eligibility';
import { generateEligibilityPDF } from '../services/pdf';

export const getEligibility = asyncHandler(async (req: Request, res: Response) => {
  const { courseId } = req.params;
  
  const result = await getCourseEligibility(courseId);
  
  res.json(result);
});

export const exportEligibilityPDF = asyncHandler(async (req: Request, res: Response) => {
  const { courseId } = req.params;
  
  const pdfBuffer = await generateEligibilityPDF(courseId);
  
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { code: true },
  });
  
  const filename = `eligibility_${course?.code ?? courseId}_${new Date().toISOString().split('T')[0]}.pdf`;
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(pdfBuffer);
});

export const getStudents = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = req.query.search as string;
  const program = req.query.program as string;
  
  const where: Record<string, unknown> = { role: 'STUDENT' };
  
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { regNo: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }
  
  if (program) {
    where.program = program;
  }
  
  const [students, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, regNo: true, name: true, email: true, program: true, year: true, createdAt: true },
      orderBy: { regNo: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);
  
  res.json({
    data: students,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const getCourses = asyncHandler(async (req: Request, res: Response) => {
  const courses = await prisma.course.findMany({
    include: {
      examiner: { select: { id: true, name: true, email: true } },
      _count: { select: { enrollments: true, sessions: true } },
    },
    orderBy: [{ program: 'asc' }, { year: 'asc' }, { code: 'asc' }],
  });
  
  res.json(courses);
});

export const getCourse = asyncHandler(async (req: Request, res: Response) => {
  const { courseId } = req.params;
  
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      examiner: { select: { id: true, name: true, email: true } },
      sessions: { orderBy: { startTime: 'asc' } },
      enrollments: { include: { student: { select: { id: true, regNo: true, name: true } } } },
    },
  });
  
  if (!course) {
    throw new NotFoundError('Course not found');
  }
  
  res.json(course);
});