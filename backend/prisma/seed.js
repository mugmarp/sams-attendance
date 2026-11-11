import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const kampalaDay = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const prisma = new PrismaClient();
export async function seedDemo() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DEMO_SEED !== "true"
  ) {
    throw new Error(
      "Demo accounts are disabled in production. Set ALLOW_DEMO_SEED=true only for a disposable demonstration.",
    );
  }
  const hash = await bcrypt.hash("SamsDemo2026!", 12);
  const examiner = await prisma.user.upsert({
    where: { email: "examiner@demo.sams.test" },
    update: {},
    create: {
      email: "examiner@demo.sams.test",
      passwordHash: hash,
      name: "Demo Examiner",
      role: "EXAMINER",
    },
  });
  await prisma.user.upsert({
    where: { email: "admin@demo.sams.test" },
    update: {},
    create: {
      email: "admin@demo.sams.test",
      passwordHash: hash,
      name: "Demo Registrar",
      role: "ADMIN",
    },
  });
  const students = [];
  for (const [index, name] of [
    "Alice Nakato",
    "Bob Kato",
    "Carol Amayo",
    "David Mugisha",
    "Esther Ainomugisha",
  ].entries()) {
    const email =
      index === 0
        ? "student@demo.sams.test"
        : `student${index + 1}@demo.sams.test`;
    students.push(
      await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          passwordHash: hash,
          name,
          role: "STUDENT",
          regNo: `DEMO/BSE/${String(index + 1).padStart(3, "0")}`,
          program: "BSE",
          year: 2,
        },
      }),
    );
  }
  const now = new Date();
  const day = kampalaDay(now);
  for (const [code, title] of [
    ["SWE2106", "Internet Technologies and Web Design"],
    ["SWE2103", "Database Systems"],
  ]) {
    const course = await prisma.course.upsert({
      where: {
        code_academicYear_semester: {
          code,
          academicYear: "2026/2027",
          semester: 1,
        },
      },
      update: {},
      create: {
        code,
        title,
        program: "BSE",
        year: 2,
        semester: 1,
        academicYear: "2026/2027",
        examinerId: examiner.id,
      },
    });
    for (const student of students)
      await prisma.enrollment.upsert({
        where: {
          studentId_courseId: { studentId: student.id, courseId: course.id },
        },
        update: {},
        create: { studentId: student.id, courseId: course.id },
      });
    for (let n = 1; n <= 5; n++) {
      const startTime = new Date(now.getTime() - n * 86400000);
      const session = await prisma.session.upsert({
        where: { naturalKey: `demo:${code}:history:${n}` },
        update: {},
        create: {
          naturalKey: `demo:${code}:history:${n}`,
          courseId: course.id,
          startTime,
          endTime: new Date(startTime.getTime() + 3600000),
          room: "Demo Lab",
          status: "COMPLETED",
        },
      });
      for (const [i, student] of students.entries()) {
        const status = n <= [4, 3, 5, 2, 4][i] ? "PRESENT" : "ABSENT";
        await prisma.attendance.upsert({
          where: {
            studentId_sessionId: {
              studentId: student.id,
              sessionId: session.id,
            },
          },
          update: {},
          create: {
            studentId: student.id,
            sessionId: session.id,
            status,
            method: "MANUAL",
          },
        });
      }
    }
    await prisma.session.upsert({
      where: { naturalKey: `demo:${code}:live:${day}` },
      update: {},
      create: {
        naturalKey: `demo:${code}:live:${day}`,
        courseId: course.id,
        room: "Demo Lab",
        startTime: new Date(now.getTime() - 15 * 60000),
        endTime: new Date(now.getTime() + 105 * 60000),
      },
    });
    const nextDay = new Date(`${day}T10:00:00+03:00`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    await prisma.session.upsert({
      where: { naturalKey: `demo:${code}:next:${day}` },
      update: {},
      create: {
        naturalKey: `demo:${code}:next:${day}`,
        courseId: course.id,
        room: "Demo Lab",
        startTime: nextDay,
        endTime: new Date(nextDay.getTime() + 3600000),
      },
    });
  }
  process.stdout.write(
    "Demo ready: admin@demo.sams.test, examiner@demo.sams.test, student@demo.sams.test. Password: SamsDemo2026!\n",
  );
}
seedDemo()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
