import { test, expect } from "@playwright/test";
import { PrismaClient } from "../../backend/node_modules/@prisma/client/index.js";
import { randomUUID } from "node:crypto";
let db, course, session;
test.beforeAll(async () => {
  const url = process.env.SAMS_E2E_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw Error("Requires isolated *_test database");
  db = new PrismaClient({ datasources: { db: { url } } });
  const teacher = await db.user.findUniqueOrThrow({
    where: { email: "examiner@demo.sams.test" },
  });
  course = await db.course.create({
    data: {
      code: "ROT" + randomUUID().slice(0, 5),
      title: "Code refresh verification",
      program: "BSE",
      year: 2,
      academicYear: "2026/2027",
      semester: 1,
      examinerId: teacher.id,
    },
  });
  session = await db.session.create({
    data: {
      courseId: course.id,
      naturalKey: "rotation:" + randomUUID(),
      startTime: new Date(Date.now() - 60000),
      endTime: new Date(Date.now() + 3600000),
    },
  });
});
test.afterAll(async () => {
  if (session) await db.session.delete({ where: { id: session.id } });
  if (course) await db.course.delete({ where: { id: course.id } });
  await db?.$disconnect();
});
test("a rotating code refresh keeps the open window visible and does not offer reopening", async ({
  page,
}) => {
  let count = 0,
    release;
  const waiting = new Promise((r) => (release = r));
  await page.route("**/api/examiner/sessions/" + session.id, async (route) => {
    count++;
    if (count === 2) await waiting;
    await route.fulfill({
      json: {
        ...session,
        startTime: session.startTime.toISOString(),
        endTime: session.endTime.toISOString(),
        course,
        courseCode: course.code,
        courseTitle: course.title,
        hasActiveCode: true,
        activeCode: {
          code: count === 1 ? "ABC234" : "DEF567",
          expiresAt: new Date(
            Date.now() + (count === 1 ? 1300 : 60000),
          ).toISOString(),
          closesAt: new Date(Date.now() + 120000).toISOString(),
        },
      },
    });
  });
  await page.goto("/login");
  await page
    .getByLabel("Email or registration number", { exact: true })
    .fill("examiner@demo.sams.test");
  await page.getByLabel("Password", { exact: true }).fill("SamsDemo2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await page.goto("/examiner/session/" + session.id);
  await expect(page.getByLabel("Current check-in code")).toHaveText("ABC234");
  await expect(
    page.getByText("Attendance window is open.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("#start")).toBeHidden();
  await expect(page.locator("#stop")).toBeVisible();
  release();
  await expect(page.getByLabel("Current check-in code")).toHaveText("DEF567");
  expect(count).toBeGreaterThanOrEqual(2);
});
