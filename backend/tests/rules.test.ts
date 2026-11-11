import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attendanceResult,
  currentCode,
  matchesCode,
  kampalaDay,
} from "../src/services/rules";
test("attendance threshold uses exact counts; no classes is unassessed", () => {
  assert.deepEqual(attendanceResult(0, 0), {
    presentCount: 0,
    totalSessions: 0,
    attendancePct: null,
    eligible: false,
  });
  assert.equal(attendanceResult(4, 5).eligible, true);
  assert.equal(attendanceResult(3, 5).eligible, false);
  assert.equal(attendanceResult(79999, 100000).eligible, false);
});
test("code rotation, expiry boundaries and case normalization", () => {
  const start = new Date("2026-11-11T09:00:00Z");
  const end = new Date(start.getTime() + 600000);
  const at = (ms: number) =>
    currentCode("test-secret", start, end, new Date(start.getTime() + ms));
  assert.equal(at(-1), null);
  assert.equal(at(600000), null);
  assert.match(at(0)!.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(at(0)!.code, at(119999)!.code);
  assert.notEqual(at(0)!.code, at(120000)!.code);
  assert.equal(at(0)!.expiresAt.getTime(), start.getTime() + 120000);
  assert.equal(matchesCode(at(0)!.code, at(0)!.code.toLowerCase()), true);
  assert.equal(matchesCode(at(0)!.code, "x"), false);
});
test("day selection uses Kampala rather than the server timezone", () => {
  assert.equal(kampalaDay(new Date("2026-11-11T22:00:00Z")), "2026-11-12");
});

test("import validation rejects unmatched enrollment and invalid session times", async () => {
  const { validateDataset } = await import("../scripts/import");
  const base = {
    users: [
      { email: "teacher@import.test", name: "Teacher", role: "EXAMINER" },
      {
        email: "student@import.test",
        name: "Student",
        role: "STUDENT",
        regNo: "IMPORT/001",
      },
    ],
    courses: [
      {
        key: "c",
        code: "IMP",
        title: "Import course",
        academicYear: "2026/2027",
        semester: 1,
        year: 2,
        program: "BSE",
        examinerEmail: "teacher@import.test",
      },
    ],
    enrollments: [{ studentEmail: "student@import.test", courseKey: "c" }],
    sessions: [],
  };
  assert.equal(validateDataset(base).enrollments.length, 1);
  assert.throws(
    () =>
      validateDataset({
        ...base,
        enrollments: [{ studentEmail: "missing@import.test", courseKey: "c" }],
      }),
    /Unmatched/,
  );
  assert.throws(
    () =>
      validateDataset({
        ...base,
        sessions: [
          {
            naturalKey: "x",
            courseKey: "c",
            startTime: "2026-11-11T12:00:00+03:00",
            endTime: "2026-11-11T11:00:00+03:00",
          },
        ],
      }),
    /Invalid dated/,
  );
});
