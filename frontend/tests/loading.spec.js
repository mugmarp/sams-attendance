import { test, expect } from "@playwright/test";
const apiURL = process.env.SAMS_API_URL || "http://localhost:3000";
test("initial HTML keeps every page behind a neutral loading state before scripts run", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  const page = await context.newPage();
  try {
    for (const route of [
      "/login",
      "/account",
      "/admin/accounts",
      "/admin/course-plans",
      "/timetable",
      "/student/courses",
      "/examiner/dashboard",
      "/student/summary",
      "/student/checkin",
      "/admin/courses",
    ]) {
      await page.goto(route);
      await expect(page.locator("[data-page-content]")).toBeHidden();
      await expect(page.locator("#page-loading")).toHaveText("Loading SAMS…");
    }
  } finally {
    await context.close();
  }
});

for (const outcome of ["empty", "active", "failed"]) {
  test(`student check-in waits for class data before showing ${outcome} state`, async ({
    page,
    request,
  }) => {
    await seedSession(page, request, "student@demo.sams.test");
    let releaseDay, releaseReviews;
    const dayPending = new Promise((resolve) => (releaseDay = resolve));
    const reviewsPending = new Promise((resolve) => (releaseReviews = resolve));
    const now = Date.now();
    const classes = outcome === "active" ? [{
      id: "loading-test-class",
      courseCode: "TEST101",
      courseTitle: "Loading verification",
      startTime: new Date(now - 60000).toISOString(),
      endTime: new Date(now + 3600000).toISOString(),
      hasActiveCode: true,
      checkedIn: false,
    }] : [];
    await page.route("**/api/student/attendance-claims", async (route) => {
      await reviewsPending;
      await route.fulfill({ json: [] });
    });
    await page.route("**/api/student/sessions/upcoming", (route) =>
      route.fulfill({ json: classes }),
    );
    await page.route("**/api/student/day", async (route) => {
      await dayPending;
      await route.fulfill(outcome === "failed" ? {
        status: 503,
        json: { error: { message: "Class data unavailable" } },
      } : {
        json: {
          profile: { name: "Loading test student", regNo: "2025/BSE/999/PS" },
          classes,
          weekly: { events: [] },
        },
      });
    });
    try {
      const dayRequested = page.waitForRequest("**/api/student/day");
      await page.goto("/student/checkin");
      // A slow review panel must not prevent the primary request or loading UI.
      await dayRequested;
      await expect(page.locator("#class-loading")).toBeVisible();
      await expect(page.locator("#checkin-view")).toHaveAttribute("aria-busy", "true");
      await expect(page.locator("#checkin-form")).toBeHidden();
      await expect(page.getByRole("heading", { name: "No class in progress", exact: true })).toHaveCount(0);
      releaseDay();
      await expect(page.locator("#checkin-view")).toHaveAttribute("aria-busy", "false");
      if (outcome === "active") {
        await expect(page.locator("#checkin-form")).toBeVisible();
        await expect(page.locator("#checkin-target")).toContainText("TEST101");
        expect(await page.locator("#checkin-form").evaluate((form) => typeof form.onsubmit)).toBe("function");
      } else {
        await expect(page.locator("#checkin-form")).toBeHidden();
        if (outcome === "empty")
          await expect(page.getByRole("heading", { name: "No class in progress", exact: true })).toBeVisible();
        else {
          await expect(page.locator("#class-loading")).toContainText("Could not load your classes");
          await expect(page.getByRole("heading", { name: "No class in progress", exact: true })).toHaveCount(0);
        }
      }
      if (outcome !== "failed") await expect(page.locator("#class-loading")).toBeHidden();
    } finally {
      releaseDay();
      releaseReviews();
    }
  });
}
async function seedSession(page, request, email) {
  const response = await request.post(apiURL + "/api/auth/login", {
    data: { email, password: "SamsDemo2026!" },
  });
  expect(response.status()).toBe(200);
  const data = await response.json();
  await page.addInitScript((data) => {
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
  }, data);
}
test("account form waits for identity and workspace initialization", async ({
  page,
  request,
}) => {
  await seedSession(page, request, "examiner@demo.sams.test");
  let release;
  const pending = new Promise((r) => (release = r));
  await page.route("**/api/auth/me", async (route) => {
    await pending;
    await route.continue();
  });
  await page.goto("/account");
  await expect(page.locator("#page-loading")).toBeVisible();
  await expect(page.locator("#password-form")).toBeHidden();
  await expect(page.locator("#site-header")).toBeHidden();
  release();
  await expect(page.locator("#site-header")).toBeVisible();
  await expect(page.locator("#password-form")).toBeVisible();
  await expect(page.locator("#page-loading")).toBeHidden();
});
test("wrong-role navigation never flashes registrar content before redirect", async ({
  page,
  request,
}) => {
  await seedSession(page, request, "student@demo.sams.test");
  let release;
  const pending = new Promise((r) => (release = r));
  await page.route("**/api/auth/me", async (route) => {
    await pending;
    await route.continue();
  });
  await page.goto("/admin/accounts");
  await expect(page.locator("#page-loading")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Account management" }),
  ).toBeHidden();
  release();
  await expect(page).toHaveURL(/\/student\/checkin$/);
  await expect(
    page.getByRole("heading", { name: "Check in to class" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Account management" }),
  ).toHaveCount(0);
});

test("new loading markup remains usable with older cached login and workspace modules", async ({
  page,
}) => {
  const { readFileSync } = await import("node:fs");
  const common = readFileSync(
    new URL("../public/js/common.js", import.meta.url),
    "utf8",
  ).replace(
    /  const content = document.querySelector\("\[data-page-content\]"\);[\s\S]*?  return user;/,
    "  return user;",
  );
  const login = readFileSync(
    new URL("../public/js/login.js", import.meta.url),
    "utf8",
  ).replace(/else \{[\s\S]*?\n\}/, "");
  await page.route("**/js/common.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: common }),
  );
  await page.route("**/js/login.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: login }),
  );
  await page.goto("/login");
  await expect(page.locator("#login-form")).toBeVisible();
  await page
    .getByLabel("Email or registration number", { exact: true })
    .fill("examiner@demo.sams.test");
  await page.getByLabel("Password", { exact: true }).fill("SamsDemo2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/examiner\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Class attendance" }),
  ).toBeVisible();
  await expect(page.locator("#page-loading")).toBeHidden();
});

