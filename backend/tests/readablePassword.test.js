import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { readablePassword } from "../src/utils/readablePassword.js";

test("readable initial credentials meet the existing minimum and bcrypt verifies the entire password", async () => {
  const password = readablePassword();
  assert.equal(password.length, 16);
  assert.equal(Buffer.byteLength(password, "utf8"), 16);
  assert.match(password, /^[A-Z][a-z]{5}[2-9]{4}[A-Z][a-z]{5}$/);
  const hash = await bcrypt.hash(password, 4);
  assert.equal(await bcrypt.compare(password, hash), true);
  assert.equal(await bcrypt.compare(password + "x", hash), false);
});

test("a provisioning batch preserves reserved credentials and gives every account a distinct password", () => {
  const reserved = "Mavonu4826Lerika";
  const used = new Set([reserved]);
  const passwords = Array.from({ length: 500 }, () => readablePassword(used));
  assert.equal(new Set(passwords).size, 500);
  assert.ok(!passwords.includes(reserved));
  assert.equal(used.has(reserved), true);
  assert.equal(used.size, 501);
});
