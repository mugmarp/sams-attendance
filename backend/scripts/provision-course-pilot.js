import "dotenv/config";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { readablePassword } from "../src/utils/readablePassword.js";
import { registration } from "../src/services/catalogue.js";
import { resolvePlacement } from "../src/services/course-setup.js";
import { courseCandidates } from "../src/services/course-source.js";
import {
  latestPublication,
  calendarReference,
} from "../src/services/timetable-source.js";
import { audit } from "../src/services/academic.js";

const [mode = "--preview", credentialPath] = process.argv.slice(2);
if (
  !["--preview", "--apply"].includes(mode) ||
  (mode === "--apply" && !credentialPath)
)
  throw Error(
    "Usage: provision-course-pilot.js --preview | --apply PRIVATE_NEW_LECTURER_CREDENTIALS.json",
  );
const db = new PrismaClient();
const programmes = ["BSE", "BCS", "BIT", "BBA", "BME"];
const note =
  "Project pilot course list from the timetable reference; compulsory classification is for this project and requires institutional curriculum review.";
const reason =
  "Operator-authorized five-programme pilot course setup from reviewed unambiguous reference labels; project lecturer accounts are synthetic";
try {
  const reference = await calendarReference(),
    publication = await latestPublication();
  const existingTerm = await db.academicTerm.findUnique({
    where: {
      academicYear_semester: {
        academicYear: reference.academicYear,
        semester: reference.semester,
      },
    },
  });
  const students = await db.user.findMany({
    where: { role: "STUDENT", isActive: true },
    orderBy: { id: "asc" },
  });
  const groups = [
    ...new Set(
      students
        .map((u) => resolvePlacement(u, reference))
        .filter(
          (p) =>
            p.status === "RESOLVED" && programmes.includes(p.programmeCode),
        )
        .map((p) => p.groupKey),
    ),
  ].sort();
  const summary = [];
  for (const groupKey of groups) {
    const candidates = courseCandidates(publication.rows, groupKey);
    summary.push({
      groupKey,
      courses: candidates.filter((c) => !c.blocked).map((c) => c.code),
      excluded: candidates
        .filter((c) => c.blocked)
        .map((c) => ({ code: c.code, issues: c.issues })),
      students: students.filter(
        (u) => resolvePlacement(u, reference).groupKey === groupKey,
      ).length,
    });
  }
  console.log(
    JSON.stringify(
      {
        mode,
        reference: {
          academicYear: reference.academicYear,
          semester: reference.semester,
        },
        termExists: !!existingTerm,
        groups: summary,
      },
      null,
      2,
    ),
  );
  if (mode === "--apply") {
    if (
      publication.metadata.academic_year !== reference.academicYear ||
      !String(publication.metadata.semester).endsWith(
        String(reference.semester),
      )
    )
      throw Error("Source period disagrees with reference");
    const admins = JSON.parse(
      fs.readFileSync("/etc/sams/initial-accounts.json", "utf8"),
    ).accounts;
    const admin = admins.find((a) => a.role === "ADMIN");
    if (!admin) throw Error("Private registrar credentials required");
    const base = "http://127.0.0.1:" + (process.env.PORT || 3100) + "/api";
    let token;
    async function call(path, body, method = body ? "POST" : "GET") {
      const res = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await res.json();
      if (!res.ok)
        throw Error(`${path}: ${res.status} ${data.message || data.error}`);
      return data;
    }
    const signed = await call("/auth/login", {
      email: admin.email,
      password: admin.password,
    });
    token = signed.accessToken;
    if (signed.user.mustChangePassword)
      throw Error("Registrar must replace the temporary password first");
    let term = existingTerm;
    if (!term)
      term = await call("/admin/timetable/terms", {
        academicYear: reference.academicYear,
        semester: reference.semester,
        startsOn: reference.lecturesBegin,
        endsOn: reference.semesterEnds,
        excludedDates: [],
        sourceUrl: reference.sources[0],
        sourceNote:
          "Project calendar reference: semester end is not a verified teaching end. No historical classes are generated.",
      });
    // The batch endpoint independently verifies that this is the single current term.
    const actor = await db.user.findUniqueOrThrow({
      where: { email: admin.email },
    });
    const used = new Set();
    let document = fs.existsSync(credentialPath)
      ? JSON.parse(fs.readFileSync(credentialPath, "utf8"))
      : { createdAt: new Date().toISOString(), accounts: [] };
    const newAccounts = [];
    const teachers = new Map();
    for (const code of programmes) {
      const email = "lecturer-" + code.toLowerCase() + "@demo.sams.test";
      const existing = await db.user.findUnique({ where: { email } });
      if (existing) {
        if (
          existing.role !== "EXAMINER" ||
          existing.dataOrigin !== "SYNTHETIC" ||
          !existing.isActive
        )
          throw Error("Existing project lecturer identity needs review");
        teachers.set(code, existing.id);
        continue;
      }
      const password = readablePassword(used),
        entry = {
          name: code + " Project Lecturer",
          role: "EXAMINER",
          programmeCode: code,
          email,
          password,
        };
      document.accounts.push(entry);
      newAccounts.push({
        ...entry,
        passwordHash: await bcrypt.hash(password, 12),
      });
    }
    if (newAccounts.length) {
      if (fs.existsSync(credentialPath))
        throw Error(
          "Some lecturer accounts are missing; use a new private output file to preserve existing credentials",
        );
      const fd = fs.openSync(credentialPath, "wx", 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify(document, null, 2) + "\n");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      await db.$transaction(async (tx) => {
        for (const a of newAccounts) {
          const teacher = await tx.user.create({
            data: {
              name: a.name,
              email: a.email,
              role: a.role,
              passwordHash: a.passwordHash,
              dataOrigin: "SYNTHETIC",
            },
          });
          teachers.set(a.programmeCode, teacher.id);
          await audit(
            tx,
            actor.id,
            "PROJECT_LECTURER_CREATED",
            "User",
            teacher.id,
            null,
            {
              role: "EXAMINER",
              programmeCode: a.programmeCode,
              dataOrigin: "SYNTHETIC",
            },
            reason,
          );
        }
      });
    }
    const results = [];
    for (const s of summary) {
      if (!s.courses.length) {
        results.push({ groupKey: s.groupKey, status: "NO_REVIEWED_COURSES" });
        continue;
      }
      const programmeCode = s.groupKey.split(" ")[0],
        scope = { termId: term.id, groupKey: s.groupKey };
      const importedInput = {
        ...scope,
        items: s.courses.map((code) => ({
          code,
          examinerId: teachers.get(programmeCode),
        })),
        reason,
      };
      const preview = await call(
        "/admin/course-plans/import-preview",
        importedInput,
      );
      await call("/admin/course-plans/import", {
        ...importedInput,
        previewHash: preview.previewHash,
        currentPassword: admin.password,
      });
      const options = await call(
        "/admin/course-plans/options?" + new URLSearchParams(scope),
      );
      const courseItems = options.courses
        .filter(
          (c) => s.courses.includes(c.code) && c.offeringKey === programmeCode,
        )
        .map((c) => ({ courseId: c.id, compulsory: true }));
      if (courseItems.length !== s.courses.length)
        throw Error("Offering count does not match previewed course labels");
      const reviewNote =
        note +
        (s.excluded.length
          ? " Excluded source entries awaiting review: " +
            s.excluded.map((c) => c.code).join(", ") +
            "."
          : "");
      if (
        options.plan &&
        !options.plan.reviewNote.startsWith("Project pilot course list")
      )
        throw Error(
          "A registrar-maintained plan already exists; review it manually",
        );
      const same =
        options.plan &&
        options.plan.reviewNote === reviewNote &&
        options.plan.items.length === courseItems.length &&
        courseItems.every((i) =>
          options.plan.items.some(
            (p) => p.courseId === i.courseId && p.compulsory === i.compulsory,
          ),
        );
      let plan = options.plan;
      if (!same) {
        const planInput = {
          ...scope,
          expectedVersion: plan?.version || 0,
          items: courseItems,
          reviewNote,
          reason,
        };
        const planPreview = await call(
          "/admin/course-plans/preview",
          planInput,
        );
        plan = await call("/admin/course-plans/publish", {
          ...planInput,
          previewHash: planPreview.previewHash,
          currentPassword: admin.password,
        });
      }
      const batch = await call("/admin/course-plans/batch-preview", {
        planId: plan.id,
      });
      const applied = await call("/admin/course-plans/batch-apply", {
        planId: plan.id,
        previewHash: batch.previewHash,
        currentPassword: admin.password,
        reason,
      });
      results.push({
        groupKey: s.groupKey,
        courses: courseItems.length,
        students: applied.students,
        newEnrollments: applied.inserted,
        excluded: s.excluded.map((c) => c.code),
      });
    }
    console.log(
      JSON.stringify(
        {
          applied: true,
          lecturerAccountsCreated: newAccounts.length,
          privateCredentialFile: credentialPath,
          results,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await db.$disconnect();
}
