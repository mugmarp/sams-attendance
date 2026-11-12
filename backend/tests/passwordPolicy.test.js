import { test } from "node:test";
import assert from "node:assert/strict";
import { passwordSchema } from "../src/utils/passwordPolicy.js";

test("password entry accepts eight characters and enforces bcrypt's byte boundary", () => {
  assert.equal(passwordSchema.safeParse("Seven77").success, false);
  assert.equal(passwordSchema.safeParse("Eight888").success, true);
  assert.equal(passwordSchema.safeParse("a".repeat(72)).success, true);
  assert.equal(passwordSchema.safeParse("a".repeat(73)).success, false);
  assert.equal(passwordSchema.safeParse("😀".repeat(18)).success, true);
  assert.equal(passwordSchema.safeParse("😀".repeat(19)).success, false);
});
