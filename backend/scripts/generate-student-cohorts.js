import fs from "node:fs";
import {
  registration,
  suggestedYear,
  parseGroup,
  selectableGroup,
} from "../src/services/catalogue.js";
// Personal names are supplied through a private operator file, never hard-coded here.
const [rosterPath, output] = process.argv.slice(2);
if (!rosterPath || !output)
  throw new Error(
    "Usage: node scripts/generate-student-cohorts.js PRIVATE_BSE_ROSTER.json PRIVATE_OUTPUT.json",
  );
const supplied = JSON.parse(fs.readFileSync(rosterPath, "utf8"));
if (!Array.isArray(supplied) || supplied.length > 50)
  throw new Error("Provide a bounded BSE roster array");
const raw = JSON.parse(
  fs.readFileSync(
    new URL("../../data/timetable_export.json", import.meta.url),
    "utf8",
  ),
);
const groups = new Map();
for (const row of raw)
  for (const key of [row.program_group, ...row.shared_with]) {
    const group = parseGroup(key);
    if (group && selectableGroup(group)) groups.set(group.key, group);
  }
const academicYear = "2026/2027",
  semester = 1,
  students = [];
function student(name, regNo, dataOrigin) {
  const reg = registration(regNo);
  if (!reg) throw new Error("Invalid registration in source roster");
  const year = suggestedYear(reg, academicYear);
  if (!year)
    throw new Error(
      "Placement requires explicit review outside normal duration",
    );
  const possible = [...groups.values()]
    .filter(
      (g) => g.programmeCode === reg.programmeCode && g.studyYear === year,
    )
    .sort(
      (a, b) =>
        Number(!!a.track) - Number(!!b.track) || a.key.localeCompare(b.key),
    );
  if (!possible.length)
    throw new Error("No mapped timetable group for generated placement");
  return {
    name,
    regNo: reg.normalized,
    email: reg.emailSuggestion,
    programmeCode: reg.programmeCode,
    year,
    studyGroupKey: possible[0].key,
    studyAcademicYear: academicYear,
    studySemester: semester,
    dataOrigin,
  };
}
for (const row of supplied) {
  if (registration(row.regNo)?.programmeCode !== "BSE")
    throw new Error("The supplied roster must contain BSE registrations");
  students.push(student(row.name, row.regNo, "USER_SUPPLIED"));
}
for (const code of ["BCS", "BIT", "BBA", "BME"])
  for (let i = 1; i <= 10; i++) {
    const intake = [2025, 2026, 2024][(i - 1) % 3];
    students.push(
      student(
        `${code} Student ${String(i).padStart(2, "0")}`,
        `${intake}/${code}/${9000 + i}/PS`,
        "SYNTHETIC",
      ),
    );
  }
if (
  new Set(students.map((s) => s.regNo)).size !== students.length ||
  new Set(students.map((s) => s.email)).size !== students.length
)
  throw new Error("Duplicate registration/email in generated dataset");
const fd = fs.openSync(output, "wx", 0o600);
fs.writeFileSync(
  fd,
  JSON.stringify(
    {
      academicYear,
      semester,
      note: "User-supplied BSE identities plus explicitly synthetic learning records. Derived institutional email addresses are not verified mailboxes. No email is sent. No courses, enrollments or attendance are inferred.",
      students,
    },
    null,
    2,
  ) + "\n",
);
fs.closeSync(fd);
console.log(
  JSON.stringify(
    {
      students: students.length,
      programmes: [...new Set(students.map((s) => s.programmeCode))],
      output,
    },
    null,
    2,
  ),
);
