import { test, expect } from "@playwright/test";
import { PrismaClient } from "../../backend/node_modules/@prisma/client/index.js";
import { randomUUID } from "node:crypto";
let db, term, teacher, learner, peer, publication, plan, priorTerms;
const password = "SamsDemo2026!";
const suffix = String(Date.now()).slice(-5);
const codes = ["UIREQ" + suffix, "UIELE" + suffix];
test.beforeAll(async () => {
  const url = process.env.SAMS_E2E_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw Error("Course-plan tests require an isolated *_test database");
  db = new PrismaClient({ datasources: { db: { url } } });
  teacher = await db.user.findUniqueOrThrow({
    where: { email: "examiner@demo.sams.test" },
  });
  const template = await db.user.findUniqueOrThrow({
    where: { email: "student@demo.sams.test" },
  });
  priorTerms = await db.academicTerm.findMany();
  for (const t of priorTerms)
    await db.academicTerm.update({
      where: { id: t.id },
      data: {
        startsOn: new Date(Date.now() + 86400000 * 90),
        endsOn: new Date(Date.now() + 86400000 * 100),
      },
    });
  const year = new Date().getUTCFullYear();
  term = await db.academicTerm.create({
    data: {
      academicYear: `${year + 12}/${year + 13}`,
      semester: 2,
      startsOn: new Date(Date.now() - 86400000 * 2),
      endsOn: new Date(Date.now() + 86400000 * 20),
      excludedDates: [],
      sourceUrl: "https://example.test/approved",
      sourceNote: "Isolated browser course-plan term",
    },
  });
  for (const [i, name] of [
    "Course Plan Student",
    "Course Plan Peer",
  ].entries()) {
    const u = await db.user.create({
      data: {
        email: `ui-plan-${randomUUID()}@test.example`,
        name,
        regNo: `${year + 11}/BCS/${String(Date.now()).slice(-6)}${i}/PS`,
        role: "STUDENT",
        passwordHash: template.passwordHash,
        programmeCode: "BCS",
      },
    });
    if (i === 0) learner = u;
    else peer = u;
  }
  const rows = codes.concat("MUCOSA").map((code, i) => ({
    natural_key: "ui-plan:" + code,
    program_group: "BCS II",
    shared_with: [],
    course_code: code,
    course_title:
      code === "MUCOSA" ? "Student activity" : `Course Plan Subject ${i + 1}`,
    day: "Friday",
    start_time: "08:00",
    end_time: "10:00",
    time_slot: "08:00-10:00",
    lecturer: "Source Lecturer",
    room: "Library Teaching Room",
    session_type: "LECTURE",
  }));
  publication = await db.timetablePublication.create({
    data: {
      source: "bundled-reference",
      contentHash: randomUUID(),
      checkedAt: new Date(Date.now() + 3600000),
      metadata: { academic_year: term.academicYear, semester: "Semester 2" },
      rows,
    },
  });
});
test.afterAll(async () => {
  if (!db) return;
  try {
    if (term) {
      const plans = await db.coursePlan.findMany({
        where: { termId: term.id },
      });
      await db.studentCourseSetup.deleteMany({
        where: { planId: { in: plans.map((p) => p.id) } },
      });
      await db.coursePlanItem.deleteMany({
        where: { planId: { in: plans.map((p) => p.id) } },
      });
      await db.coursePlan.deleteMany({ where: { termId: term.id } });
      const courses = await db.course.findMany({
        where: { academicYear: term.academicYear, code: { in: codes } },
      });
      await db.enrollment.deleteMany({
        where: { courseId: { in: courses.map((c) => c.id) } },
      });
      await db.courseAudience.deleteMany({
        where: { courseId: { in: courses.map((c) => c.id) } },
      });
      await db.course.deleteMany({
        where: { id: { in: courses.map((c) => c.id) } },
      });
      await db.academicTerm.delete({ where: { id: term.id } });
    }
    const ids = [learner?.id, peer?.id].filter(Boolean);
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    if (publication)
      await db.timetablePublication.delete({ where: { id: publication.id } });
    for (const t of priorTerms || [])
      await db.academicTerm.update({
        where: { id: t.id },
        data: { startsOn: t.startsOn, endsOn: t.endsOn },
      });
  } finally {
    await db.$disconnect();
  }
});
async function login(page, email) {
  await page.goto("/login");
  await page
    .getByLabel("Email or registration number", { exact: true })
    .fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}
