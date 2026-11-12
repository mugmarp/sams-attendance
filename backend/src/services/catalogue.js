import fs from "node:fs/promises";
import { ValidationError } from "../utils/errors.js";
export const catalogue = JSON.parse(
  await fs.readFile(
    new URL("../../../data/academic_catalogue.json", import.meta.url),
    "utf8",
  ),
);
export const programmes = new Map(
  catalogue.faculties.flatMap((f) =>
    f.programmes.map((p) => [p.code, { ...p, facultyCode: f.code }]),
  ),
);
export const ROMAN = ["", "I", "II", "III", "IV", "V", "VI"];
const aliases = {
  MLC: "MLS",
  BNC: "BNS",
  BSPC: "BSP",
  PEM: "PEEM",
  CIV: "CVE",
  BAF: "BSAF",
};
const direct = {
  BIOLOGY: ["BS", 3, "BIOLOGICAL"],
  CHEMISTRY: ["BS", 3, "CHEMISTRY"],
  MATHEMATICS: ["BS", 3, "MATHEMATICS"],
  PHYSICS: ["BS", 3, "PHYSICS"],
  ACCOUNTING: ["BBA", 3, "ACCOUNTING"],
  "BANKING AND FINANCE": ["BBA", 3, "BANKING AND FINANCE"],
  "HUMAN RESOURCE": ["BBA", 3, "HUMAN RESOURCE"],
  MARKETING: ["BBA", 3, "MARKETING"],
  PROCUREMENT: ["BBA", 3, "PROCUREMENT"],
  "SUSTAINABLE RURAL DEVELOPMENT": ["BPCD", 3, "SUSTAINABLE RURAL DEVELOPMENT"],
  "URBAN POLICY": ["BPCD", 3, "URBAN POLICY"],
  "BIOLOGY-CHEMISTRY": ["HEAP", 1, "BIOLOGY-CHEMISTRY"],
  "CHEMISTRY- MATHS": ["HEAP", 1, "CHEMISTRY-MATHS"],
  "PHYSICS-MATHS": ["HEAP", 1, "PHYSICS-MATHS"],
};
export function parseGroup(raw) {
  const text = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  let parts = direct[text];
  if (!parts) {
    if (text.startsWith("HEAP ")) {
      parts = ["HEAP", 1, text.slice(5).trim()];
    } else {
      const m = /^([A-Z]+)[ -]+(.*?)(VI|IV|V|III|II|I)$/.exec(text);
      if (!m) return null;
      parts = [
        aliases[m[1]] || m[1],
        ROMAN.indexOf(m[3]),
        m[2]
          .replace(/[- ]+/g, " ")
          .trim()
          .replace(/^BIOLOGY$/, "BIOLOGICAL"),
      ];
    }
  }
  const [programmeCode, studyYear, track] = parts;
  if (
    !programmes.has(programmeCode) ||
    studyYear < 1 ||
    studyYear > programmes.get(programmeCode).durationYears
  )
    return null;
  return {
    programmeCode,
    studyYear,
    track,
    key:
      programmeCode === "HEAP"
        ? `HEAP ${track}`
        : [programmeCode, track, ROMAN[studyYear]].filter(Boolean).join(" "),
  };
}
export function matchesGroup(row, group) {
  const target = parseGroup(group);
  if (!target) return false;
  return [
    row.program_group,
    ...(Array.isArray(row.shared_with) ? row.shared_with : []),
  ].some((g) => {
    const p = parseGroup(g);
    return (
      p &&
      p.programmeCode === target.programmeCode &&
      p.studyYear === target.studyYear &&
      (!p.track || !target.track || p.track === target.track)
    );
  });
}
export function registration(raw) {
  const normalized = String(raw || "")
    .trim()
    .toUpperCase();
  const match =
    /^((?:19|20)\d{2})\/([A-Z][A-Z0-9]{1,7})\/(\d{3,8})\/([A-Z][A-Z0-9]{0,7})$/.exec(
      normalized,
    );
  if (!match) return null;
  const [, intake, programmeCode, sequence, sponsorshipCode] = match;
  return {
    normalized,
    admissionYear: Number(intake),
    programmeCode,
    sequence,
    sponsorshipCode,
    emailSuggestion: `${intake}${programmeCode.toLowerCase()}${sequence}@sdt.must.ac.ug`,
  };
}
export function suggestedYear(reg, academicYear) {
  if (!reg || !/^\d{4}\/\d{4}$/.test(academicYear || "")) return null;
  const year = Number(academicYear.slice(0, 4)) - reg.admissionYear + 1;
  return year >= 1 &&
    year <= (programmes.get(reg.programmeCode)?.durationYears || 0)
    ? year
    : null;
}
export function profileData(body) {
  const reg = registration(body.regNo),
    code = (
      body.programmeCode ||
      reg?.programmeCode ||
      body.program ||
      ""
    ).toUpperCase();
  if (
    body.studyAcademicYear &&
    Number(body.studyAcademicYear.slice(5)) !==
      Number(body.studyAcademicYear.slice(0, 4)) + 1
  )
    throw new ValidationError("Use two consecutive academic years");
  if (/^\d{4}\//.test(String(body.regNo || "")) && !reg)
    throw new ValidationError(
      "Use a valid YYYY/PROGRAMME/SEQUENCE/SPONSORSHIP registration",
    );
  if (body.programmeCode && !programmes.has(code))
    throw new ValidationError("Choose a catalogued programme");
  if (reg && body.programmeCode && code !== reg.programmeCode)
    throw new ValidationError(
      "Registration programme and academic profile disagree; review the identity",
    );
  if (
    body.year &&
    programmes.has(code) &&
    body.year > programmes.get(code).durationYears
  )
    throw new ValidationError("Study year exceeds the programme duration");
  const group = body.studyGroupKey ? parseGroup(body.studyGroupKey) : null;
  if (group && !selectableGroup(group))
    throw new ValidationError(
      "Choose the specific year/track; an aggregate parent group is not an academic placement",
    );
  if (
    body.studyGroupKey &&
    (!group || group.programmeCode !== code || group.studyYear !== body.year)
  )
    throw new ValidationError(
      "Choose a timetable group for this programme and study year",
    );
  return {
    ...(reg
      ? {
          regNo: reg.normalized,
          admissionYear: reg.admissionYear,
          sponsorshipCode: reg.sponsorshipCode,
        }
      : {}),
    ...(programmes.has(code) ? { programmeCode: code, program: code } : {}),
    ...(body.year ? { year: body.year } : {}),
    ...(body.studyAcademicYear
      ? { studyAcademicYear: body.studyAcademicYear }
      : {}),
    ...(body.studySemester ? { studySemester: body.studySemester } : {}),
    ...(body.studyGroupKey ? { studyGroupKey: group.key } : {}),
  };
}
export function requiresTrack(code, year) {
  return (
    code === "HEAP" ||
    code === "BS" ||
    (code === "DLT" && year === 2) ||
    (code === "BBA" && year === 3) ||
    (code === "BPCD" && year === 3)
  );
}
export function selectableGroup(group) {
  return (
    !(requiresTrack(group.programmeCode, group.studyYear) && !group.track) &&
    !(group.programmeCode === "BGWH" && group.studyYear < 3)
  );
}
