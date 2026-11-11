import { test, expect } from "@playwright/test";

async function boot(page, legacy = false) {
  await page.route("**/queue-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Queue verification</title>",
    }),
  );
  await page.goto("/queue-test");
  if (legacy)
    await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open("sams-plain-js-v1", 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("attempts", { keyPath: "id" });
          request.result.createObjectStore("snapshots");
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("attempts", "readwrite");
          tx.objectStore("attempts").put({
            id: "A:class",
            userId: "A",
            sessionId: "class",
            code: "ABC234",
            courseCode: "TEST",
            state: "PENDING",
            tries: 0,
            createdAt: new Date().toISOString(),
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      });
    });
  await page.evaluate(async () => {
    window.auth = await import("/js/api.js");
    window.queue = await import("/js/offline.js");
  });
}
const signIn = (page, id = "A") =>
  page.evaluate(
    (id) =>
      auth.saveSession({
        user: { id, role: "STUDENT" },
        accessToken: "access-" + id,
        refreshToken: "refresh-" + id,
      }),
    id,
  );
const enqueue = (page, sessionId = "class") =>
  page.evaluate(
    (sessionId) =>
      queue.queue({
        userId: "A",
        sessionId,
        code: "ABC234",
        courseCode: "TEST",
      }),
    sessionId,
  );
const list = (page) => page.evaluate(() => queue.attempts("A"));
const flush = (page) => page.evaluate(() => queue.sync("A"));
async function due(page) {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("sams-plain-js-v1", 2);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("attempts", "readwrite"),
          store = tx.objectStore("attempts");
        store.openCursor().onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            cursor.update({ ...cursor.value, nextAttemptAt: 0 });
            cursor.continue();
          }
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
}
const accepted = {
  success: true,
  attendance: { id: "attendance-1", status: "PRESENT" },
};
const acknowledge = (route, extra = {}) =>
  route.fulfill({ json: { ...accepted, ...extra } });
function barrier() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("transient errors honor persisted Retry-After and survive more than five failures", async ({
  page,
}) => {
  await boot(page);
  await signIn(page);
  const operation = await enqueue(page);
  let calls = 0;
  await page.route("**/api/student/checkin", (route) => {
    calls++;
    if (calls === 1)
      return route.fulfill({
        status: 429,
        headers: { "Retry-After": "120" },
        json: { message: "Please wait" },
      });
    if (calls < 8)
      return route.fulfill({
        status: 503,
        json: { message: "Temporarily unavailable" },
      });
    return acknowledge(route);
  });
  const before = Date.now();
  await flush(page);
  expect((await list(page))[0]).toMatchObject({ state: "PENDING", tries: 1 });
  expect((await list(page))[0].nextAttemptAt).toBeGreaterThanOrEqual(
    before + 120000,
  );
  await page.reload();
  await page.evaluate(async () => {
    window.auth = await import("/js/api.js");
    window.queue = await import("/js/offline.js");
  });
  await flush(page);
  expect(calls).toBe(1);
  for (let i = 0; i < 6; i++) {
    await due(page);
    await flush(page);
  }
  expect((await list(page))[0]).toMatchObject({
    id: operation.id,
    state: "PENDING",
    tries: 7,
  });
  await due(page);
  await flush(page);
  const receipt = (await list(page))[0];
  expect(receipt).toMatchObject({
    id: operation.id,
    state: "SYNCED",
    attendanceId: "attendance-1",
  });
  expect(receipt.code).toBeUndefined();
  expect(receipt.acknowledgedAt).toBeTruthy();
});

test("a lost response retries the same saved attempt and retains the duplicate receipt", async ({
  page,
}) => {
  await boot(page);
  await signIn(page);
  const saved = await enqueue(page);
  let calls = 0;
  await page.route("**/api/student/checkin", (route) =>
    ++calls === 1
      ? route.abort("connectionfailed")
      : acknowledge(route, { duplicate: true }),
  );
  await flush(page);
  expect((await list(page))[0]).toMatchObject({
    id: saved.id,
    state: "PENDING",
    tries: 1,
  });
  await due(page);
  await flush(page);
  expect((await list(page))[0]).toMatchObject({
    id: saved.id,
    state: "SYNCED",
    duplicate: true,
  });
  expect(calls).toBe(2);
});

test("invalid codes stop retrying and a new attempt preserves the failed history", async ({
  page,
}) => {
  await boot(page);
  await signIn(page);
  const first = await enqueue(page);
  let calls = 0;
  await page.route("**/api/student/checkin", (route) => {
    calls++;
    return route.fulfill({ status: 400, json: { message: "Expired code" } });
  });
  await flush(page);
  await due(page);
  await flush(page);
  expect(calls).toBe(1);
  const second = await enqueue(page);
  expect(second.id).not.toBe(first.id);
  expect(await list(page)).toHaveLength(2);
  expect((await list(page)).find((a) => a.id === first.id).state).toBe(
    "FAILED",
  );
});

