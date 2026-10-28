import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, hashSessionToken, hasGlobalPermission, hasProjectPermission, normalizeUsername, sessionCookie, validPassword, validUsername, verifyPassword } from "./user-auth.js";

test("usernames normalize compatibility forms and case consistently", () => {
  assert.equal(normalizeUsername("  Ａlice  "), "alice");
  assert.equal(normalizeUsername("User.Name"), "user.name");
  assert.equal(validUsername("user.name_1"), true);
  assert.equal(validUsername("bad name"), false);
});

test("passwords use salted scrypt hashes and verify without exposing source text", async () => {
  const password = "long-password-123";
  const hash = await hashPassword(password);
  assert.match(hash, /^scrypt\$16384\$8\$1\$/);
  assert.notEqual(hash, await hashPassword(password));
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
  assert.equal(validPassword("short"), false);
  assert.equal(validPassword(password), true);
});

test("global and project grants are independent and wildcard is explicit", () => {
  const user = { globalPermissions: ["users:read"], projectPanels: { p1: ["panel-1"] }, projectPermissions: { p2: ["project:manage"] } };
  assert.equal(hasGlobalPermission(user, "users:read"), true);
  assert.equal(hasGlobalPermission(user, "users:manage"), false);
  assert.equal(hasProjectPermission(user, "p1", "project:manage"), false);
  assert.equal(hasProjectPermission(user, "p2", "project:manage"), true);
  assert.equal(hasGlobalPermission({ globalPermissions: ["*"] }, "audit:read"), true);
});

test("session tokens are hashed and cookies carry the required browser flags", () => {
  assert.equal(hashSessionToken("opaque-token").length, 64);
  const cookie = sessionCookie("opaque-token", true);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(cookie, /Domain=/);
});