test("registrar publishes reviewed courses, student receives compulsory courses and confirms electives", async ({
  page,
}) => {
  await login(page, "admin@demo.sams.test");
  await page.getByRole("link", { name: "Course setup", exact: true }).click();
  await page.getByLabel("Reviewed term", { exact: true }).selectOption(term.id);
  await page.getByLabel("Programme", { exact: true }).selectOption("BCS");
  await page
    .getByLabel("Study year / track", { exact: true })
    .selectOption("BCS II");
  await expect(page.locator("#plan-version")).toContainText("No published");
  await page
    .getByRole("button", { name: "Load timetable courses", exact: true })
    .click();
  await expect(page.locator('[data-source-course="MUCOSA"]')).toBeDisabled();
  for (const code of codes) {
    await page.locator(`[data-source-course="${code}"]`).check();
    await page
      .locator(`[data-source-lecturer="${code}"]`)
      .selectOption(teacher.id);
  }
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Reviewed source courses and assigned teaching responsibility");
  await page
    .getByRole("button", { name: "Preview offering setup", exact: true })
    .click();
  await expect(page.locator("#source-review")).toContainText(
    "Course Plan Subject",
  );
  await page
    .getByLabel("Your current password", { exact: true })
    .fill(password);
  await page
    .getByRole("button", { name: "Create reviewed offerings", exact: true })
    .click();
  await expect(page.locator("[data-plan-course]")).toHaveCount(2);
  for (const n of await page.locator("[data-plan-course]").all())
    await n.check();
  const elective = await db.course.findUniqueOrThrow({
    where: {
      code_academicYear_semester_offeringKey: {
        offeringKey: "BCS",
        code: codes[1],
        academicYear: term.academicYear,
        semester: 2,
      },
    },
  });
  await page
    .locator(`[data-course-type="${elective.id}"]`)
    .selectOption("elective");
  await page
    .getByRole("button", { name: "Preview course list", exact: true })
    .click();
  await expect(page.locator("#plan-review")).toContainText("BCS II");
  await page
    .getByLabel("Your current password", { exact: true })
    .fill(password);
  await page
    .getByRole("button", { name: "Publish reviewed course list", exact: true })
    .click();
  await expect(page.locator("#plan-version")).toContainText(
    "Published version 1",
  );
  await page
    .getByRole("button", { name: "Preview student assignments", exact: true })
    .click();
  await expect(page.locator("#batch-review")).toContainText(peer.name);
  await page
    .getByLabel("Your current password", { exact: true })
    .fill(password);
  await page
    .getByRole("button", {
      name: "Assign courses to these students",
      exact: true,
    })
    .click();
  await expect(page.locator("#notice")).toContainText("students");
  await expect
    .poll(() => db.enrollment.count({ where: { studentId: peer.id } }))
    .toBe(1);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, learner.email);
  await page.getByRole("link", { name: "My courses", exact: true }).click();
  await expect(page.locator("#course-placement")).toContainText("BCS II");
  await expect(page.locator("#course-list article")).toHaveCount(2);
  await expect(page.locator("[data-course]:disabled")).toHaveCount(1);
  await page.locator(`[data-course="${elective.id}"]`).check();
  await page
    .getByRole("button", { name: "Confirm my courses", exact: true })
    .click();
  await expect(page.locator("#notice")).toContainText("confirmed");
  await expect
    .poll(() => db.enrollment.count({ where: { studentId: learner.id } }))
    .toBe(2);
  await page.reload();
  await expect(page.locator("#course-list article")).toHaveCount(2);
  expect(await db.enrollment.count({ where: { studentId: learner.id } })).toBe(
    2,
  );
});
