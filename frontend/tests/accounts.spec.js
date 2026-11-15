import { test, expect } from "@playwright/test";
import { PrismaClient } from "../../backend/node_modules/@prisma/client/index.js";
import { randomUUID } from "node:crypto";
const apiURL = process.env.SAMS_API_URL || "http://localhost:3000";
const password = "SamsDemo2026!";
let db, learner;
test.beforeAll(async () => {
  const url = process.env.SAMS_E2E_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error("Account journeys require an isolated *_test database");
  db = new PrismaClient({ datasources: { db: { url } } });
  const template = await db.user.findUniqueOrThrow({
    where: { email: "student@demo.sams.test" },
  });
  const suffix = randomUUID().slice(0, 8);
  learner = await db.user.create({
    data: {
      name: "Account Journey " + suffix,
      email: `account-${suffix}@test.example`,
      passwordHash: template.passwordHash,
      role: "STUDENT",
      programmeCode: "BSE",
      program: "BSE",
      year: 2,
      studyGroupKey: "BSE II",
      dataOrigin: "SYNTHETIC",
    },
  });
});
test.afterAll(async () => await db?.$disconnect());
async function login(page, identifier, value = password) {
  await page.goto("/login");
  await page
    .getByLabel("Email or registration number", { exact: true })
    .fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/);
}
async function choose(page) {
  const filtered = page.waitForResponse(
    (response) =>
      response.url().includes("/api/admin/accounts?") &&
      new URL(response.url()).searchParams.get("search") === learner.name,
  );
  await page.getByLabel("Search courses or students").fill(learner.name);
  await filtered;
  await expect(
    page.locator("#target-account option", { hasText: learner.name }),
  ).toHaveCount(1);
  await page.getByLabel("Account", { exact: true }).selectOption(learner.id);
}
test("registrar recovery leads to forced password change and retains pending attendance", async ({
  page,
  browser,
  request,
}) => {
  const before = await request.post(apiURL + "/api/auth/login", {
    data: { email: learner.email, password },
  });
  const beforeTokens = await before.json();
  await login(page, "admin@demo.sams.test");
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await choose(page);
  await page
    .getByLabel("Temporary password", { exact: true })
    .fill("TemporaryAccount2026!");
  await page
    .getByLabel("Reason for account action")
    .fill("Identity checked for browser recovery test");
  await page.getByLabel("Your current password").fill(password);
  await page.getByRole("button", { name: "Apply account action" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Password reset for" }),
  ).toBeVisible();
  expect(
    (
      await request.get(apiURL + "/api/auth/me", {
        headers: { Authorization: "Bearer " + beforeTokens.accessToken },
      })
    ).status(),
  ).toBe(401);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const student = await context.newPage();
  await login(student, learner.email, "TemporaryAccount2026!");
  await expect(student).toHaveURL(/\/account$/);
  await expect(
    student.getByText(
      "Change your temporary password before using your workspace.",
    ),
  ).toBeVisible();
  await student.evaluate(async (id) => {
    const offline = await import("/js/offline.js");
    await offline.queue({
      userId: id,
      sessionId: "saved-session",
      code: "ABC234",
      courseCode: "SWE2106",
    });
  }, learner.id);
  await student
    .getByLabel("Current password", { exact: true })
    .fill("TemporaryAccount2026!");
  await student
    .getByLabel("New password", { exact: true })
    .fill("PermanentAccount2026!");
  await student
    .getByLabel("Confirm new password", { exact: true })
    .fill("PermanentAccount2026!");
  await student.getByRole("button", { name: "Update password" }).click();
  await expect(student).toHaveURL(/\/login\?account=updated$/);
  const pending = await student.evaluate(
    async (id) => (await import("/js/offline.js")).attempts(id),
    learner.id,
  );
  expect(pending).toHaveLength(1);
  expect(pending[0].state).toBe("PENDING");
  await login(student, learner.email, "PermanentAccount2026!");
  await expect(student).toHaveURL(/\/student\/checkin$/);
  await context.close();
});
test("registrar can disable and reactivate access without restoring previous sign-ins", async ({
  page,
  request,
}) => {
  await db.user.update({
    where: { id: learner.id },
    data: {
      passwordHash: (
        await db.user.findUniqueOrThrow({
          where: { email: "student@demo.sams.test" },
        })
      ).passwordHash,
      mustChangePassword: false,
    },
  });
  const signed = await request.post(apiURL + "/api/auth/login", {
    data: { email: learner.email, password },
  });
  const tokens = await signed.json();
  await login(page, "admin@demo.sams.test");
  await page.goto("/admin/accounts");
  for (const action of ["disable", "enable"]) {
    await choose(page);
    await page.getByLabel("Action", { exact: true }).selectOption(action);
    await page
      .getByLabel("Reason for account action")
      .fill("Account access review during browser test");
    await page.getByLabel("Your current password").fill(password);
    await page.getByRole("button", { name: "Apply account action" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Account action saved" }),
    ).toBeVisible();
    expect(
      (
        await request.get(apiURL + "/api/auth/me", {
          headers: { Authorization: "Bearer " + tokens.accessToken },
        })
      ).status(),
    ).toBe(401);
  }
  expect(
    (
      await request.post(apiURL + "/api/auth/login", {
        data: { email: learner.email, password },
      })
    ).status(),
  ).toBe(200);
});
test("account owner ends all sign-ins from the account page", async ({
  page,
  request,
}) => {
  await login(page, learner.email);
  await page.getByRole("link", { name: "My account", exact: true }).click();
  const signed = await request.post(apiURL + "/api/auth/login", {
    data: { email: learner.email, password },
  });
  const tokens = await signed.json();
  await page.getByLabel("Current password to end sign-ins").fill(password);
  await page
    .getByRole("button", { name: "End all sign-ins", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login\?account=updated$/);
  expect(
    (
      await request.post(apiURL + "/api/auth/refresh", {
        data: { refreshToken: tokens.refreshToken },
      })
    ).status(),
  ).toBe(401);
});
