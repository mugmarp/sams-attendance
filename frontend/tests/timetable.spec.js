import { test, expect } from "@playwright/test";
import { PrismaClient } from "../../backend/node_modules/@prisma/client/index.js";
import { randomUUID } from "node:crypto";
const apiURL = process.env.SAMS_API_URL || "http://localhost:3000";
let db, offering, learner;
const day = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const plus = (n) =>
  new Date(Date.parse(day()) + n * 86400000).toISOString().slice(0, 10);
test.beforeAll(async () => {
  const url = process.env.SAMS_E2E_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error("Timetable tests require an isolated *_test database");
  db = new PrismaClient({ datasources: { db: { url } } });
  offering = await db.course.findFirstOrThrow({
    where: { code: "SWE2106" },
    orderBy: { academicYear: "desc" },
  });
  learner = await db.user.findUniqueOrThrow({
    where: { email: "student@demo.sams.test" },
  });
  const generated = await db.session.findMany({
    where: { courseId: offering.id, timetableEntryId: { not: null } },
    select: { id: true },
  });
  const ids = generated.map((s) => s.id);
  await db.attendanceChange.deleteMany({
    where: { attendance: { sessionId: { in: ids } } },
  });
  await db.attendance.deleteMany({ where: { sessionId: { in: ids } } });
  await db.offlinePreparation.deleteMany({ where: { sessionId: { in: ids } } });
  await db.attendanceClaim.deleteMany({ where: { sessionId: { in: ids } } });
  await db.session.deleteMany({ where: { id: { in: ids } } });
  await db.timetableEntry.deleteMany({ where: { courseId: offering.id } });
});
test.afterAll(async () => {
  await db?.$disconnect();
});
async function login(page, role) {
  await page.goto("/login");
  await page
    .getByLabel("Email or registration number", { exact: true })
    .fill(`${role}@demo.sams.test`);
  await page.getByLabel("Password", { exact: true }).fill("SamsDemo2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test("student sees the actual weekly timetable and can reload its saved view offline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "student");
  await page.getByRole("link", { name: "Timetable", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Weekly reference timetable",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Program group", { exact: true })).toHaveValue(
    "BSE II",
  );
  await page
    .getByLabel("Course code (optional)", { exact: true })
    .fill("SWE2106");
  await page
    .getByRole("button", { name: "Show reference", exact: true })
    .click();
  await expect(page.locator("#weekly-classes")).toContainText("SWE2106");
  await expect(page.locator("#source-status")).toContainText("2024-10-10");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator("#weekly-classes")).toContainText("BSE II");
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator("#source-status")).toContainText("Saved reference");
  await expect(page.locator("#weekly-classes")).toContainText("BSE II");
});

test("registrar reviews real source times, generates future classes and live view sees cancellation", async ({
  page,
  request,
}) => {
  await login(page, "admin");
  await page
    .getByRole("link", { name: "Timetable setup", exact: true })
    .click();
  await page
    .getByLabel("Program group", { exact: true })
    .selectOption("BSE II");
  await page
    .getByLabel("Course code (optional)", { exact: true })
    .fill("SWE2106");
  await page
    .getByRole("button", { name: "Show reference", exact: true })
    .click();
  await page.getByText("Review academic calendar", { exact: true }).click();
  const existing = await db.academicTerm.findUnique({
    where: {
      academicYear_semester: {
        academicYear: offering.academicYear,
        semester: offering.semester,
      },
    },
  });
  if (existing)
    await page
      .getByLabel("Academic term", { exact: true })
      .selectOption(existing.id);
  await page
    .getByLabel("Academic year", { exact: true })
    .fill(offering.academicYear);
  await page
    .getByLabel("Semester", { exact: true })
    .selectOption(String(offering.semester));
  await page.getByLabel("Semester starts", { exact: true }).fill(day());
  await page.getByLabel("Semester ends", { exact: true }).fill(plus(60));
  await page
    .getByLabel(
      "Confirmed non-teaching dates: YYYY-MM-DD | reason, one per line",
      { exact: true },
    )
    .fill("");
  await page
    .getByLabel("Calendar verification and exclusions checked", { exact: true })
    .fill("Synthetic test window verified in the isolated database");
  await page
    .getByLabel("I reviewed these dates and teaching exclusions.", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Save reviewed calendar", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Reviewed academic calendar saved" }),
  ).toBeVisible();
  await page.getByLabel("Source row", { exact: true }).selectOption("0");
  await page
    .getByLabel("SAMS course offering and assigned lecturer", { exact: true })
    .selectOption(offering.id);
  await page.getByLabel("Reviewed start time", { exact: true }).fill("09:00");
  await page.getByLabel("Reviewed end time", { exact: true }).fill("11:00");
  await page
    .getByLabel("Reviewed class type", { exact: true })
    .selectOption("LECTURE");
  await page
    .getByLabel("Generate from (future dates only)", { exact: true })
    .fill(plus(14));
  await page.getByLabel("Generate through", { exact: true }).fill(plus(20));
  await page
    .getByLabel("Review reason, including any source disagreements resolved", {
      exact: true,
    })
    .fill(
      "Synthetic reviewed interval for actual source identity; no attendance inferred",
    );
  await page
    .getByLabel(
      "I checked the offering, lecturer, times and actual teaching dates.",
      { exact: true },
    )
    .check();
  const before = await db.session.count({ where: { courseId: offering.id } });
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await expect(page.locator("#preview-result")).toContainText("create: 1");
  expect(await db.session.count({ where: { courseId: offering.id } })).toBe(
    before,
  );
  await page
    .getByRole("button", { name: "Apply reviewed changes", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Reviewed classes applied" }),
  ).toBeVisible();
  const session = await db.session.findFirstOrThrow({
    where: { courseId: offering.id, timetableEntryId: { not: null } },
    orderBy: { startTime: "desc" },
  });
  await page
    .getByLabel("Date (Kampala)", { exact: true })
    .fill(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(
        session.startTime,
      ),
    );
  await page
    .getByLabel("Date (Kampala)", { exact: true })
    .dispatchEvent("change");
  await expect(page.locator("#dated-classes")).toContainText(
    "From a reviewed timetable rule",
  );
  const signed = await request.post(`${apiURL}/api/auth/login`, {
    data: { email: "examiner@demo.sams.test", password: "SamsDemo2026!" },
  });
  const token = (await signed.json()).accessToken;
  await request.post(`${apiURL}/api/examiner/sessions/${session.id}/cancel`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await expect(page.locator("#dated-classes")).toContainText("Cancelled", {
    timeout: 20000,
  });
});

