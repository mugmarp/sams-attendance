import { prisma } from "../config/db.js";
import {
  latestPublication,
  inspectRow,
  calendarReference,
} from "./timetable-source.js";
import {
  parseGroup,
  matchesGroup,
  ROMAN,
  selectableGroup,
} from "./catalogue.js";
import { enrollmentCovers } from "./academic.js";
import { sessionDTO } from "./attendance.js";
import { kampalaDay } from "./rules.js";
// Exact intervals confirmed by the operator on 12 Nov 2026; not institutional calendar approval.
const reviewedThursday = {
  SWE2106: ["08:00", "10:00"],
  SWE2103: ["10:00", "13:00"],
  SWE2104: ["14:00", "17:00"],
};
export function deduplicateReference(rows, group) {
  const selected = rows.filter((r) => matchesGroup(r, group)),
    seen = new Map();
  for (const row of selected) {
    const inspected = inspectRow(row);
    if (inspected.issues.includes("INVALID_INTERVAL") || !inspected.weekday)
      continue;
    const signature = [
      row.course_code,
      row.day,
      row.start_time,
      row.end_time,
      row.room || "",
      row.lecturer || "",
    ]
      .map((v) => String(v).trim().toUpperCase())
      .join("|");
    if (
      !seen.has(signature) ||
      row.program_group.toUpperCase() === group.toUpperCase()
    )
      seen.set(signature, row);
  }
  return [...seen.values()];
}
export function confirmedInterval(row, group) {
  return (
    group === "BSE II" &&
    row.day === "Thursday" &&
    reviewedThursday[row.course_code]?.[0] === row.start_time &&
    reviewedThursday[row.course_code]?.[1] === row.end_time
  );
}
export function weeklyEvents(rows, group, now = new Date()) {
  const selected = deduplicateReference(rows, group);
  const today = kampalaDay(now),
    events = [];
  for (let n = 0; n <= 7; n++) {
    const date = new Date(Date.parse(today + "T00:00:00Z") + n * 86400000)
        .toISOString()
        .slice(0, 10),
      weekday = new Date(date + "T12:00:00+03:00").getUTCDay() || 7;
    for (const row of selected) {
      const issue = inspectRow(row);
      if (issue.weekday !== weekday) continue;
      const operatorReviewed = confirmedInterval(row, group);
      events.push({
        key: row.natural_key + ":" + date,
        sourceKey: row.natural_key,
        courseCode: row.course_code,
        courseTitle: row.course_title,
        startTime:
          new Date(date + "T00:00:00+03:00").getTime() +
          issue.startMinute * 60000,
        endTime:
          new Date(date + "T00:00:00+03:00").getTime() +
          issue.endMinute * 60000,
        room: row.room,
        lecturer: row.lecturer,
        kind: "REFERENCE",
        operatorReviewed,
        timeReviewRequired:
          issue.issues.includes("TIME_FIELDS_DISAGREE") && !operatorReviewed,
        issues: issue.issues,
      });
    }
  }
  return events
    .sort(
      (a, b) =>
        a.startTime - b.startTime || a.courseCode.localeCompare(b.courseCode),
    )
    .map((e) => ({
      ...e,
      startTime: new Date(e.startTime).toISOString(),
      endTime: new Date(e.endTime).toISOString(),
    }));
}
export async function studentDay(studentId) {
  const now = new Date(),
    user = await prisma.user.findUniqueOrThrow({
      where: { id: studentId },
      include: { programme: { include: { faculty: true } }, studyGroup: true },
    });
  const classes = await prisma.session.findMany({
    where: {
      course: { enrollments: { some: { studentId } } },
      endTime: { gt: now },
      startTime: { lt: new Date(now.getTime() + 14 * 86400000) },
      status: "SCHEDULED",
    },
    include: {
      course: { include: { enrollments: { where: { studentId } } } },
      attendances: { where: { studentId }, select: { status: true } },
    },
    orderBy: { startTime: "asc" },
    take: 100,
  });
  const group =
    user.studyGroupKey ||
    ((user.programmeCode || user.program) && ROMAN[user.year]
      ? `${user.programmeCode || user.program} ${ROMAN[user.year]}`
      : null);
  const parsed = group && parseGroup(group),
    complete = parsed && selectableGroup(parsed),
    publication = await latestPublication();
  const metadata = publication.metadata;
  const reference = await calendarReference(),
    civilDay = kampalaDay(now);
  const withinReference =
    metadata.academic_year !== reference.academicYear ||
    (civilDay >= reference.lecturesBegin && civilDay <= reference.semesterEnds);
  const compatible =
    withinReference &&
    (!user.studyAcademicYear ||
      user.studyAcademicYear === metadata.academic_year) &&
    (!user.studySemester ||
      !metadata.semester ||
      String(metadata.semester).endsWith(String(user.studySemester)));
  return {
    now: now.toISOString(),
    timeZone: "Africa/Kampala",
    profile: {
      name: user.name,
      regNo: user.regNo,
      email: user.email,
      programme: user.programme,
      year: user.year,
      admissionYear: user.admissionYear,
      sponsorshipCode: user.sponsorshipCode,
      studyGroupKey: complete ? group : null,
      academicYear: user.studyAcademicYear,
      semester: user.studySemester,
      needsPlacementReview: !complete,
    },
    classes: classes
      .filter((s) => enrollmentCovers(s.course.enrollments[0], s.startTime))
      .map((s) => ({
        ...sessionDTO(s),
        checkedIn: s.attendances.some((a) =>
          ["PRESENT", "LATE"].includes(a.status),
        ),
        kind: "DATED",
      })),
    weekly: {
      publicationId: publication.id,
      checkedAt: publication.checkedAt,
      metadata,
      compatible,
      events:
        complete && compatible
          ? weeklyEvents(publication.rows, group, now)
          : [],
      notice:
        "Weekly reference is planned information. It does not open check-in or prove enrollment.",
    },
  };
}
