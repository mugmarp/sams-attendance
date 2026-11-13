import { prisma } from "../config/db.js";
import {
  registration,
  suggestedYear,
  programmes,
  parseGroup,
  selectableGroup,
  ROMAN,
} from "./catalogue.js";
import { kampalaDay } from "./rules.js";
import { audit, dateValue, enrollmentCovers } from "./academic.js";
import {
  ValidationError,
  ForbiddenError,
  ConflictError,
} from "../utils/errors.js";

// Intake supplies a default. A confirmed placement in this academic year wins.
export function resolvePlacement(user, term) {
  const reg = registration(user.regNo);
  if (!reg || !programmes.has(reg.programmeCode))
    return {
      status: "PLACEMENT_REVIEW",
      message: "Ask the registrar to confirm your registration and programme.",
    };
  if (user.programmeCode && user.programmeCode !== reg.programmeCode)
    return {
      status: "PLACEMENT_REVIEW",
      message:
        "Your registration and programme placement disagree. Contact the registrar.",
    };
  let year, groupKey;
  if (user.studyAcademicYear === term.academicYear && user.studyGroupKey) {
    const group = parseGroup(user.studyGroupKey);
    if (
      !group ||
      !selectableGroup(group) ||
      group.programmeCode !== reg.programmeCode ||
      group.studyYear !== user.year
    )
      return {
        status: "PLACEMENT_REVIEW",
        message: "Your confirmed academic placement needs registrar review.",
      };
    year = group.studyYear;
    groupKey = group.key;
  } else {
    // Never silently promote an unexplained repeat/transfer placement from a prior term.
    if (
      user.studyAcademicYear &&
      user.studyAcademicYear !== term.academicYear &&
      user.year &&
      user.year !== suggestedYear(reg, user.studyAcademicYear)
    )
      return {
        status: "PLACEMENT_REVIEW",
        message:
          "Ask the registrar to carry forward your exceptional academic placement.",
      };
    year = suggestedYear(reg, term.academicYear);
    if (!year)
      return {
        status: "PLACEMENT_REVIEW",
        message:
          "Your intake is outside the programme's normal duration. Ask the registrar to confirm your study year.",
      };
    const group = parseGroup(`${reg.programmeCode} ${ROMAN[year]}`);
    if (!group || !selectableGroup(group))
      return {
        status: "PLACEMENT_REVIEW",
        message:
          "Your programme requires a confirmed study track. Contact the registrar.",
      };
    groupKey = group.key;
  }
  return {
    status: "RESOLVED",
    programmeCode: reg.programmeCode,
    year,
    groupKey,
    admissionYear: reg.admissionYear,
    sponsorshipCode: reg.sponsorshipCode,
  };
}
export async function currentTerm(tx, now = new Date()) {
  const day = new Date(kampalaDay(now) + "T00:00:00Z");
  const terms = await tx.academicTerm.findMany({
    where: { startsOn: { lte: day }, endsOn: { gte: day } },
    take: 2,
  });
  if (terms.length !== 1) return null;
  return terms[0];
}
export function validPlanCourse(course, group, term) {
  return (
    !course.isPractice &&
    !course.code.endsWith("-P") &&
    course.academicYear === term.academicYear &&
    course.semester === term.semester &&
    course.examiner?.isActive &&
    course.examiner?.role === "EXAMINER" &&
    (course.audiences.length
      ? course.audiences.some((a) => a.groupKey === group.key)
      : course.programmeCode === group.programmeCode &&
        course.year === group.studyYear)
  );
}
export const planInclude = {
  term: true,
  group: true,
  items: {
    include: {
      course: {
        include: {
          audiences: true,
          examiner: { select: { isActive: true, role: true } },
        },
      },
    },
    orderBy: { courseId: "asc" },
  },
};

