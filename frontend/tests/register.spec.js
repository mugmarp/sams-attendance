import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../../backend/node_modules/@prisma/client/index.js";
const apiURL = process.env.SAMS_API_URL || "http://localhost:3000";
let db, course, students;
test.beforeAll(async () => {
  const url = process.env.SAMS_E2E_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error("Register tests require an isolated *_test database");
  db = new PrismaClient({ datasources: { db: { url } } });
  const teacher = await db.user.findUniqueOrThrow({
    where: { email: "examiner@demo.sams.test" },
  });
  students = await db.user.findMany({
    where: {
      email: {
        in: [
          "student@demo.sams.test",
          "student2@demo.sams.test",
          "student3@demo.sams.test",
        ],
      },
    },
    orderBy: { email: "asc" },
  });
  const year = new Date().getUTCFullYear();
  course = await db.course.create({
    data: {
      code: "OFF" + randomUUID().slice(0, 8).toUpperCase(),
      title: "Offline register verification",
      program: "BSE",
      year: 2,
      semester: 1,
      academicYear: `${year}/${year + 1}`,
      examinerId: teacher.id,
      enrollments: {
        create: students.map((student) => ({ studentId: student.id })),
      },
    },
  });
});
test.afterAll(async () => {
  await db?.$disconnect();
});
async function freshClass() {
  return db.session.create({
    data: {
      courseId: course.id,
      naturalKey: "e2e:offline:" + randomUUID(),
      startTime: new Date(Date.now() - 900000),
      endTime: new Date(Date.now() + 7200000),
      room: "Teaching Room",
    },
  });
}
async function login(page, role) {
  await page.goto("/login");
  await page
    .getByLabel("Email or registration number", { exact: true })
    .fill(`${role}@demo.sams.test`);
  await page.getByLabel("Password", { exact: true }).fill("SamsDemo2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}
async function openRegister(page, session) {
  await login(page, "examiner");
  await page.goto(`/examiner/session/${session.id}`);
  await expect(
    page.getByRole("heading", {
      name: `${course.code} · ${course.title}`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Prepare for offline use", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Roster saved on this device" }),
  ).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByText(students[0].name, { exact: true })).toBeVisible();
}
async function saveOffline(page, student, status = "PRESENT") {
  await page
    .getByRole("row")
    .filter({ hasText: student.name })
    .getByRole("button", { name: "Save offline mark", exact: true })
    .click();
  await page
    .getByLabel("Attendance status", { exact: true })
    .selectOption(status);
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Observed this student during the class");
  await page
    .getByRole("button", { name: "Save on this device", exact: true })
    .click();
  await expect(page.locator("#register-outbox")).toContainText("pending");
}
async function teacherToken(request) {
  const signed = await request.post(`${apiURL}/api/auth/login`, {
    data: { email: "examiner@demo.sams.test", password: "SamsDemo2026!" },
  });
  return (await signed.json()).accessToken;
}

test("prepared lecturer roster and provisional marks survive offline reload and sync once", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await freshClass();
  await openRegister(page, session);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator("#register-source")).toContainText(
    "saved register",
  );
  await saveOffline(page, students[0]);
  await expect(page.locator("#class-count")).toHaveText("0 / 3 attended");
  expect(await db.attendance.count({ where: { sessionId: session.id } })).toBe(
    0,
  );
  await page.reload();
  await expect(page.locator("#register-outbox")).toContainText("pending");
  await expect(page.locator("#class-count")).toHaveText("0 / 3 attended");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/sams-phase2-offline.png",
    fullPage: true,
  });
  await page.context().setOffline(false);
  await expect(page.locator("#register-outbox")).toContainText("synced");
  await expect(page.locator("#class-count")).toHaveText("1 / 3 attended");
  const attendance = await db.attendance.findUnique({
    where: {
      studentId_sessionId: { studentId: students[0].id, sessionId: session.id },
    },
  });
  expect(attendance.status).toBe("PRESENT");
  expect(
    await db.attendanceChange.count({ where: { attendanceId: attendance.id } }),
  ).toBe(1);
  await page
    .getByRole("button", { name: "Sync saved work", exact: true })
    .click();
  expect(
    await db.attendanceChange.count({ where: { attendanceId: attendance.id } }),
  ).toBe(1);
});

