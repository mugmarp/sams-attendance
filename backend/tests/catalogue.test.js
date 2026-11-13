import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registration,
  suggestedYear,
  parseGroup,
  matchesGroup,
  profileData,
  selectableGroup,
} from "../src/services/catalogue.js";
import { weeklyEvents, referenceInTerm } from "../src/services/student-day.js";
import { dayModel, eventProgress } from "../../frontend/public/js/day-model.js";
test("registration preserves zeroes, derives student email and suggests academic-year placement without promoting records", () => {
  const reg = registration(" 2025/bse/080/ps ");
  assert.equal(reg.normalized, "2025/BSE/080/PS");
  assert.equal(reg.emailSuggestion, "2025bse080@sdt.must.ac.ug");
  assert.equal(suggestedYear(reg, "2026/2027"), 2);
  assert.equal(suggestedYear(registration("2026/BSE/108/PS"), "2026/2027"), 1);
  assert.equal(suggestedYear(registration("2024/BSE/108/PS"), "2026/2027"), 3);
  assert.equal(
    suggestedYear(registration("2020/BSE/108/PS"), "2026/2027"),
    null,
  );
  assert.equal(registration("2025/BSE/not-a-number/PS"), null);
  assert.throws(() =>
    profileData({ regNo: "2025/BSE/108/PS", programmeCode: "BIT", year: 2 }),
  );
  const repeat = profileData({
    regNo: "2025/BSE/108/PS",
    programmeCode: "BSE",
    year: 1,
    studyGroupKey: "BSE I",
    studyAcademicYear: "2026/2027",
  });
  assert.equal(repeat.year, 1);
});
test("programme tracks and shared audiences do not collapse every programme into one basket", () => {
  assert.equal(parseGroup("CIV II").programmeCode, "CVE");
  assert.equal(parseGroup("ACCOUNTING").key, "BBA ACCOUNTING III");
  assert.equal(
    selectableGroup({ programmeCode: "BGWH", studyYear: 1, track: "" }),
    false,
  );
  assert.equal(
    selectableGroup({ programmeCode: "BBA", studyYear: 3, track: "" }),
    false,
  );
  const row = { program_group: "ACCOUNTING", shared_with: ["BSE II"] };
  assert.equal(matchesGroup(row, "BSE II"), true);
  assert.equal(matchesGroup(row, "BBA MARKETING III"), false);
  assert.equal(matchesGroup(row, "BSE III"), false);
  assert.equal(
    matchesGroup({ program_group: "BBA III" }, "BBA ACCOUNTING III"),
    true,
  );
  assert.equal(parseGroup("Simulation Practicals"), null);
});
test("weekly duplicates collapse only when course, interval, room and lecturer agree", () => {
  const row = {
    natural_key: "a",
    program_group: "BSE II",
    shared_with: ["BCS II"],
    course_code: "SWE2106",
    course_title: "Web",
    day: "Thursday",
    time_slot: "08:00-09:00",
    start_time: "08:00",
    end_time: "10:00",
    room: "FCI L4",
    lecturer: "Lecturer",
  };
  const rows = [
    row,
    {
      ...row,
      natural_key: "b",
      program_group: "BCS II",
      shared_with: ["BSE II"],
    },
  ];
  const events = weeklyEvents(rows, "BSE II", new Date("2026-11-12T04:00:00Z"));
  assert.equal(
    events.filter((e) => e.startTime === "2026-11-12T05:00:00.000Z").length,
    1,
  );
  assert.equal(events[0].operatorReviewed, true);
  assert.equal(
    weeklyEvents(
      [...rows, { ...row, natural_key: "c", room: "Other room" }],
      "BSE II",
      new Date("2026-11-12T04:00:00Z"),
    ).length,
    4,
  );
});
test("current target is automatic at inclusive start and exclusive end; overlap is explicit and reference cannot authorize check-in", () => {
  const row = {
      id: "a",
      startTime: "2026-11-12T05:00:00Z",
      endTime: "2026-11-12T07:00:00Z",
    },
    start = Date.parse(row.startTime);
  assert.equal(dayModel([row], [], start).target.id, "a");
  assert.equal(dayModel([row], [], Date.parse(row.endTime)).target, null);
  assert.equal(dayModel([row, { ...row, id: "b" }], [], start).conflict, true);
  assert.equal(dayModel([row, { ...row, id: "b" }], [], start).target, null);
  assert.equal(
    dayModel([], [{ ...row, kind: "REFERENCE" }], start).target,
    null,
  );
  assert.equal(eventProgress(row, start + 3600000).percent, 50);
});

test("BCS intake placement respects its three-year duration", () => {
  assert.equal(suggestedYear(registration("2025/BCS/199/PS"), "2026/2027"), 2);
  assert.equal(suggestedYear(registration("2024/BCS/199/PS"), "2026/2027"), 3);
  assert.equal(
    suggestedYear(registration("2023/BCS/199/PS"), "2026/2027"),
    null,
  );
});
test("weekly references require matching academic year and in-term Kampala date", () => {
  const term = {
    academicYear: "2026/2027",
    lecturesBegin: "2026-08-17",
    semesterEnds: "2026-12-12",
  };
  assert.equal(
    referenceInTerm({ academic_year: "2026/2027" }, term, "2026-11-13"),
    true,
  );
  assert.equal(
    referenceInTerm({ academic_year: "2025/2026" }, term, "2026-11-13"),
    false,
  );
  assert.equal(
    referenceInTerm({ academic_year: "2026/2027" }, term, "2026-12-13"),
    false,
  );
});

test("next up is chronological and a matching dated class wins over its reference", () => {
  const now = Date.parse("2026-11-13T07:30:00Z");
  const reference = {
    id: "reference",
    kind: "REFERENCE",
    startTime: "2026-11-13T08:00:00Z",
    endTime: "2026-11-13T10:00:00Z",
  };
  const later = {
    id: "later",
    kind: "DATED",
    startTime: "2026-11-19T07:00:00Z",
    endTime: "2026-11-19T10:00:00Z",
  };
  assert.equal(dayModel([later], [reference], now).next.id, "reference");
  assert.equal(
    dayModel(
      [{ ...reference, id: "dated", kind: "DATED" }, later],
      [reference],
      now,
    ).next.id,
    "dated",
  );
  assert.equal(dayModel([], [reference], now).target, null);
});