// Caller may supply a transaction for an atomic registrar batch.
export async function setupStudent(tx, studentId, options = {}) {
  const {
    now = new Date(),
    confirm = false,
    electives = [],
    actorId = studentId,
    reason = "Automatic assignment from the published programme course plan",
  } = options;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${studentId} FOR UPDATE`;
  const user = await tx.user.findUniqueOrThrow({ where: { id: studentId } });
  if (user.role !== "STUDENT" || !user.isActive)
    throw new ForbiddenError("Only active students can set up courses");
  if (user.mustChangePassword && actorId === studentId)
    return {
      status: "PASSWORD_CHANGE_REQUIRED",
      message: "Change your temporary password before setting up courses.",
      courses: [],
    };
  const term = await currentTerm(tx, now);
  if (!term)
    return {
      status: "TERM_PENDING",
      message:
        "The registrar must configure one current academic term before automatic course setup.",
      courses: [],
    };
  const placement = resolvePlacement(user, term);
  if (placement.status !== "RESOLVED") return { ...placement, courses: [] };
  const planIdentity = await tx.coursePlan.findUnique({
    where: {
      termId_groupKey: { termId: term.id, groupKey: placement.groupKey },
    },
    select: { id: true },
  });
  if (!planIdentity)
    return {
      status: "PLAN_PENDING",
      message:
        "Your programme's course list is awaiting registrar publication.",
      placement,
      courses: [],
    };
  await tx.$queryRaw`SELECT id FROM "CoursePlan" WHERE id=${planIdentity.id} FOR SHARE`;
  const plan = await tx.coursePlan.findUniqueOrThrow({
    where: { id: planIdentity.id },
    include: planInclude,
  });
  if (
    !plan.published ||
    !plan.items.length ||
    plan.items.some((i) => !validPlanCourse(i.course, plan.group, term))
  )
    return {
      status: "PLAN_PENDING",
      message: "Your programme's course list needs registrar review.",
      placement,
      courses: [],
    };
  if (
    options.expectedPlanId &&
    (options.expectedPlanId !== plan.id ||
      options.expectedVersion !== plan.version)
  )
    throw new ConflictError(
      "The course list changed. Reload it before confirming.",
    );
  const optional = new Set(
    plan.items.filter((i) => !i.compulsory).map((i) => i.courseId),
  );
  if (electives.some((id) => !optional.has(id)))
    throw new ValidationError(
      "Choose electives only from your published programme course list",
    );
  const profile = {
    programmeCode: placement.programmeCode,
    program: placement.programmeCode,
    year: placement.year,
    studyGroupKey: placement.groupKey,
    studyAcademicYear: term.academicYear,
    studySemester: term.semester,
    admissionYear: placement.admissionYear,
    sponsorshipCode: placement.sponsorshipCode,
  };
  if (Object.entries(profile).some(([k, v]) => user[k] !== v)) {
    await tx.user.update({ where: { id: studentId }, data: profile });
    await audit(
      tx,
      actorId,
      "ACADEMIC_PLACEMENT_RESOLVED",
      "User",
      studentId,
      { groupKey: user.studyGroupKey, academicYear: user.studyAcademicYear },
      profile,
      reason,
    );
  }
  const selected = plan.items.filter(
    (i) => i.compulsory || (confirm && electives.includes(i.courseId)),
  );
  const effectiveFrom = new Date(kampalaDay(now) + "T00:00:00Z");
  const effectiveUntil = new Date(term.endsOn.getTime() + 86400000);
  let inserted = 0;
  for (const item of selected) {
    // An existing row, including a withdrawal, is an explicit retained decision.
    const existing = await tx.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: item.courseId } },
    });
    if (existing) continue;
    const enrollment = await tx.enrollment.create({
      data: {
        studentId,
        courseId: item.courseId,
        effectiveFrom,
        effectiveUntil,
        origin: item.compulsory ? "COURSE_PLAN" : "ELECTIVE_CONFIRMATION",
      },
    });
    inserted++;
    await audit(
      tx,
      actorId,
      "COURSE_PLAN_ENROLLMENT",
      "Enrollment",
      enrollment.id,
      null,
      {
        studentId,
        courseId: item.courseId,
        planId: plan.id,
        planVersion: plan.version,
        effectiveFrom: dateValue(effectiveFrom),
        effectiveUntil: dateValue(effectiveUntil),
      },
      reason,
    );
  }
  const previous = await tx.studentCourseSetup.findUnique({
    where: { studentId_planId: { studentId, planId: plan.id } },
  });
  const confirmedAt = confirm
    ? now
    : previous?.planVersion === plan.version
      ? previous.confirmedAt
      : null;
  if (!previous || previous.planVersion !== plan.version || confirm) {
    await tx.studentCourseSetup.upsert({
      where: { studentId_planId: { studentId, planId: plan.id } },
      create: {
        studentId,
        planId: plan.id,
        planVersion: plan.version,
        confirmedAt,
      },
      update: { planVersion: plan.version, confirmedAt },
    });
    if (confirm)
      await audit(
        tx,
        actorId,
        "COURSE_LIST_CONFIRMED",
        "CoursePlan",
        plan.id,
        null,
        { studentId, planVersion: plan.version, electives },
        "Student confirmed the published course list",
      );
  }
  const existing = await tx.enrollment.findMany({
    where: { studentId, courseId: { in: plan.items.map((i) => i.courseId) } },
  });
  return {
    status: "READY",
    message:
      "Your compulsory courses are assigned. Report incorrect placement to the registrar.",
    placement,
    term: { academicYear: term.academicYear, semester: term.semester },
    planId: plan.id,
    version: plan.version,
    reviewNote: plan.reviewNote,
    confirmedAt,
    inserted,
    courses: plan.items.map((i) => {
      const e = existing.find((e) => e.courseId === i.courseId);
      return {
        id: i.courseId,
        code: i.course.code,
        title: i.course.title,
        compulsory: i.compulsory,
        enrolled: !!e && enrollmentCovers(e, now),
        recordExists: !!e,
        effectiveFrom: dateValue(e?.effectiveFrom),
        effectiveUntil: dateValue(e?.effectiveUntil),
      };
    }),
  };
}
export async function ensureStudentCourses(studentId, options = {}) {
  return prisma.$transaction((tx) => setupStudent(tx, studentId, options), {
    timeout: 20000,
  });
}