test("changed attendance needs explicit review and a lost review reply replays its receipt", async ({
  page,
  request,
}) => {
  const session = await freshClass();
  await openRegister(page, session);
  await page.context().setOffline(true);
  await saveOffline(page, students[0]);
  const token = await teacherToken(request);
  await request.post(
    `${apiURL}/api/examiner/sessions/${session.id}/attendance`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        studentId: students[0].id,
        status: "ABSENT",
        reason: "Verified the current register independently",
      },
    },
  );
  await page.context().setOffline(false);
  await expect(page.locator("#register-outbox")).toContainText("conflict");
  await page
    .getByRole("button", { name: "Review saved proposal", exact: true })
    .click();
  await expect(page.locator("#comparison")).toContainText(
    "Current server record: ABSENT",
  );
  await page
    .getByLabel("Attendance status", { exact: true })
    .selectOption("LATE");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Reviewed the saved observation; the student arrived late");
  let dropped = false,
    operationId;
  await page.route("**/api/sync/operations", async (route) => {
    const op = route.request().postDataJSON().operations[0];
    if (op.type === "REVIEW_MARK" && !dropped) {
      dropped = true;
      operationId = op.operationId;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort("connectionfailed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Confirm reviewed decision", exact: true })
    .click();
  await expect(page.locator("#register-outbox")).toContainText(
    "Unable to reach SAMS",
  );
  await page.reload();
  await expect(page.locator("#register-outbox")).toContainText("resolved");
  await expect(page.locator("#register-outbox")).toContainText("synced");
  expect(await db.attendanceChange.count({ where: { operationId } })).toBe(1);
  const attendance = await db.attendance.findUnique({
    where: {
      studentId_sessionId: { studentId: students[0].id, sessionId: session.id },
    },
  });
  expect(attendance.status).toBe("LATE");
  expect(attendance.version).toBe(2);
});

test("cancelled class denies saved marks and the lecturer can retain the server decision", async ({
  page,
  request,
}) => {
  const session = await freshClass();
  await openRegister(page, session);
  await page.context().setOffline(true);
  await saveOffline(page, students[0]);
  await request.post(`${apiURL}/api/examiner/sessions/${session.id}/cancel`, {
    headers: { Authorization: `Bearer ${await teacherToken(request)}` },
  });
  await page.context().setOffline(false);
  await expect(page.locator("#register-outbox")).toContainText("denied");
  await expect(page.locator("#register-outbox")).toContainText(
    "cancelled class",
  );
  expect(await db.attendance.count({ where: { sessionId: session.id } })).toBe(
    0,
  );
  await page
    .getByRole("button", { name: "Keep server record", exact: true })
    .click();
  await expect(page.locator("#register-outbox")).toContainText("dismissed");
});

test("student can request review of a failed attempt and lecturer approval records attendance", async ({
  page,
  browser,
}) => {
  const session = await freshClass();
  await login(page, "student");
  const select = page.getByRole("combobox", {
    name: "Class",
    exact: true,
    includeHidden: true,
  });
  await expect(select.locator(`option[value="${session.id}"]`)).toHaveCount(1);
  await chooseCurrentClass(page, session.id);
  await page.getByLabel("Check-in code", { exact: true }).fill("ABC234");
  await page
    .getByRole("button", { name: "Record attendance", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Request lecturer review", exact: true })
    .click();
  await page
    .getByLabel("Explain your request", { exact: true })
    .fill("I attended but lost connectivity before my code was submitted");
  await page
    .getByRole("button", { name: "Send review request", exact: true })
    .click();
  await expect(page.locator("#review-requests")).toContainText("pending");
  expect(await db.attendance.count({ where: { sessionId: session.id } })).toBe(
    0,
  );
  const learner = await db.user.findUnique({
    where: { email: "student@demo.sams.test" },
  });
  const context = await browser.newContext({
    baseURL: process.env.SAMS_BASE_URL || "http://localhost:3000",
  });
  const lecturer = await context.newPage();
  await login(lecturer, "examiner");
  await lecturer.goto(`/examiner/session/${session.id}`);
  await lecturer
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await lecturer
    .getByLabel("Attendance status", { exact: true })
    .selectOption("LATE");
  await lecturer
    .getByLabel("Reason", { exact: true })
    .fill("I observed the student arriving late and verified the request");
  await lecturer
    .getByRole("button", { name: "Confirm reviewed decision", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await db.attendanceClaim.findUnique({
            where: {
              studentId_sessionId: {
                studentId: learner.id,
                sessionId: session.id,
              },
            },
          })
        )?.status,
    )
    .toBe("APPROVED");
  await page.reload();
  await expect(page.locator("#review-requests")).toContainText("approved");
  expect(
    (
      await db.attendance.findUnique({
        where: {
          studentId_sessionId: { studentId: learner.id, sessionId: session.id },
        },
      })
    ).status,
  ).toBe("LATE");
  await context.close();
});

test("online corrections remain usable when offline storage is unavailable", async ({
  page,
}) => {
  const session = await freshClass();
  await page.addInitScript(() => {
    indexedDB.open = () => {
      throw new DOMException("Storage unavailable", "SecurityError");
    };
  });
  await login(page, "examiner");
  await page.goto(`/examiner/session/${session.id}`);
  await expect(
    page.getByRole("row").filter({ hasText: students[0].name }),
  ).toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: students[0].name })
    .getByRole("button", { name: "Correct", exact: true })
    .click();
  await page
    .getByLabel("Attendance status", { exact: true })
    .selectOption("LATE");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Verified late arrival using the online register");
  await page
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await expect(page.locator("#class-count")).toHaveText("1 / 3 attended");
  await expect(
    page.getByRole("button", { name: "Complete class", exact: true }),
  ).toBeDisabled();
});

async function chooseCurrentClass(page, id) {
  const select = page.locator("#session");
  if (await page.locator("#class-choice").isVisible())
    await select.selectOption(id);
  else await expect(select).toHaveValue(id);
}
