import { calendarReference } from "../services/timetable-source.js";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { requireAdmin, requireStudent } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  registration,
  suggestedYear,
  profileData,
  selectableGroup,
  catalogue,
} from "../services/catalogue.js";
import { audit } from "../services/academic.js";
import { studentDay } from "../services/student-day.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
const router = Router();
router.get(
  "/academic/catalog",
  asyncHandler(async (_req, res) => {
    const faculties = await prisma.faculty.findMany({
      include: {
        programmes: {
          include: {
            groups: { orderBy: [{ studyYear: "asc" }, { track: "asc" }] },
          },
        },
      },
      orderBy: { name: "asc" },
    });
    const reference = await calendarReference();
    res.json({
      academicYear: reference.academicYear,
      semester: reference.semester,
      source: catalogue.source,
      status: catalogue.status,
      faculties: faculties.map((f) => ({
        ...f,
        programmes: f.programmes.map((p) => ({
          ...p,
          groups: p.groups.filter(selectableGroup),
        })),
      })),
    });
  }),
);
router.get(
  "/admin/registration/preview",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = z
        .object({
          regNo: z.string().max(60),
          academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
        })
        .parse(req.query),
      parsed = registration(input.regNo);
    if (!parsed)
      throw new ValidationError("Use YYYY/PROGRAMME/SEQUENCE/SPONSORSHIP");
    const programme = await prisma.programme.findUnique({
      where: { code: parsed.programmeCode },
      include: { faculty: true, groups: true },
    });
    res.json({
      ...parsed,
      programme,
      suggestedYear: suggestedYear(parsed, input.academicYear),
      notice:
        "Suggested placement and email require confirmation. Sequence and sponsorship do not identify a class; a derived email is not verified mailbox ownership.",
    });
  }),
);
router.patch(
  "/admin/students/:studentId/profile",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        programmeCode: z.string().min(2).max(12),
        year: z.number().int().min(1).max(10),
        studyGroupKey: z.string().min(1).max(120),
        studyAcademicYear: z.string().regex(/^\d{4}\/\d{4}$/),
        studySemester: z.number().int().min(1).max(2),
        reason: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(req.body);
    const studentId = z.string().cuid().parse(req.params.studentId);
    res.json(
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${studentId} FOR UPDATE`;
        const before = await tx.user.findUnique({ where: { id: studentId } });
        if (!before || before.role !== "STUDENT")
          throw new NotFoundError("Student not found");
        const data = profileData({ ...input, regNo: before.regNo });
        if (
          !selectableGroup({
            programmeCode: data.programmeCode,
            studyYear: input.year,
            track:
              (
                await tx.programmeGroup.findUnique({
                  where: { key: data.studyGroupKey },
                })
              )?.track || "",
          })
        )
          throw new ValidationError("Choose the specific timetable track");
        const after = await tx.user.update({
          where: { id: studentId },
          data,
          select: {
            id: true,
            name: true,
            regNo: true,
            programmeCode: true,
            year: true,
            studyGroupKey: true,
            studyAcademicYear: true,
            studySemester: true,
          },
        });
        await audit(
          tx,
          req.user.userId,
          "ACADEMIC_PROFILE_CHANGED",
          "User",
          studentId,
          {
            programmeCode: before.programmeCode,
            year: before.year,
            studyGroupKey: before.studyGroupKey,
            studyAcademicYear: before.studyAcademicYear,
            studySemester: before.studySemester,
          },
          after,
          input.reason,
        );
        return after;
      }),
    );
  }),
);
router.get(
  "/student/day",
  requireStudent,
  asyncHandler(async (req, res) => res.json(await studentDay(req.user.userId))),
);
export default router;