test("report snapshot survives policy and enrollment edits and downloads its original PDF", async ({
  page,
}) => {
  const course = await db.course.create({
    data: {
      code: "SNAP" + randomUUID().slice(0, 7),
      title: "Snapshot verification",
      program: "BSE",
      year: 2,
      academicYear: offering.academicYear,
      semester: 1,
      examinerId: offering.examinerId,
      attendanceThreshold: 60,
      enrollments: { create: { studentId: learner.id } },
    },
  });
  for (const status of ["LATE", "LATE", "EXCUSED"]) {
    await db.session.create({
      data: {
        courseId: course.id,
        naturalKey: "snapshot-browser:" + randomUUID(),
        startTime: new Date(Date.parse(plus(-2) + "T09:00:00+03:00")),
        endTime: new Date(Date.parse(plus(-2) + "T11:00:00+03:00")),
        status: "COMPLETED",
        attendances: {
          create: { studentId: learner.id, status, method: "MANUAL" },
        },
      },
    });
  }
  await login(page, "admin");
  await page.goto(`/admin/eligibility/${course.id}`);
  await page
    .getByText("Save an attendance report snapshot", { exact: true })
    .click();
  await page
    .getByLabel("Reason for this snapshot", { exact: true })
    .fill(
      "Reviewed the accepted register before changing its configured policy",
    );
  await page
    .getByLabel("I reviewed pending requests and device synchronization.", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Save report snapshot", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Download saved PDF", exact: true }),
  ).toBeVisible();
  const snapshot = await db.reportSnapshot.findFirstOrThrow({
    where: { courseId: course.id },
  });
  expect(snapshot.data.students[0].presentCount).toBe(2);
  await page
    .getByText("Review configured attendance rule", { exact: true })
    .click();
  await page.getByLabel("Count LATE as attended", { exact: true }).uncheck();
  await page.getByLabel("Count EXCUSED as attended", { exact: true }).check();
  await page
    .getByLabel("Reason and policy source checked", { exact: true })
    .fill("Verified a new synthetic policy for the current report");
  await page
    .getByRole("button", { name: "Save new policy version", exact: true })
    .click();
  await expect(page.locator("#report-context")).toContainText("policy v2");
  expect(
    (await db.reportSnapshot.findUnique({ where: { id: snapshot.id } })).data
      .students[0].presentCount,
  ).toBe(2);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download saved PDF", exact: true })
    .click();
  await (await download).saveAs("/tmp/sams-phase3-snapshot.pdf");
  await page
    .getByText("Review enrollment dates or withdrawal", { exact: true })
    .click();
  const enrollment = await db.enrollment.findUnique({
    where: {
      studentId_courseId: { studentId: learner.id, courseId: course.id },
    },
  });
  await page
    .getByLabel("Student enrollment", { exact: true })
    .selectOption(enrollment.id);
  await page
    .getByLabel("Attendance begins (blank means unrecorded legacy date)", {
      exact: true,
    })
    .fill(day());
  await page
    .getByLabel("Reason for date change", { exact: true })
    .fill("Verified actual enrollment date after those earlier classes");
  await page
    .getByRole("button", { name: "Save enrollment dates", exact: true })
    .click();
  await expect(page.locator("#report-rows")).toContainText("Not assessed");
  expect(
    await db.attendance.count({
      where: { studentId: learner.id, session: { courseId: course.id } },
    }),
  ).toBe(3);
});
