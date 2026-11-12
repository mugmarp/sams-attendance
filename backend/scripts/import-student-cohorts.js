import "dotenv/config";
import fs from "node:fs";
import { readablePassword } from "../src/utils/readablePassword.js";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import {
  profileData,
  registration,
  selectableGroup,
} from "../src/services/catalogue.js";
import { audit } from "../src/services/academic.js";
const [input, mode, credentialPath] = process.argv.slice(2);
if (!input || !["--preview", "--apply"].includes(mode))
  throw new Error(
    "Usage: node scripts/import-student-cohorts.js PRIVATE_INPUT.json --preview | --apply PRIVATE_CREDENTIAL_OUTPUT.json",
  );
const row = z
  .object({
    name: z.string().trim().min(2).max(120),
    regNo: z.string().max(60),
    email: z.email().max(254),
    programmeCode: z.string().max(12),
    year: z.number().int().min(1).max(6),
    studyGroupKey: z.string().max(120),
    studyAcademicYear: z.string().regex(/^\d{4}\/\d{4}$/),
    studySemester: z.number().int().min(1).max(2),
    dataOrigin: z.enum(["USER_SUPPLIED", "SYNTHETIC"]),
  })
  .strict();
const data = z
  .object({
    academicYear: z.string(),
    semester: z.number(),
    note: z.string(),
    students: z.array(row).min(1).max(200),
  })
  .strict()
  .parse(JSON.parse(fs.readFileSync(input, "utf8")));
const db = new PrismaClient();
let fd;
try {
  const seen = new Set(),
    planned = [];
  for (const student of data.students) {
    const reg = registration(student.regNo);
    if (
      !reg ||
      reg.programmeCode !== student.programmeCode ||
      student.email !== reg.emailSuggestion
    )
      throw new Error("Registration/email/programme identity mismatch");
    const profile = profileData(student),
      group = await db.programmeGroup.findUnique({
        where: { key: student.studyGroupKey },
      });
    if (!group || !selectableGroup(group))
      throw new Error("Unknown or ambiguous timetable group");
    if (seen.has(reg.normalized))
      throw new Error("Duplicate registration in import");
    seen.add(reg.normalized);
    const existing = await db.user.findFirst({
      where: { OR: [{ regNo: reg.normalized }, { email: student.email }] },
    });
    if (
      existing &&
      (existing.regNo !== reg.normalized ||
        existing.email !== student.email ||
        existing.name !== student.name ||
        existing.role !== "STUDENT" ||
        existing.programmeCode !== student.programmeCode)
    )
      throw new Error(
        "Existing identity conflicts; no account will be overwritten",
      );
    planned.push({ student, profile, existing });
  }
  const summary = {
    students: planned.length,
    newAccounts: planned.filter((p) => !p.existing).length,
    preservedAccounts: planned.filter((p) => p.existing).length,
    byProgramme: Object.fromEntries(
      [...new Set(data.students.map((s) => s.programmeCode))].map((p) => [
        p,
        data.students.filter((s) => s.programmeCode === p).length,
      ]),
    ),
  };
  if (mode === "--preview") {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    if (!credentialPath)
      throw new Error("Provide a private new credential output file");
    const actor = await db.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      orderBy: { createdAt: "asc" },
    });
    if (!actor) throw new Error("An active registrar account must exist");
    fd = fs.openSync(credentialPath, "wx", 0o600);
    const accounts = [];
    const usedPasswords = new Set();
    for (const plan of planned.filter((p) => !p.existing)) {
      const password = readablePassword(usedPasswords);
      accounts.push({
        ...plan,
        password,
        passwordHash: await bcrypt.hash(password, 12),
      });
    }
    fs.writeFileSync(
      fd,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          accounts: accounts.map((a) => ({
            name: a.student.name,
            regNo: a.student.regNo,
            email: a.student.email,
            password: a.password,
          })),
        },
        null,
        2,
      ) + "\n",
    );
    fs.fsyncSync(fd);
    await db.$transaction(
      async (tx) => {
        for (const account of accounts) {
          const { student, profile, passwordHash } = account;
          const saved = await tx.user.create({
            data: { ...student, ...profile, role: "STUDENT", passwordHash },
          });
          await audit(
            tx,
            actor.id,
            "STUDENT_COHORT_IMPORTED",
            "User",
            saved.id,
            undefined,
            {
              regNo: saved.regNo,
              programmeCode: saved.programmeCode,
              studyGroupKey: saved.studyGroupKey,
              academicYear: saved.studyAcademicYear,
              semester: saved.studySemester,
              dataOrigin: saved.dataOrigin,
            },
            "Operator-reviewed sample cohort import; no enrollment or attendance inferred",
          );
        }
      },
      { timeout: 30000 },
    );
    console.log(
      JSON.stringify(
        { ...summary, credentialPath, attendanceCreated: 0 },
        null,
        2,
      ),
    );
  }
} finally {
  if (fd !== undefined) fs.closeSync(fd);
  await db.$disconnect();
}