test("student navigation reveals its workspace before slow clock/setup and coalesces class refreshes", async ({ page, request }) => {
  await seedSession(page, request, "student@demo.sams.test");
  let releaseSetup, releaseDay, releaseClock;
  const setupPending = new Promise((r) => (releaseSetup = r));
  const dayPending = new Promise((r) => (releaseDay = r));
  const clockPending = new Promise((r) => (releaseClock = r));
  let days = 0, legacyReads = 0;
  await page.route("**/api/health", async (route) => {
    await clockPending;
    await route.continue();
  });
  await page.route("**/api/student/course-setup", async (route) => {
    await setupPending;
    await route.continue();
  });
  await page.route("**/api/student/sessions/upcoming", async (route) => {
    legacyReads++;
    await route.continue();
  });
  await page.route("**/api/student/day", async (route) => {
    days++;
    await dayPending;
    await route.fulfill({ json: { profile: { name: "Navigation test student" }, classes: [], weekly: { events: [] } } });
  });
  try {
    await page.goto("/student/checkin");
    await expect(page.getByRole("link", { name: "My attendance", exact: true })).toBeVisible();
    await expect(page.locator("#class-loading")).toBeVisible();
    expect(days).toBe(0);
    releaseSetup();
    await expect.poll(() => days).toBe(1);
    await page.evaluate(() => { dispatchEvent(new Event("focus")); dispatchEvent(new Event("online")); });
    // No second request may start while the first is still unresolved.
    await page.waitForTimeout(300);
    expect(days).toBe(1);
    releaseDay();
    await expect(page.locator("#class-loading")).toBeHidden();
    await page.waitForTimeout(300);
    expect(days).toBe(1);
    expect(legacyReads).toBe(0);
  } finally {
    releaseClock(); releaseSetup(); releaseDay();
  }
});

test("installed navigation uses a versioned shell without waiting for a stalled network", async () => {
  const { readFileSync } = await import("node:fs");
  const { runInNewContext } = await import("node:vm");
  const handlers = {};
  let networkRequests = 0, cacheName;
  const saved = { shell: true };
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    URL,
    self: { location: { origin: "https://sams.test" }, addEventListener: (name, handler) => (handlers[name] = handler) },
    caches: { open: async (name) => { cacheName = name; return { match: async (path) => path === "/student.html" ? saved : undefined }; } },
    fetch: () => { networkRequests++; return new Promise(() => {}); },
  });
  let response;
  handlers.fetch({ request: { method: "GET", mode: "navigate", url: "https://sams.test/student/checkin" }, respondWith: (value) => (response = value) });
  expect(await Promise.race([response, new Promise((resolve) => setTimeout(() => resolve("timeout"), 300))])).toBe(saved);
  expect(cacheName).toBe("sams-workspace-v12");
  expect(networkRequests).toBe(0);
  for (const path of ["/api/student/day", "/student/not-a-route"]) {
    let intercepted = false;
    handlers.fetch({ request: { method: "GET", mode: "navigate", url: "https://sams.test" + path }, respondWith: () => (intercepted = true) });
    expect(intercepted).toBe(false);
  }
});
