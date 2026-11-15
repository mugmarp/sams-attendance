import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
process.env.NODE_ENV = "production";
process.env.DATABASE_URL ||= "postgresql://unused:unused@localhost/unused";
process.env.JWT_SECRET = "isolated-rate-test-access-secret-32-characters";
process.env.JWT_REFRESH_SECRET =
  "isolated-rate-test-refresh-secret-32-characters";
const { authRateLimit, loginIdentityRateLimit, authenticatedRateLimit } =
  await import("../src/middleware/rateLimit.js");
test("shared-IP successful sign-ins are allowed while repeated identity failures are limited", async () => {
  const app = express();
  app.use(express.json(), authRateLimit, loginIdentityRateLimit);
  app.post("/", (req, res) =>
    res.status(req.body.fail ? 401 : 200).json({ synthetic: true }),
  );
  for (let i = 0; i < 20; i++)
    assert.equal(
      (
        await request(app)
          .post("/")
          .send({ identifier: `student-${i}` })
      ).status,
      200,
    );
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await request(app).post("/").send({ identifier: "learner", fail: true }))
        .status,
      401,
    );
  assert.equal(
    (await request(app).post("/").send({ identifier: " LEARNER ", fail: true }))
      .status,
    429,
  );
  assert.equal(
    (await request(app).post("/").send({ identifier: "another-student" }))
      .status,
    200,
  );
});
test("authenticated request budgets are isolated by verified account identity", async () => {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { userId: req.headers["x-synthetic-test-user"] };
    next();
  }, authenticatedRateLimit);
  app.get("/", (_req, res) => res.json({ synthetic: true }));
  for (let i = 0; i < 600; i++)
    assert.equal(
      (await request(app).get("/").set("x-synthetic-test-user", "one")).status,
      200,
    );
  assert.equal(
    (await request(app).get("/").set("x-synthetic-test-user", "one")).status,
    429,
  );
  assert.equal(
    (await request(app).get("/").set("x-synthetic-test-user", "two")).status,
    200,
  );
});