test("an old acknowledgement cannot delete a newer attempt for the same class", async ({
  page,
}) => {
  await boot(page);
  await signIn(page);
  const first = await enqueue(page);
  const entered = barrier(),
    response = barrier();
  await page.route("**/api/student/checkin", async (route) => {
    entered.release();
    await response.promise;
    await acknowledge(route);
  });
  const sending = flush(page);
  await entered.promise;
  const second = await enqueue(page);
  response.release();
  await sending;
  const records = await list(page);
  expect(records.find((a) => a.id === first.id).state).toBe("SYNCED");
  expect(records.find((a) => a.id === second.id).state).toBe("PENDING");
});

test("two tabs share a replay lease and a removed operation is not resurrected", async ({
  page,
  context,
}) => {
  await boot(page);
  await signIn(page);
  const saved = await enqueue(page);
  const other = await context.newPage();
  await boot(other);
  const entered = barrier(),
    response = barrier();
  let calls = 0;
  await context.route("**/api/student/checkin", async (route) => {
    calls++;
    entered.release();
    await response.promise;
    await acknowledge(route);
  });
  const sending = flush(page);
  await entered.promise;
  await flush(other);
  expect(calls).toBe(1);
  await other.evaluate((id) => queue.remove(id, "A"), saved.id);
  response.release();
  await sending;
  expect(await list(page)).toHaveLength(0);
});

for (const change of ["switch", "logout"]) {
  test(`late token refresh cannot undo ${change} in another tab`, async ({
    page,
    context,
  }) => {
    await boot(page);
    await signIn(page);
    await enqueue(page);
    await enqueue(page, "another-class");
    const other = await context.newPage();
    await boot(other);
    const entered = barrier(),
      response = barrier();
    const tokens = [];
    await context.route("**/api/student/checkin", (route) => {
      tokens.push(route.request().headers().authorization);
      return route.fulfill({
        status: 401,
        json: { message: "Expired access token" },
      });
    });
    await context.route("**/api/auth/refresh", async (route) => {
      entered.release();
      await response.promise;
      await route.fulfill({
        json: {
          user: { id: "A", role: "STUDENT" },
          accessToken: "new-A",
          refreshToken: "new-refresh-A",
        },
      });
    });
    const sending = flush(page);
    await entered.promise;
    if (change === "switch") await signIn(other, "B");
    else await other.evaluate(() => auth.clearSession());
    response.release();
    await sending;
    expect(await other.evaluate(() => auth.cachedUser()?.id || null)).toBe(
      change === "switch" ? "B" : null,
    );
    expect(tokens).toEqual(["Bearer access-A"]);
    expect((await list(page)).every((a) => a.state === "PENDING")).toBe(true);
    await expect(flush(page)).rejects.toThrow("sign-in changed");
  });
}

test("legacy pending work survives the storage upgrade and an expired lease recovers", async ({
  page,
}) => {
  await boot(page, true);
  await signIn(page);
  expect(await list(page)).toHaveLength(1);
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const request = indexedDB.open("sams-plain-js-v1", 2);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("leases", "readwrite");
        tx.objectStore("leases").put({
          id: "sync:A",
          owner: "closed-tab",
          expiresAt: Date.now() - 1000,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await page.route("**/api/student/checkin", (route) => acknowledge(route));
  await flush(page);
  expect((await list(page))[0]).toMatchObject({
    id: "A:class",
    state: "SYNCED",
  });
});

test("a successful refresh preserves the sign-in and retries with its new token", async ({
  page,
}) => {
  await boot(page);
  await signIn(page);
  const sessionId = await page.evaluate(() => auth.currentSession().id);
  const tokens = [];
  let refreshes = 0;
  await page.route("**/api/student/checkin", (route) => {
    const token = route.request().headers().authorization;
    tokens.push(token);
    return token === "Bearer access-A"
      ? route.fulfill({ status: 401, json: { message: "Expired" } })
      : acknowledge(route);
  });
  await page.route("**/api/auth/refresh", (route) => {
    refreshes++;
    expect(route.request().postDataJSON().refreshToken).toBe("refresh-A");
    return route.fulfill({
      json: {
        user: { id: "A", role: "STUDENT" },
        accessToken: "renewed-A",
        refreshToken: "renewed-refresh-A",
      },
    });
  });
  await enqueue(page);
  await flush(page);
  expect(refreshes).toBe(1);
  expect(tokens).toEqual(["Bearer access-A", "Bearer renewed-A"]);
  expect(await page.evaluate(() => auth.currentSession().id)).toBe(sessionId);
  expect((await list(page))[0].state).toBe("SYNCED");
});

test("legacy sign-in credentials migrate without discarding pending work", async ({
  page,
}) => {
  await boot(page, true);
  await page.evaluate(() => {
    localStorage.setItem("user", JSON.stringify({ id: "A", role: "STUDENT" }));
    localStorage.setItem("accessToken", "access-A");
    localStorage.setItem("refreshToken", "refresh-A");
  });
  expect(await page.evaluate(() => auth.cachedUser().id)).toBe("A");
  expect(
    await page.evaluate(() => localStorage.getItem("accessToken")),
  ).toBeNull();
  expect(await list(page)).toHaveLength(1);
  await page.route("**/api/student/checkin", (route) => acknowledge(route));
  await flush(page);
  expect((await list(page))[0].state).toBe("SYNCED");
});
