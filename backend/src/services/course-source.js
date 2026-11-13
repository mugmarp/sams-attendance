import { matchesGroup } from "./catalogue.js";
import { inspectRow } from "./timetable-source.js";

// Source labels are references, not an approved curriculum. Reject activities,
// malformed codes and contradictory titles within the selected programme group.
export function courseCandidates(allRows, groupKey) {
  const rows = allRows.filter((r) => matchesGroup(r, groupKey));
  return [...new Set(rows.map((r) => r.course_code))].sort().map((code) => {
    const rs = rows.filter((r) => r.course_code === code);
    const titleConflict =
      new Set(
        rs.map((r) =>
          String(r.course_title).trim().replace(/\s+/g, " ").toUpperCase(),
        ),
      ).size > 1;
    return {
      code,
      title: rs[0].course_title,
      sourceLecturers: [...new Set(rs.map((r) => r.lecturer))],
      rows: rs.length,
      blocked: !/^[A-Z]{2,8}[0-9]{3,5}$/.test(code) || titleConflict,
      issues: [
        ...new Set([
          ...rs.flatMap((r) => inspectRow(r).issues),
          ...(titleConflict ? ["COURSE_TITLE_CONFLICT"] : []),
        ]),
      ],
    };
  });
}
