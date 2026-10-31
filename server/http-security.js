import { createHash, timingSafeEqual } from "node:crypto";

export const CSRF_HEADER_NAME = "X-CSRF-Token";

export function readCookie(req, name) {
  const prefix = `${name}=`;
  const part = String(req.headers.cookie || "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  if (!part) return "";
  try {
    return decodeURIComponent(part.slice(prefix.length));
  } catch {
    return "";
  }
}

export function csrfCookie(token, secure, maxAgeSeconds = 8 * 60 * 60) {
  const name = secure ? "__Host-monitoring_csrf" : "monitoring_csrf";
  const value = encodeURIComponent(token || "");
  return `${name}=${value}; Path=/; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

export function csrfTokenMatches(headerToken, cookieToken, storedTokenHash) {
  if (
    typeof headerToken !== "string" ||
    !headerToken ||
    headerToken !== cookieToken ||
    typeof storedTokenHash !== "string"
  )
    return false;
  const actual = Buffer.from(createHash("sha256").update(headerToken).digest("hex"));
  const expected = Buffer.from(storedTokenHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function setSecurityHeaders(req, res, next) {
  const production = process.env.NODE_ENV === "production";
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ];
  if (production) policy.push("upgrade-insecure-requests");
  res.setHeader("Content-Security-Policy", policy.join("; "));
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (production && req.secure) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}
