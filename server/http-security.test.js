import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { csrfCookie, csrfTokenMatches, readCookie, setSecurityHeaders } from "./http-security.js";

test("CSRF tokens require a matching cookie, header, and session hash", () => {
  const token = "one-time-test-token";
  const hash = createHash("sha256").update(token).digest("hex");
  assert.equal(csrfTokenMatches(token, token, hash), true);
  assert.equal(csrfTokenMatches(token, "different", hash), false);
  assert.equal(csrfTokenMatches("different", "different", hash), false);
  assert.equal(csrfTokenMatches(token, token, ""), false);
});

test("CSRF cookie is readable by the app but constrained to the host and strict same-site", () => {
  assert.match(
    csrfCookie("abc", true),
    /^__Host-monitoring_csrf=abc; Path=\/; SameSite=Strict; Max-Age=28800; Secure$/,
  );
  assert.match(csrfCookie("abc", false), /^monitoring_csrf=abc; Path=\/; SameSite=Strict/);
  assert.equal(readCookie({ headers: { cookie: "x=1; monitoring_csrf=a%20b" } }, "monitoring_csrf"), "a b");
});

test("security middleware sets CSP and baseline browser headers", () => {
  const headers = new Map();
  setSecurityHeaders({ secure: false }, { setHeader: (name, value) => headers.set(name, value) }, () => {});
  assert.match(headers.get("Content-Security-Policy"), /default-src 'self'/);
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
});
