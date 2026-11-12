import { test, expect } from "@playwright/test";
import { PrismaClient } from "../../backend/node_modules/@prisma/client/index.js";
const baseURL = process.env.SAMS_BASE_URL || "http://localhost:3000";
const apiURL = process.env.SAMS_API_URL || "http://localhost:3000";
test.beforeAll(async () => {
  const url = process.env.SAMS_E2E_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error(
      "E2E reset requires SAMS_E2E_DATABASE_URL pointing to an isolated *_test database",
    );
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const live = await db.session.findMany({
      where: { naturalKey: { startsWith: "demo:", contains: ":live:" } },
    });
    const ids = live.map((s) => s.id);
    await db.attendanceChange.deleteMany({
      where: { attendance: { sessionId: { in: ids } } },
    });
    await db.attendance.deleteMany({ where: { sessionId: { in: ids } } });
    await db.session.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "SCHEDULED",
        startTime: new Date(Date.now() - 900000),
        endTime: new Date(Date.now() + 7200000),
        checkinSecret: null,
        checkinStartedAt: null,
        checkinClosesAt: null,
      },
    });
  } finally {
    await db.$disconnect();
  }
});
const password = "SamsDemo2026!";
async function login(page, role) {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${role}@demo.sams.test`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
test("lecturer, student and registrar complete the attendance journey", async ({
  page,
  browser,
}) => {
  await login(page, "examiner");
  await expect(
    page.getByRole("heading", { name: "Class attendance" }),
  ).toBeVisible();
  await page.getByRole("link").filter({ hasText: "SWE2106" }).click();
  await page
    .getByRole("button", { name: "Start check-in", exact: true })
    .click();
  const displayed = page.getByLabel("Current check-in code");
  await expect(displayed).toHaveText(/^[A-HJ-NP-Z2-9]{6}$/);
  const code = await displayed.textContent();
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  const learner = await context.newPage();
  await login(learner, "student");
  await expect(
    learner.getByRole("heading", { name: "Check in to class" }),
  ).toBeVisible();
  await learner
    .getByRole("combobox", { name: "Class", exact: true })
    .selectOption(
      await learner
        .locator("select option")
        .filter({ hasText: "SWE2106" })
        .first()
        .getAttribute("value"),
    );
  await learner.getByLabel("Check-in code", { exact: true }).fill(code);
  await learner.getByRole("button", { name: "Record attendance" }).click();
  await expect(learner.getByRole("status")).toContainText(
    "Attendance recorded by the server",
  );
  await expect(page.getByText("1 / 5 attended")).toBeVisible();
  await page
    .getByRole("button", { name: "Complete class", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm complete" }).click();
  await expect(
    page.getByText("SWE2106 · Internet Technologies and Web Design", {
      exact: true,
    }),
  ).toBeVisible();
  await learner
    .getByRole("link", { name: "My attendance", exact: true })
    .click();
  await expect(
    learner.getByText("5 attended / 6 completed classes"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "admin");
  await page.getByRole("link").filter({ hasText: "SWE2106" }).click();
  await page
    .getByRole("combobox", { name: "Show students" })
    .selectOption("below");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/attendance\.pdf$/);
  expect(
    await learner.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await context.close();
});
test("offline shell restores user-scoped classes and rejects a stale saved code", async ({
  page,
  request,
}) => {
  const signed = await request.post(`${apiURL}/api/auth/login`, {
    data: { email: "examiner@demo.sams.test", password },
  });
  const token = (await signed.json()).accessToken;
  const sessions = await request.get(`${apiURL}/api/examiner/sessions/today`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const current = (await sessions.json()).find(
    (s) => s.courseCode === "SWE2103" && s.status === "SCHEDULED",
  );
  expect(current).toBeTruthy();
  const opened = await request.post(
    `${apiURL}/api/examiner/sessions/${current.id}/start-checkin`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const code = (await opened.json()).code;
  await login(page, "student");
  await expect(
    page.getByRole("combobox", { name: "Class", exact: true }),
  ).toContainText("SWE2103");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Class", exact: true }),
  ).toContainText("SWE2103");
  await page.context().setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Class", exact: true }),
  ).toContainText("SWE2103");
  await page
    .getByRole("combobox", { name: "Class", exact: true })
    .selectOption(current.id);
  await page.getByLabel("Check-in code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Record attendance" }).click();
  await expect(page.getByText("SWE2103 · pending")).toBeVisible();
  await request.post(
    `${apiURL}/api/examiner/sessions/${current.id}/stop-checkin`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  await page.context().setOffline(false);
  // Reload may interrupt a tab while it owns the 30-second replay lease.
  // Reconnection must recover after lease expiry without overlapping sends.
  await expect(page.getByText("SWE2103 · failed")).toBeVisible({ timeout: 45000 });
  await expect(
    page.getByText(
      "Ask your examiner to review this attempt. It has not been counted.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "student2");
  await expect(page.getByText("No saved attempts.")).toBeVisible();
});
test("a valid pending check-in is accepted on reconnection", async ({
  page,
  request,
}) => {
  const signed = await request.post(`${apiURL}/api/auth/login`, {
    data: { email: "examiner@demo.sams.test", password },
  });
  const token = (await signed.json()).accessToken;
  const sessions = await request.get(`${apiURL}/api/examiner/sessions/today`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const current = (await sessions.json()).find(
    (s) => s.courseCode === "SWE2103" && s.status === "SCHEDULED",
  );
  const opened = await request.post(
    `${apiURL}/api/examiner/sessions/${current.id}/start-checkin`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const code = (await opened.json()).code;
  await login(page, "student2");
  const classes = page.getByRole("combobox", { name: "Class", exact: true });
  await expect(classes).toContainText("SWE2103");
  await classes.selectOption(current.id);
  await page.getByLabel("Check-in code", { exact: true }).fill(code);
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Record attendance" }).click();
  await expect(page.getByText("SWE2103 · pending")).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.getByText("No saved attempts.")).toBeVisible();
  await expect(
    page.getByRole("option", { name: /SWE2103.*recorded/ }),
  ).toHaveCount(1);
});

test("plain forms provision a course and student, then create a lecturer class", async ({
  page,
}) => {
  const suffix = Date.now().toString(36),
    code = "UI" + suffix.toUpperCase(),
    name = "Browser Learner " + suffix,
    email = "browser-" + suffix + "@demo.sams.test",
    reg = "UI/" + suffix;
  await login(page, "admin");
  await page.locator("summary").filter({ hasText: "Create account" }).click();
  await page.getByLabel("Full name", { exact: true }).fill(name);
  await page.getByLabel("Account email").fill(email);
  await page.getByLabel("Initial password").fill("BrowserPassword2026!");
  await page.getByLabel("Registration number (students)").fill(reg);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Account created");
  await page
    .locator("summary")
    .filter({ hasText: "Create course offering" })
    .click();
  await page.getByLabel("Course code", { exact: true }).fill(code);
  await page
    .getByLabel("Course title", { exact: true })
    .fill("Browser Setup Course");
  await page
    .getByLabel("Assigned examiner")
    .selectOption({ label: "Course Lecturer (examiner@demo.sams.test)" });
  await page.getByLabel("Attendance threshold (%)").fill("75");
  await page
    .getByRole("button", { name: "Create course", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Course offering created",
  );
  await page.locator("summary").filter({ hasText: "Enroll a student" }).click();
  await page
    .locator("#enroll-course")
    .selectOption(
      await page
        .locator("#enroll-course option")
        .filter({ hasText: code })
        .getAttribute("value"),
    );
  await page
    .locator("#enroll-student")
    .selectOption({ label: name + " · " + reg });
  await page
    .getByRole("button", { name: "Enroll student", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Student enrolled");
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "examiner");
  await page
    .locator("summary")
    .filter({ hasText: "Create class session" })
    .click();
  await page
    .locator("#create-course")
    .selectOption(
      await page
        .locator("#create-course option")
        .filter({ hasText: code })
        .getAttribute("value"),
    );
  await page.getByLabel("Venue", { exact: true }).fill("Browser Lab");
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: code + " · Browser Setup Course" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Course attendance report →" }).click();
  await expect(
    page.getByRole("heading", { name: "Attendance qualification" }),
  ).toBeVisible();
  await expect(page.locator("tbody")).toContainText(name);
});

test("workspace uses the real Kampala day and clean product wording", async ({
  page,
  request,
}) => {
  await login(page, "examiner");
  const health = await (await request.get(`${apiURL}/api/health`)).json();
  const expected = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(health.now));
  await expect(page.locator("#date")).toHaveValue(expected);
  await expect(page.locator("#current-date")).toContainText(
    new Intl.DateTimeFormat("en", {
      timeZone: "Africa/Kampala",
      year: "numeric",
    }).format(new Date(health.now)),
  );
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  // Course and venue names are user data; check the application shell wording.
  await expect(page.locator("#site-header")).not.toContainText(
    /\bdemo\b|\bprototype\b/i,
  );
  await expect(page.locator("footer")).not.toContainText(
    /\bdemo\b|\bprototype\b/i,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("a failed local save is visible and never sends an unsaved check-in", async ({
  page,
}) => {
  await login(page, "student");
  const classes = page.getByRole("combobox", { name: "Class", exact: true });
  await expect(classes).toContainText("SWE2103");
  const option = classes
    .locator("option")
    .filter({ hasText: "SWE2103" })
    .first();
  await classes.selectOption(await option.getAttribute("value"));
  let requests = 0;
  await page.route("**/api/student/checkin", (route) => {
    requests++;
    return route.fulfill({
      status: 500,
      json: { message: "Unexpected request" },
    });
  });
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "attempts")
        throw new DOMException("Device storage is full", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.getByLabel("Check-in code", { exact: true }).fill("ABC234");
  await page.getByRole("button", { name: "Record attendance" }).click();
  await expect(page.getByText(/Device storage is full/)).toBeVisible();
  expect(requests).toBe(0);
  await expect(page.getByText("No saved attempts.")).toBeVisible();
});
