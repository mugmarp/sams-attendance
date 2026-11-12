import { prisma } from "../config/db.js";
import { digest, json, dateValue, audit } from "./academic.js";
import { minute } from "./timetable-source.js";
import { kampalaDay } from "./rules.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
const dayMs = 86400000;
const at = (date, minutes) =>
  new Date(Date.parse(date + "T00:00:00+03:00") + minutes * 60000);
const fields = (session) => ({
  startTime: session.startTime.toISOString(),
  endTime: session.endTime.toISOString(),
  room: session.room,
  sessionType: session.sessionType,
});
async function build(tx, input) {
  const [publication, term, course] = await Promise.all([
    tx.timetablePublication.findUnique({ where: { id: input.publicationId } }),
    tx.academicTerm.findUnique({ where: { id: input.termId } }),
    tx.course.findUnique({ where: { id: input.courseId } }),
  ]);
  if (!publication || !term || !course)
    throw new NotFoundError("Choose an existing source, term and offering");
  const row = publication.rows.find((r) => r.natural_key === input.sourceKey);
  if (!row)
    throw new ValidationError("The source entry was not found in this version");
  if (
    publication.metadata.academic_year &&
    publication.metadata.academic_year !== course.academicYear
  )
    throw new ValidationError(
      "The source academic year does not match the offering",
    );
  const declaredSemester = String(publication.metadata.semester || "").match(
    /^(?:Semester\s*)?([12])$/i,
  );
  if (declaredSemester && Number(declaredSemester[1]) !== course.semester)
    throw new ValidationError(
      "The source semester does not match the offering",
    );
  if (row.course_code.trim().toUpperCase() !== course.code.trim().toUpperCase())
    throw new ValidationError(
      "The source course code must match the selected offering",
    );
  if (
    course.academicYear !== term.academicYear ||
    course.semester !== term.semester
  )
    throw new ValidationError("Offering and academic term must match");
  if (
    input.from < dateValue(term.startsOn) ||
    input.to > dateValue(term.endsOn) ||
    input.from > input.to ||
    input.from < kampalaDay()
  )
    throw new ValidationError(
      "Choose current/future dates inside the reviewed term",
    );
  if ((Date.parse(input.to) - Date.parse(input.from)) / dayMs > 180)
    throw new ValidationError("Review at most 180 days per import");
  const startMinute = minute(input.startTime),
    endMinute = minute(input.endTime);
  if (startMinute === null || endMinute === null || endMinute <= startMinute)
    throw new ValidationError("Review a valid same-day class interval");
  const entries = await tx.timetableEntry.findMany({
    where: { courseId: course.id, termId: term.id },
  });
  const entry = input.entryId
    ? entries.find((e) => e.id === input.entryId)
    : null;
  if (input.entryId && !entry)
    throw new ValidationError(
      "The existing entry must belong to this offering and term",
    );
  if (
    entries.some((e) => e.id !== entry?.id && e.sourceKey === input.sourceKey)
  )
    throw new ConflictError(
      "This source entry is already linked; choose its existing entry",
    );
  if (
    entries.some(
      (e) =>
        e.id !== entry?.id &&
        e.weekday === input.weekday &&
        e.startMinute < endMinute &&
        startMinute < e.endMinute,
    )
  )
    throw new ConflictError(
      "Another weekly entry overlaps for this offering; review or reuse it explicitly",
    );
  const start = at(input.from, 0),
    end = at(input.to, 1440);
  const sessions = await tx.session.findMany({
    where: {
      courseId: course.id,
      startTime: { lt: end },
      endTime: { gt: start },
    },
    include: { _count: { select: { attendances: true, preparations: true } } },
    orderBy: { startTime: "asc" },
  });
  const excluded = new Set(term.excludedDates.map((item) => item.date));
  const dates = [];
  const warnings = [];
  const blockers = [];
  const items = [];
  for (
    let d = Date.parse(input.from + "T00:00:00Z");
    d <= Date.parse(input.to + "T00:00:00Z");
    d += dayMs
  ) {
    const value = new Date(d);
    const date = value.toISOString().slice(0, 10);
    const weekday = ((value.getUTCDay() + 6) % 7) + 1;
    if (weekday === input.weekday && !excluded.has(date)) {
      if (at(date, startMinute) > new Date()) dates.push(date);
      else
        warnings.push(
          date + ": already started; no retrospective class created",
        );
    }
  }
  const room = input.room?.trim() || null;
  for (const date of dates) {
    const desired = {
      startTime: at(date, startMinute).toISOString(),
      endTime: at(date, endMinute).toISOString(),
      room,
      sessionType: input.sessionType,
    };
    const existing = sessions.find(
      (s) =>
        s.timetableEntryId === entry?.id && dateValue(s.timetableDate) === date,
    );
    const overlap = sessions.find(
      (s) =>
        s.id !== existing?.id &&
        s.startTime < new Date(desired.endTime) &&
        s.endTime > new Date(desired.startTime),
    );
    if (overlap) {
      blockers.push(
        `${date}: overlaps existing class ${overlap.id}; no automatic adoption or duplicate is allowed`,
      );
      continue;
    }
    if (!existing) items.push({ action: "CREATE", date, ...desired });
    else if (digest(fields(existing)) === digest(desired))
      items.push({ action: "UNCHANGED", id: existing.id, date, ...desired });
    else if (
      existing.status !== "SCHEDULED" ||
      existing.startTime <= new Date() ||
      existing._count.attendances
    )
      items.push({
        action: "PROTECTED",
        id: existing.id,
        date,
        message: "Finalized, started or attended class retained",
      });
    else {
      items.push({ action: "UPDATE", id: existing.id, date, ...desired });
      if (existing._count.preparations)
        warnings.push(`${date}: prepared offline rosters will need refresh`);
    }
  }
  if (entry) {
    for (const old of sessions.filter(
      (s) =>
        s.timetableEntryId === entry.id &&
        !dates.includes(dateValue(s.timetableDate)),
    )) {
      if (
        old.status === "SCHEDULED" &&
        old.startTime > new Date() &&
        !old._count.attendances
      )
        items.push({
          action: "CANCEL",
          id: old.id,
          date: dateValue(old.timetableDate),
        });
      else if (old.status !== "CANCELLED")
        items.push({
          action: "PROTECTED",
          id: old.id,
          date: dateValue(old.timetableDate),
          message: "Historical/attended class retained",
        });
    }
    const timingChanged =
      entry.weekday !== input.weekday ||
      entry.startMinute !== startMinute ||
      entry.endMinute !== endMinute ||
      entry.room !== room ||
      entry.sessionType !== input.sessionType;
    if (timingChanged) {
      const outside = await tx.session.count({
        where: {
          timetableEntryId: entry.id,
          status: "SCHEDULED",
          startTime: { gt: new Date() },
          OR: [{ startTime: { lt: start } }, { startTime: { gte: end } }],
        },
      });
      if (outside)
        blockers.push(
          "Expand the review window to include all future generated classes before changing the weekly rule",
        );
    }
  }
  const entryData = {
    courseId: course.id,
    termId: term.id,
    publicationId: publication.id,
    sourceKey: input.sourceKey,
    weekday: input.weekday,
    startMinute,
    endMinute,
    room,
    sessionType: input.sessionType,
  };
  const baselineHash = digest({
    publication: publication.contentHash,
    term,
    course,
    entries,
    sessions,
  });
  return {
    baselineHash,
    plan: {
      entryId: entry?.id || null,
      entryData,
      source: row,
      course: {
        code: course.code,
        title: course.title,
        examinerId: course.examinerId,
      },
      items,
      warnings,
      blockers,
      summary: Object.fromEntries(
        ["CREATE", "UPDATE", "CANCEL", "UNCHANGED", "PROTECTED"].map(
          (action) => [
            action,
            items.filter((item) => item.action === action).length,
          ],
        ),
      ),
    },
  };
}
export async function previewTimetable(actor, input) {
  return prisma.$transaction(
    async (tx) => {
      const built = await build(tx, input);
      const review = await tx.timetableReview.create({
        data: {
          actorId: actor.userId,
          input: json(input),
          baselineHash: built.baselineHash,
          plan: json(built.plan),
          expiresAt: new Date(Date.now() + 15 * 60000),
        },
      });
      return { id: review.id, expiresAt: review.expiresAt, ...built.plan };
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
}
export async function applyTimetable(actor, id) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TimetableReview" WHERE id=${id} FOR UPDATE`;
      const review = await tx.timetableReview.findUnique({ where: { id } });
      if (!review) throw new NotFoundError("Review not found");
      if (review.actorId !== actor.userId)
        throw new ConflictError("Publish a review made by your own account");
      if (review.appliedAt)
        return { id: review.id, replayed: true, plan: review.plan };
      if (review.expiresAt <= new Date())
        throw new ConflictError(
          "Review expired; preview the current data again",
        );
      await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${review.input.courseId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Session" WHERE "courseId"=${review.input.courseId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "AcademicTerm" WHERE id=${review.input.termId} FOR UPDATE`;
      const built = await build(tx, review.input);
      if (built.baselineHash !== review.baselineHash)
        throw new ConflictError(
          "Timetable, calendar, offering or class state changed; preview again",
        );
      if (built.plan.blockers.length)
        throw new ConflictError("Resolve all preview blockers before applying");
      const { entryData, entryId, items } = built.plan;
      const entry = entryId
        ? await tx.timetableEntry.update({
            where: { id: entryId },
            data: { ...entryData, version: { increment: 1 } },
          })
        : await tx.timetableEntry.create({ data: entryData });
      for (const item of items) {
        if (item.action === "CREATE")
          await tx.session.create({
            data: {
              naturalKey: `timetable:${entry.id}:${item.date}`,
              timetableEntryId: entry.id,
              timetableDate: new Date(item.date + "T00:00:00Z"),
              courseId: entry.courseId,
              startTime: new Date(item.startTime),
              endTime: new Date(item.endTime),
              room: item.room,
              sessionType: item.sessionType,
            },
          });
        if (item.action === "UPDATE")
          await tx.session.update({
            where: { id: item.id },
            data: {
              startTime: new Date(item.startTime),
              endTime: new Date(item.endTime),
              room: item.room,
              sessionType: item.sessionType,
              version: { increment: 1 },
              checkinSecret: null,
              checkinStartedAt: null,
              checkinClosesAt: null,
            },
          });
        if (item.action === "CANCEL")
          await tx.session.update({
            where: { id: item.id },
            data: {
              status: "CANCELLED",
              version: { increment: 1 },
              checkinSecret: null,
              checkinStartedAt: null,
              checkinClosesAt: null,
            },
          });
      }
      await tx.timetableReview.update({
        where: { id },
        data: { appliedAt: new Date() },
      });
      await audit(
        tx,
        actor.userId,
        "TIMETABLE_APPLIED",
        "TimetableEntry",
        entry.id,
        undefined,
        { reviewId: id, ...built.plan },
        review.input.reason,
      );
      return { id, replayed: false, entryId: entry.id, plan: built.plan };
    },
    { timeout: 20000, maxWait: 10000 },
  );
}
