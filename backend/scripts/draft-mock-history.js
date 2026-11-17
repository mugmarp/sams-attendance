import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { currentTerm } from "../src/services/course-setup.js";
import { kampalaDay } from "../src/services/rules.js";
import { dateValue, digest } from "../src/services/academic.js";
import { inspectRow, DAYS } from "../src/services/timetable-source.js";
const [directory] = process.argv.slice(2);
if (!directory)
  throw Error(
    "Usage: node scripts/draft-mock-history.js NEW_PRIVATE_DIRECTORY",
  );
const db = new PrismaClient();
try {
  const term = await currentTerm(db);
  if (!term) throw Error("One reviewed current term is required");
  const publication = await db.timetablePublication.findFirst({
    orderBy: { importedAt: "desc" },
  });
  if (!publication) throw Error("A stored timetable publication is required");
  const courses = await db.course.findMany({
    where: {
      isPractice: false,
      academicYear: term.academicYear,
      semester: term.semester,
      programmeCode: { in: ["BSE", "BCS", "BIT", "BBA", "BME"] },
      examiner: { isActive: true, dataOrigin: "SYNTHETIC" },
    },
    include: { audiences: true, enrollments: { include: { student: true } } },
    orderBy: { id: "asc" },
  });
  const yesterday = new Date(kampalaDay() + "T00:00:00Z");
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const to = [dateValue(yesterday), dateValue(term.endsOn)].sort()[0],
    from = dateValue(term.startsOn);
  const excluded = new Set(term.excludedDates.map((d) => d.date));
  fs.mkdirSync(directory, { mode: 0o700 });
  const summary = [];
  for (const c of courses) {
    const groups = c.audiences.map((a) => a.groupKey);
    const students = c.enrollments
      .map((e) => e.student)
      .filter(
        (u) =>
          u.isActive &&
          u.dataOrigin === "SYNTHETIC" &&
          u.studyAcademicYear === term.academicYear &&
          u.studySemester === term.semester &&
          (groups.length
            ? groups.includes(u.studyGroupKey)
            : u.programmeCode === c.programmeCode && u.year === c.year),
      );
    if (!students.length) continue;
    const candidates = publication.rows.filter(
      (r) =>
        r.course_code === c.code &&
        [r.program_group, ...(r.shared_with || [])].some((g) =>
          groups.includes(g),
        ),
    );
    // This explicit simulation rule applies only to historical practice data.
    // It never changes the source publication or the normal timetable importer.
    const trainingRows = candidates.map((row) => ({
      ...row,
      originalSessionType: row.session_type,
      session_type:
        row.session_type == null || row.session_type === "THEORY"
          ? "LECTURE"
          : row.session_type,
    }));
    const weekly = [
      ...new Map(
        trainingRows
          .filter(
            (r) =>
              !inspectRow(r).issues.some((i) =>
                [
                  "UNKNOWN_DAY",
                  "INVALID_INTERVAL",
                  "CLASS_TYPE_REQUIRES_REVIEW",
                ].includes(i),
              ),
          )
          .map((r) => [
            `${r.day}:${r.start_time}:${r.end_time}:${r.room}:${r.session_type}`,
            r,
          ]),
      ).values(),
    ];
    const sessions = [];
    for (
      let day = new Date(from + "T00:00:00Z");
      dateValue(day) <= to;
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      const date = dateValue(day);
      if (excluded.has(date)) continue;
      for (const row of weekly.filter(
        (r) => DAYS.indexOf(r.day) === (day.getUTCDay() + 6) % 7,
      )) {
        const info = inspectRow(row),
          base = Date.parse(date + "T00:00:00+03:00");
        const key =
          date +
          ":" +
          digest([
            row.day,
            row.start_time,
            row.end_time,
            row.room,
            row.session_type,
          ]).slice(0, 16);
        sessions.push({
          key,
          startTime: new Date(base + info.startMinute * 60000).toISOString(),
          endTime: new Date(base + info.endMinute * 60000).toISOString(),
          room:
            row.room && !/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(row.room)
              ? row.room
              : null,
          sessionType: row.session_type.toUpperCase(),
          status:
            parseInt(digest(c.id + key).slice(0, 4), 16) % 23 === 0
              ? "CANCELLED"
              : "COMPLETED",
        });
      }
    }
    sessions.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
    const overlaps = sessions.some(
      (s, i) =>
        i && Date.parse(sessions[i - 1].endTime) > Date.parse(s.startTime),
    );
    if (
      !sessions.length ||
      sessions.length > 100 ||
      students.length > 50 ||
      overlaps
    ) {
      summary.push({
        course: c.code,
        programme: c.programmeCode,
        year: c.year,
        skipped: true,
        reason:
          "Missing, excessive or overlapping source intervals require review",
      });
      continue;
    }
    const manifest = {
      batchKey: "history:" + c.id + ":" + from + ":" + to,
      termId: term.id,
      sourceCourseId: c.id,
      studentIds: students.map((u) => u.id).sort(),
      from,
      to,
      sourceNote:
        "Synthetic reconstruction from timetable publication " +
        publication.id +
        " hash " +
        publication.contentHash +
        ". Uses explicit start/end fields; source grid labels may disagree. Missing class types and THEORY are represented as LECTURE only in this synthetic dataset. Cancelled classes and all marks are simulated, not verified past teaching or attendance.",
      sessions,
    };
    const filename = path.join(directory, c.id + ".json");
    fs.writeFileSync(filename, JSON.stringify(manifest, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    summary.push({
      course: c.code,
      programme: c.programmeCode,
      year: c.year,
      students: students.length,
      sessions: sessions.length,
      filename,
      sourceIssues: [
        ...new Set(
          weekly.flatMap((r) => [
            ...inspectRow({ ...r, session_type: r.originalSessionType }).issues,
            ...(r.originalSessionType !== r.session_type
              ? ["MOCK_LECTURE_DEFAULT"]
              : []),
          ]),
        ),
      ],
    });
  }
  console.log(
    JSON.stringify(
      { from, to, publication: publication.id, offerings: summary },
      null,
      2,
    ),
  );
} finally {
  await db.$disconnect();
}
