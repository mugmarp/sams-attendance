import { test, expect } from "@playwright/test";
import { PrismaClient } from "../../backend/node_modules/@prisma/client/index.js";
import { randomUUID } from "node:crypto";
const apiURL = process.env.SAMS_API_URL || "http://localhost:3000";
let db, teacher, learner, course, live, fastCourse;
const password = "SamsDemo2026!";
test.beforeAll(async () => {
  const url = process.env.SAMS_E2E_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error("Academic journeys require an isolated *_test database");
  db = new PrismaClient({ datasources: { db: { url } } });
  teacher = await db.user.findUniqueOrThrow({
    where: { email: "examiner@demo.sams.test" },
  });
  const template = await db.user.findUniqueOrThrow({
    where: { email: "student@demo.sams.test" },
  });
  const suffix = String(Date.now()).slice(-7),
    code = "UIA" + randomUUID().slice(0, 6).toUpperCase();
  learner = await db.user.create({
    data: {
      name: "Academic Browser Learner",
      email: `2025bit${suffix}@sdt.must.ac.ug`,
      regNo: `2025/BIT/${suffix}/PS`,
      role: "STUDENT",
      passwordHash: template.passwordHash,
      program: "BIT",
      programmeCode: "BIT",
      year: 2,
      admissionYear: 2025,
      sponsorshipCode: "PS",
      studyGroupKey: "BIT II",
      studyAcademicYear: "2026/2027",
      studySemester: 1,
      dataOrigin: "SYNTHETIC",
    },
  });
  course = await db.course.create({
    data: {
      code,
      title: "Academic day verification",
      program: "BIT",
      programmeCode: "BIT",
      year: 2,
      academicYear: "2026/2027",
      semester: 1,
      examinerId: teacher.id,
      audiences: { create: { groupKey: "BIT II" } },
      enrollments: { create: { studentId: learner.id } },
    },
  });
  live = await db.session.create({
    data: {
      courseId: course.id,
      naturalKey: "academic:" + randomUUID(),
      startTime: new Date(Date.now() - 1800000),
      endTime: new Date(Date.now() + 3600000),
      room: "Teaching Room",
    },
  });
  fastCourse = await db.course.create({
    data: {
      code: "UIF" + randomUUID().slice(0, 6).toUpperCase(),
      title: "Biomedical filter verification",
      program: "BME",
      programmeCode: "BME",
      year: 2,
      academicYear: "2026/2027",
      semester: 1,
      examinerId: teacher.id,
      audiences: { create: { groupKey: "BME II" } },
    },
  });
});
test.afterAll(async () => await db?.$disconnect());
async function login(page, identifier, passwordValue = password) {
  await page.goto("/login");
  await page
    .getByLabel("Email or registration number", { exact: true })
    .fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(passwordValue);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}
test("registration sign-in lands on a scoped live class and records without choosing a class", async ({
  page,
  request,
}) => {
  const signed = await request.post(apiURL + "/api/auth/login", {
    data: { email: teacher.email, password },
  });
  const opened = await request.post(
    apiURL + `/api/examiner/sessions/${live.id}/start-checkin`,
    {
      headers: { Authorization: "Bearer " + (await signed.json()).accessToken },
    },
  );
  const code = (await opened.json()).code;
  expect(code).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, learner.regNo.toLowerCase());
  await expect(page.locator("#academic-profile")).toContainText(
    "Faculty of Computing and Informatics",
  );
  await expect(page.locator("#academic-profile")).toContainText("BIT II");
  await expect(page.locator("#now-next")).toContainText(course.code);
  await expect(page.locator("#session")).toHaveValue(live.id);
  await expect(
    page.getByRole("combobox", { name: "Class", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Check-in code", { exact: true }).fill(code);
  await page
    .getByRole("button", { name: "Record attendance", exact: true })
    .click();
  await expect(page.locator("#notice")).toContainText(
    "Attendance recorded by the server",
  );
  await expect(page.locator("#now-next")).toContainText("Attendance recorded");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("overlapping enrolled classes require an explicit candidate rather than choosing an unrelated next class", async ({
  page,
}) => {
  const second = await db.session.create({
    data: {
      courseId: course.id,
      naturalKey: "academic-overlap:" + randomUUID(),
      startTime: new Date(Date.now() - 900000),
      endTime: new Date(Date.now() + 1800000),
      room: "Other Room",
    },
  });
  await login(page, learner.regNo);
  await expect(page.locator("#class-conflict")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Class", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#session")).toHaveValue("");
  await page
    .getByRole("combobox", { name: "Class", exact: true })
    .selectOption(second.id);
  await expect(page.locator("#checkin-target")).toContainText(course.code);
  await db.session.update({
    where: { id: second.id },
    data: { status: "CANCELLED", version: { increment: 1 } },
  });
});
test("registrar faculty filters constrain offerings and registration preview fills a reviewable academic profile", async ({
  page,
}) => {
  await login(page, "admin@demo.sams.test");
  await expect(page.locator("#courses")).toContainText(course.code);
  await expect(page.locator("#courses")).not.toContainText(fastCourse.code);
  await page.getByLabel("Faculty", { exact: true }).selectOption("fast");
  await expect(page.locator("#courses")).toContainText(fastCourse.code);
  await expect(page.locator("#courses")).not.toContainText(course.code);
  await page.getByLabel("Faculty", { exact: true }).selectOption("computing");
  await page.locator("summary").filter({ hasText: "Create account" }).click();
  await page
    .getByLabel("Registration number (students)", { exact: true })
    .fill("2025/BSE/88099/PS");
  await page
    .getByLabel("Registration number (students)", { exact: true })
    .blur();
  await expect(page.getByLabel("Account email", { exact: true })).toHaveValue(
    "2025bse88099@sdt.must.ac.ug",
  );
  await expect(
    page.getByLabel("Confirmed study year", { exact: true }),
  ).toHaveValue("2");
  await expect(
    page.getByLabel("Student timetable group", { exact: true }),
  ).toHaveValue("BSE II");
  await expect(page.locator("#registration-hint")).toContainText(
    "not verified mailbox ownership",
  );
});
test("a student with no dated enrollment gets a personal weekly plan offline without an attendance selector", async ({
  page,
}) => {
  const template = await db.user.findUniqueOrThrow({
      where: { id: learner.id },
    }),
    seq = String(Date.now()).slice(-7);
  const user = await db.user.create({
    data: {
      name: "Weekly Browser Learner",
      email: `2025bse${seq}@sdt.must.ac.ug`,
      regNo: `2025/BSE/${seq}/PS`,
      role: "STUDENT",
      passwordHash: template.passwordHash,
      program: "BSE",
      programmeCode: "BSE",
      year: 2,
      studyGroupKey: "BSE II",
      studyAcademicYear: "2026/2027",
      studySemester: 1,
      dataOrigin: "SYNTHETIC",
    },
  });
  await login(page, user.regNo);
  await expect(page.locator("#now-next")).toContainText("Weekly plan");
  await expect(page.locator("#checkin-form")).toBeHidden();
  await expect(
    page.getByRole("combobox", { name: "Class", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator("#academic-profile")).toContainText("BSE II");
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator("#day-status")).toContainText("Saved timetable");
  await expect(page.locator("#now-next")).toContainText("Weekly plan");
});
