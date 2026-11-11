import { pathToFileURL } from "node:url";
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
const email = z.string().trim().toLowerCase().email();
const dataset = z.object({
  users: z
    .array(
      z.object({
        email,
        name: z.string().min(1).max(120),
        role: z.enum(["STUDENT", "EXAMINER", "ADMIN"]),
        regNo: z.string().optional(),
        program: z.string().optional(),
        year: z.number().int().min(1).max(10).optional(),
      }),
    )
    .min(1),
  courses: z.array(
    z.object({
      key: z.string().min(1),
      code: z.string().min(1),
      title: z.string().min(1),
      academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
      semester: z.number().int().min(1).max(2),
      attendanceThreshold: z.number().int().min(1).max(100).default(80),
      program: z.string(),
      year: z.number().int().min(1),
      examinerEmail: email,
    }),
  ),
  enrollments: z.array(
    z.object({ studentEmail: email, courseKey: z.string() }),
  ),
  sessions: z.array(
    z.object({
      naturalKey: z.string().min(1),
      courseKey: z.string(),
      startTime: z.string().datetime({ offset: true }),
      endTime: z.string().datetime({ offset: true }),
      room: z.string().optional(),
      sessionType: z
        .enum(["LECTURE", "TUTORIAL", "PRACTICAL", "LAB", "CLINICAL"])
        .default("LECTURE"),
    }),
  ),
});
export function validateDataset(input) {
  const data = dataset.parse(input);
  const users = new Map(data.users.map((u) => [u.email, u]));
  const courses = new Map(data.courses.map((c) => [c.key, c]));
  const unique = (values, label) => {
    if (new Set(values).size !== values.length)
      throw new Error(`Duplicate ${label}`);
  };
  unique(
    data.users.map((u) => u.email),
    "user email",
  );
  unique(
    data.users.filter((u) => u.regNo).map((u) => u.regNo),
    "registration number",
  );
  unique(
    data.courses.map((c) => c.key),
    "course key",
  );
  unique(
    data.courses.map((c) => `${c.code}/${c.academicYear}/${c.semester}`),
    "course offering",
  );
  unique(
    data.sessions.map((s) => s.naturalKey),
    "session natural key",
  );
  unique(
    data.enrollments.map((e) => `${e.studentEmail}/${e.courseKey}`),
    "enrollment",
  );
  for (const u of data.users)
    if (u.role === "STUDENT" && !u.regNo)
      throw new Error(`Student ${u.email} needs a registration number`);
  for (const c of data.courses)
    if (users.get(c.examinerEmail)?.role !== "EXAMINER")
      throw new Error(`Course ${c.key} needs a declared EXAMINER`);
  for (const e of data.enrollments)
    if (
      users.get(e.studentEmail)?.role !== "STUDENT" ||
      !courses.has(e.courseKey)
    )
      throw new Error(
        `Unmatched enrollment: ${e.studentEmail} / ${e.courseKey}`,
      );
  for (const s of data.sessions)
    if (
      !courses.has(s.courseKey) ||
      new Date(s.endTime) <= new Date(s.startTime)
    )
      throw new Error(`Invalid dated session: ${s.naturalKey}`);
  return data;
}
export async function importDataset(db, input, initialPassword) {
  const data = validateDataset(input);
  if (initialPassword.length < 12)
    throw new Error("IMPORT_INITIAL_PASSWORD must be at least 12 characters");
  const passwordHash = await bcrypt.hash(initialPassword, 12);
  return db.$transaction(
    async (tx) => {
      const users = new Map();
      const courses = new Map();
      for (const u of data.users) {
        const existing = await tx.user.findUnique({
          where: { email: u.email },
        });
        if (
          existing &&
          (existing.role !== u.role || existing.regNo !== (u.regNo ?? null))
        )
          throw new Error(`User identity conflict: ${u.email}`);
        const saved =
          existing ?? (await tx.user.create({ data: { ...u, passwordHash } }));
        users.set(u.email, saved.id);
      }
      for (const c of data.courses) {
        const { key, examinerEmail, ...fields } = c;
        const existing = await tx.course.findUnique({
          where: {
            code_academicYear_semester: {
              code: c.code,
              academicYear: c.academicYear,
              semester: c.semester,
            },
          },
        });
        if (
          existing &&
          (existing.examinerId !== users.get(examinerEmail) ||
            existing.title !== c.title || existing.attendanceThreshold !== c.attendanceThreshold)
        )
          throw new Error(`Course identity conflict: ${key}`);
        const saved =
          existing ??
          (await tx.course.create({
            data: { ...fields, examinerId: users.get(examinerEmail) },
          }));
        courses.set(key, saved.id);
      }
      for (const e of data.enrollments) {
        const studentId = users.get(e.studentEmail);
        const courseId = courses.get(e.courseKey);
        await tx.enrollment.upsert({
          where: { studentId_courseId: { studentId, courseId } },
          update: {},
          create: { studentId, courseId },
        });
      }
      for (const s of data.sessions) {
        const { courseKey, ...fields } = s;
        const courseId = courses.get(courseKey);
        const existing = await tx.session.findUnique({
          where: { naturalKey: s.naturalKey },
        });
        if (
          existing &&
          (existing.courseId !== courseId ||
            existing.startTime.toISOString() !==
              new Date(s.startTime).toISOString() ||
            existing.endTime.toISOString() !==
              new Date(s.endTime).toISOString())
        )
          throw new Error(`Session identity conflict: ${s.naturalKey}`);
        if (!existing)
          await tx.session.create({ data: { ...fields, courseId } });
      }
      return {
        users: data.users.length,
        courses: data.courses.length,
        enrollments: data.enrollments.length,
        sessions: data.sessions.length,
      };
    },
    { timeout: 60000, maxWait: 10000 },
  );
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const db = new PrismaClient();
  const file = process.argv[2];
  Promise.resolve()
    .then(() => {
      if (!file)
        throw new Error(
          "Usage: npm run import -- path/to/private-dataset.json",
        );
      return importDataset(
        db,
        JSON.parse(fs.readFileSync(file, "utf8")),
        process.env.IMPORT_INITIAL_PASSWORD ?? "",
      );
    })
    .then((result) => console.log("Import complete:", result))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
