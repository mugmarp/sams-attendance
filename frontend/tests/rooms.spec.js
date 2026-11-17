import { test, expect } from "@playwright/test";
test("registrar reviews a reference room and lecturer receives its venue suggestion", async ({
  page,
  request,
}) => {
  const base = process.env.SAMS_API_URL || "http://localhost:3000";
  const login = await request.post(base + "/api/auth/login", {
    data: { email: "admin@demo.sams.test", password: "SamsDemo2026!" },
  });
  const signed = await login.json();
  const name = "Room UI " + Date.now();
  const created = await request.post(base + "/api/admin/rooms", {
    headers: { Authorization: "Bearer " + signed.accessToken },
    data: {
      code: "UI-" + Date.now(),
      name,
      sourceNote: "Synthetic browser-test venue reference",
      reason: "Review venue workflow",
    },
  });
  expect(created.status()).toBe(201);
  await page.goto("/login");
  await page
    .getByLabel("Email or registration number", { exact: true })
    .fill("admin@demo.sams.test");
  await page.getByLabel("Password", { exact: true }).fill("SamsDemo2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Rooms", exact: true }).click();
  await page.getByLabel("Search rooms", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("button", { name: "Review " + name, exact: true })
    .click();
  await expect(
    page.getByLabel("Confirmed capacity", { exact: true }),
  ).toHaveValue("");
  await page
    .getByLabel("Review status", { exact: true })
    .last()
    .selectOption("REVIEWED");
  await page.getByLabel("Available for booking", { exact: true }).check();
  await page
    .getByLabel("Reason for this change", { exact: true })
    .fill("Reviewed synthetic venue label for browser testing");
  await page.getByRole("button", { name: "Save room", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Room saved." }),
  ).toBeVisible();
  const rooms = await request.get(
    base + "/api/rooms?search=" + encodeURIComponent(name),
    { headers: { Authorization: "Bearer " + signed.accessToken } },
  );
  expect((await rooms.json())[0].capacity).toBeNull();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByLabel("Email or registration number", { exact: true })
    .fill("examiner@demo.sams.test");
  await page.getByLabel("Password", { exact: true }).fill("SamsDemo2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.locator('#create-room-options option[value="' + name + '"]'),
  ).toHaveCount(1);
});
