import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePlacement } from "../src/services/course-setup.js";
import { weeklyEvents } from "../src/services/student-day.js";
const term = { academicYear: "2026/2027", semester: 1 };
test("course placement follows intake and honours current-year repeat/track overrides", () => {
  assert.equal(
    resolvePlacement({ regNo: "2025/BCS/199/PS" }, term).groupKey,
    "BCS II",
  );
  assert.equal(
    resolvePlacement({ regNo: "2024/BCS/199/PS" }, term).groupKey,
    "BCS III",
  );
  assert.equal(
    resolvePlacement({ regNo: "2023/BCS/199/PS" }, term).status,
    "PLACEMENT_REVIEW",
  );
  assert.equal(
    resolvePlacement(
      {
        regNo: "2025/BCS/199/PS",
        studyAcademicYear: "2026/2027",
        year: 1,
        studyGroupKey: "BCS I",
      },
      term,
    ).groupKey,
    "BCS I",
  );
  assert.equal(
    resolvePlacement({ regNo: "2025/BCS/199/PS", programmeCode: "BSE" }, term)
      .status,
    "PLACEMENT_REVIEW",
  );
  assert.equal(
    resolvePlacement({ regNo: "2024/BBA/199/PS" }, term).status,
    "PLACEMENT_REVIEW",
  );
  assert.equal(
    resolvePlacement(
      {
        regNo: "2025/BCS/199/PS",
        studyAcademicYear: "2025/2026",
        year: 2,
        studyGroupKey: "BCS II",
      },
      term,
    ).status,
    "PLACEMENT_REVIEW",
  );
});
test("Kampala weekly 08:00 classes are the same UTC instants across host timezones", () => {
  const old = process.env.TZ;
  try {
    for (const tz of ["UTC", "Africa/Kampala", "America/New_York"]) {
      process.env.TZ = tz;
      const events = weeklyEvents(
        [
          {
            natural_key: "zone:test",
            program_group: "BCS II",
            shared_with: [],
            course_code: "CSC2101",
            course_title: "Algorithms",
            day: "Friday",
            start_time: "08:00",
            end_time: "10:00",
            time_slot: "08:00-10:00",
            lecturer: "Assigned",
            room: "Room",
            session_type: "LECTURE",
          },
        ],
        "BCS II",
        new Date("2026-11-13T00:30:00Z"),
      );
      assert.equal(events[0].startTime, "2026-11-13T05:00:00.000Z");
      assert.equal(events[0].endTime, "2026-11-13T07:00:00.000Z");
    }
  } finally {
    if (old === undefined) delete process.env.TZ;
    else process.env.TZ = old;
  }
});

test("source course candidates reject lecturer labels, malformed codes and contradictory group titles", async () => {
  const { courseCandidates } = await import("../src/services/course-source.js");
  const base = {
    program_group: "BCS II",
    shared_with: [],
    day: "Friday",
    start_time: "08:00",
    end_time: "10:00",
    time_slot: "08:00-10:00",
    lecturer: "Assigned",
    room: "Room",
    session_type: "LECTURE",
  };
  const rows = [
    { ...base, course_code: "NSAMBU", course_title: "Staff label" },
    { ...base, course_code: "MUCOSA", course_title: "Activity" },
    {
      ...base,
      course_code: "CSC2101/CSC2101",
      course_title: "Malformed repeat",
    },
    { ...base, course_code: "CSC2101", course_title: "Subject A" },
    { ...base, course_code: "CSC2101", course_title: "Subject B" },
    { ...base, course_code: "CSC2102", course_title: "Valid subject" },
    {
      ...base,
      program_group: "BIT II",
      course_code: "CSC2102",
      course_title: "Different programme subject",
    },
  ];
  const result = courseCandidates(rows, "BCS II");
  assert.deepEqual(
    result.filter((c) => !c.blocked).map((c) => c.code),
    ["CSC2102"],
  );
  assert.ok(
    result
      .find((c) => c.code === "CSC2101")
      .issues.includes("COURSE_TITLE_CONFLICT"),
  );
});
