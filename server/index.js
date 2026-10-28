import "dotenv/config";
import express from "express";
import cors from "cors";
import pg from "pg";
import path from "node:path";
import { existsSync, readFileSync, mkdirSync, createReadStream, unlinkSync, statSync } from "node:fs";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  GLOBAL_PERMISSIONS, PROJECT_PERMISSIONS,
  hashPassword, hashSessionToken, hasGlobalPermission, hasProjectPermission,
  loadUserById, newSessionToken, newUserId, normalizeUsername, readSessionCookie,
  sessionCookie, validPassword, validUsername, verifyPassword, writeAudit,
} from "./user-auth.js";
import { PANEL_SETTING_KEYS, redactPanelSecrets, sanitizeWorkspaceForUser, validatePanelSettings } from "./panel-settings.js";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { Resvg } from "@resvg/resvg-js";
import reshaper from "arabic-persian-reshaper";

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const workspaceKey = process.env.WORKSPACE_KEY || "monitoring-system";
const currentFile = fileURLToPath(import.meta.url);
const serverDirectory = path.dirname(currentFile);
const projectDirectory = path.resolve(serverDirectory, "..");
const distDirectory = path.join(projectDirectory, "dist");
const distIndex = path.join(distDirectory, "index.html");
const deviceSchemaPath = path.join(serverDirectory, "device-schema.sql");
const floorPlanSchemaPath = path.join(serverDirectory, "floor-plan-schema.sql");
const userAuthSchemaPath = path.join(serverDirectory, "user-auth-schema.sql");
const appStateSchemaPath = path.join(serverDirectory, "schema.sql");
const floorPlanUploadDirectory = path.join(projectDirectory, "uploads", "plans");
const deviceIconDirectory = path.join(projectDirectory, "public", "icons");
// pdf-lib's fontkit embedding needs the WOFF font, not the browser-oriented WOFF2 subset.
// Use a single font with both Arabic and Latin glyphs so mixed Persian labels
// (for example, "آدرس: 3") stay in one correctly ordered text run.
const pdfLabelFontPath = process.env.FLOOR_PLAN_PDF_FONT || path.join(process.env.WINDIR || "C:/Windows", "Fonts", "tahoma.ttf");
const configuredOrigins = (process.env.CORS_ORIGIN || "").split(",").map((origin) => origin.trim()).filter(Boolean);
const corsOptions = configuredOrigins.length ? { origin: (origin, callback) => callback(null, !origin || configuredOrigins.includes(origin)) } : undefined;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.PGHOST || undefined,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  database: process.env.PGDATABASE || undefined,
  user: process.env.PGUSER || undefined,
  password: process.env.PGPASSWORD || undefined,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

app.disable("x-powered-by");
// Trust only a local reverse proxy (such as the bundled Nginx config) for client IP headers.
app.set("trust proxy", "loopback");
app.use((req, res, next) => {
  if (req.path.startsWith("/api/esp/")) return next();
  return cors(corsOptions)(req, res, next);
});
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    console.log(`${req.ip} ${req.method} ${req.path} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
});
// Project images can be large; device and admin APIs only need small JSON bodies.
app.use((req, res, next) => {
  const isDeviceApi = req.path.startsWith("/api/esp/") || req.path.startsWith("/api/talk/");
  return express.json({ limit: isDeviceApi ? "16kb" : "25mb" })(req, res, next);
});

const siteLoginAttempts = new Map();
const DEVICE_ONLINE_WINDOW_SECONDS = 45;
const DEVICE_COMMAND_TTL_SECONDS = 90;
let deviceSchemaPromise;
let floorPlanSchemaPromise;
let userAuthSchemaPromise;
const dummyPasswordHashPromise = hashPassword(randomBytes(32).toString("hex"));

function ensureUserAuthSchema() {
  if (!userAuthSchemaPromise) {
    userAuthSchemaPromise = pool.query(readFileSync(appStateSchemaPath, "utf8")).then(() => pool.query(readFileSync(userAuthSchemaPath, "utf8"))).then(() => pool.query(
      `UPDATE app_state SET payload=jsonb_set(
         payload,
         '{state}',
         (COALESCE(payload->'state','{}'::jsonb) - 'userAccounts' - 'panelUserAccounts'),
         TRUE
       ) WHERE payload ? 'state'`,
    )).then(() => pool.query(
      `UPDATE app_state SET payload=jsonb_set(
         payload,
         '{state,savedSettingFiles}',
         COALESCE((SELECT jsonb_agg(jsonb_set(item,'{snapshot}',(COALESCE(item->'snapshot','{}'::jsonb)-'userAccounts'-'panelUserAccounts')))
                   FROM jsonb_array_elements(payload#>'{state,savedSettingFiles}') item),'[]'::jsonb),
         TRUE
       ) WHERE jsonb_typeof(payload#>'{state,savedSettingFiles}')='array'`,
    )).catch((error) => {
      userAuthSchemaPromise = null;
      throw error;
    });
  }
  return userAuthSchemaPromise;
}

function ensureFloorPlanSchema() {
  if (!floorPlanSchemaPromise) {
    floorPlanSchemaPromise = pool.query(readFileSync(floorPlanSchemaPath, "utf8")).catch((error) => {
      floorPlanSchemaPromise = null;
      throw error;
    });
  }
  return floorPlanSchemaPromise;
}

mkdirSync(floorPlanUploadDirectory, { recursive: true });
const floorPlanUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, floorPlanUploadDirectory),
    filename: (_req, _file, callback) => callback(null, `${randomUUID()}.pdf`),
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, file.mimetype === "application/pdf"),
});

const sha256 = (value) => createHash("sha256").update(value).digest();
const safeEqual = (left, right) => {
  const a = Buffer.isBuffer(left) ? left : sha256(String(left ?? ""));
  const b = Buffer.isBuffer(right) ? right : sha256(String(right ?? ""));
  return a.length === b.length && timingSafeEqual(a, b);
};

async function ensureDeviceSchema() {
  if (!deviceSchemaPromise) {
    deviceSchemaPromise = pool.query(readFileSync(deviceSchemaPath, "utf8")).catch((error) => {
      deviceSchemaPromise = null;
      throw error;
    });
  }
  return deviceSchemaPromise;
}


function requireSameOrigin(req, res, next) {
  const origin = req.get("origin");
  const expectedOrigin = `${req.protocol}://${req.get("host")}`;
  if (!origin || origin !== expectedOrigin) return res.status(403).json({ ok: false, error: "Same-origin request required" });
  return next();
}

function requireHttps(req, res, next) {
  if (process.env.NODE_ENV === "production" && !req.secure) return res.status(426).json({ ok: false, error: "HTTPS is required" });
  return next();
}

app.get("/api/site/session", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    await ensureUserAuthSchema();
    const token = readSessionCookie(req);
    if (!token) return res.json({ authenticated: false });
    const result = await pool.query("SELECT user_id FROM app_sessions WHERE token_hash=$1 AND expires_at>NOW()", [hashSessionToken(token)]);
    const user = result.rowCount ? await loadUserById(pool, result.rows[0].user_id) : null;
    if (!user?.isActive) return res.json({ authenticated: false });
    await pool.query("UPDATE app_sessions SET expires_at=NOW()+INTERVAL '8 hours',last_seen_at=NOW() WHERE token_hash=$1", [hashSessionToken(token)]);
    return res.json({ authenticated: true, user: { id: user.id, username: user.username, displayName: user.displayName, mustChangePassword: user.mustChangePassword } });
  } catch (error) {
    console.error("User session lookup error:", error);
    return res.status(503).json({ authenticated: false, error: "Authentication service temporarily unavailable" });
  }
});

app.post("/api/site/login", requireHttps, requireSameOrigin, async (req, res) => {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const attempt = siteLoginAttempts.get(ip);
  if (attempt?.blockedUntil > now) return res.status(429).json({ ok: false, error: "Too many login attempts; try again later" });
  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  try {
    await ensureUserAuthSchema();
    const result = await pool.query("SELECT id,password_hash,is_active FROM app_users WHERE username_normalized=$1", [normalizeUsername(username)]);
    const user = result.rows[0];
    const valid = user?.is_active
      ? await verifyPassword(password, user.password_hash)
      : await verifyPassword(password || "invalid-password", await dummyPasswordHashPromise);
    if (!user?.is_active || !valid) {
      await writeAudit(pool, { action: "auth.login_failed", outcome: "failure", details: { username: username.trim().slice(0, 64) } }).catch(() => {});
      const next = !attempt || attempt.resetAt <= now ? { count: 1, resetAt: now + 15 * 60 * 1000 } : { ...attempt, count: attempt.count + 1 };
      if (next.count >= 5) next.blockedUntil = now + 15 * 60 * 1000;
      siteLoginAttempts.set(ip, next);
      return res.status(next.blockedUntil ? 429 : 401).json({ ok: false, error: "نام کاربری یا رمز عبور اشتباه است." });
    }
    siteLoginAttempts.delete(ip);
    const token = newSessionToken();
    const tokenHash = hashSessionToken(token);
    await pool.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '8 hours')", [tokenHash, user.id]);
    await pool.query("UPDATE app_users SET last_login_at=NOW() WHERE id=$1", [user.id]);
    await writeAudit(pool, { actorId: user.id, targetId: user.id, action: "auth.login" });
    res.set("Set-Cookie", sessionCookie(token, req.secure || process.env.NODE_ENV === "production"));
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true });
  } catch (error) {
    console.error("User login error:", error);
    return res.status(503).json({ ok: false, error: "Authentication service temporarily unavailable" });
  }
});

app.post("/api/site/logout", requireHttps, requireSameOrigin, async (req, res) => {
  const token = readSessionCookie(req);
  try {
    await ensureUserAuthSchema();
    if (token) {
      const result = await pool.query("DELETE FROM app_sessions WHERE token_hash=$1 RETURNING user_id", [hashSessionToken(token)]);
      if (result.rowCount) await writeAudit(pool, { actorId: result.rows[0].user_id, targetId: result.rows[0].user_id, action: "auth.logout" });
    }
  } catch (error) { console.error("User logout error:", error); }
  res.set("Set-Cookie", sessionCookie("", req.secure || process.env.NODE_ENV === "production", 0));
  return res.json({ ok: true });
});

app.use(async (req, res, next) => {
  if (["/api/site/session", "/api/site/login", "/api/site/logout", "/api/health"].includes(req.path) || req.path.startsWith("/api/esp/")) return next();
  try {
    await ensureUserAuthSchema();
    const token = readSessionCookie(req);
    let user = null;
    if (token) {
      const session = await pool.query("SELECT user_id FROM app_sessions WHERE token_hash=$1 AND expires_at>NOW()", [hashSessionToken(token)]);
      if (session.rowCount) user = await loadUserById(pool, session.rows[0].user_id);
      if (!user?.isActive) {
        await pool.query("DELETE FROM app_sessions WHERE token_hash=$1", [hashSessionToken(token)]);
        user = null;
      } else await pool.query("UPDATE app_sessions SET expires_at=NOW()+INTERVAL '8 hours',last_seen_at=NOW() WHERE token_hash=$1", [hashSessionToken(token)]);
    }
    if (req.path === "/login" || req.path === "/login/") return user ? res.redirect(303, "/") : next();
    if (req.path.startsWith("/login/")) return next();
    if (user) {
      req.user = user;
      if (user.mustChangePassword && req.path.startsWith("/api/") && !["/api/auth/me", "/api/auth/password"].includes(req.path)) {
        return res.status(403).json({ ok: false, error: "Change your password before continuing" });
      }
      return next();
    }
    if (req.path.startsWith("/api/")) return res.status(401).json({ ok: false, error: "Login required" });
    return res.redirect(302, "/login?next=" + encodeURIComponent(req.originalUrl));
  } catch (error) {
    console.error("Human authentication middleware error:", error);
    if (req.path.startsWith("/api/")) return res.status(503).json({ ok: false, error: "Authentication service temporarily unavailable" });
    return res.status(503).send("Authentication service temporarily unavailable");
  }
});

// Cookie-authenticated mutations require an exact same-origin request. Device
// APIs use bearer credentials and are intentionally exempt from browser CSRF checks.
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/") || req.path.startsWith("/api/esp/") || ["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  return requireSameOrigin(req, res, next);
});

const requireUserPermission = (permission) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ ok: false, error: "Login required" });
  if (!hasGlobalPermission(req.user, permission)) return res.status(403).json({ ok: false, error: "Permission denied" });
  return next();
};

const hasManagedProjectScope = (user) => Object.values(user?.projectPermissions || {}).some((permissions) => permissions.includes("project:manage"));
const requireUserReadOrProjectManager = (req, res, next) => {
  if (hasGlobalPermission(req.user, "users:read") || hasGlobalPermission(req.user, "users:manage") || hasGlobalPermission(req.user, "*") || hasManagedProjectScope(req.user)) return next();
  return res.status(403).json({ ok: false, error: "Permission denied" });
};
const requireUserManageOrProjectManager = (req, res, next) => {
  if (hasGlobalPermission(req.user, "users:manage") || hasGlobalPermission(req.user, "*") || hasManagedProjectScope(req.user)) return next();
  return res.status(403).json({ ok: false, error: "Permission denied" });
};
const requireAuditRead = (req, res, next) => {
  if (hasGlobalPermission(req.user, "audit:read") || hasGlobalPermission(req.user, "*") || Object.values(req.user.projectPermissions || {}).some((permissions) => permissions.includes("audit:read"))) return next();
  return res.status(403).json({ ok: false, error: "Permission denied" });
};

async function getWorkspaceProjects() {
  const result = await pool.query("SELECT payload FROM app_state WHERE workspace_key=$1", [workspaceKey]);
  const items = result.rows[0]?.payload?.projects;
  return Array.isArray(items) ? items : [];
}

function canAccessProject(user, projectId) {
  if (hasGlobalPermission(user, "projects:all") || hasGlobalPermission(user, "projects:manage") || hasGlobalPermission(user, "panels:all") || hasGlobalPermission(user, "*")) return true;
  return Boolean((user?.projectPanels?.[projectId] || []).length || hasProjectPermission(user, projectId, "project:manage"));
}

function canAccessPanel(user, projectId, panelId) {
  if (hasGlobalPermission(user, "panels:all") || hasGlobalPermission(user, "*")) return true;
  return Boolean(panelId && (user?.projectPanels?.[projectId] || []).includes(String(panelId)));
}

function canManageProjectResource(user, projectId) {
  return hasGlobalPermission(user, "projects:all") || hasGlobalPermission(user, "projects:manage") || hasGlobalPermission(user, "*") || hasProjectPermission(user, projectId, "project:manage");
}

function canManageDevices(user, projectId) {
  if (hasGlobalPermission(user, "devices:manage") || hasGlobalPermission(user, "*")) return true;
  return Boolean(projectId && hasProjectPermission(user, projectId, "devices:manage"));
}

function requireDeviceAdmin(req, res, next) {
  const hasAnyDeviceGrant = hasGlobalPermission(req.user, "devices:manage") || hasGlobalPermission(req.user, "*") || Object.values(req.user.projectPermissions || {}).some((permissions) => permissions.includes("devices:manage"));
  if (!hasAnyDeviceGrant) return res.status(403).json({ ok: false, error: "Device management permission required" });
  return next();
}

async function requireManagedDevice(req, res, next) {
  try {
    await ensureDeviceSchema();
    const result = await pool.query("SELECT project_id FROM esp_devices WHERE device_id=$1 AND revoked_at IS NULL", [req.params.deviceId]);
    if (!result.rowCount) return res.status(404).json({ ok: false, error: "Device not found" });
    if (!canManageDevices(req.user, result.rows[0].project_id)) return res.status(403).json({ ok: false, error: "Device management permission required" });
    req.managedDeviceProjectId = result.rows[0].project_id;
    return next();
  } catch (error) {
    console.error("Device authorization error:", error);
    return sendDeviceDatabaseError(res);
  }
}

app.get("/api/auth/me", async (req, res) => {
  return res.json({ ok: true, user: { id: req.user.id, username: req.user.username, displayName: req.user.displayName, mustChangePassword: req.user.mustChangePassword, globalPermissions: req.user.globalPermissions, projectPanels: req.user.projectPanels, projectPermissions: req.user.projectPermissions } });
});

app.post("/api/auth/password", requireHttps, requireSameOrigin, async (req, res) => {
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (!validPassword(newPassword)) return res.status(400).json({ ok: false, error: "Password must contain 10 to 256 characters" });
  try {
    const existing = await pool.query("SELECT password_hash FROM app_users WHERE id=$1", [req.user.id]);
    if (!existing.rowCount || !await verifyPassword(currentPassword, existing.rows[0].password_hash)) return res.status(401).json({ ok: false, error: "Current password is incorrect" });
    const passwordHash = await hashPassword(newPassword);
    await pool.query("UPDATE app_users SET password_hash=$2,must_change_password=FALSE,updated_at=NOW() WHERE id=$1", [req.user.id, passwordHash]);
    const token = readSessionCookie(req);
    await pool.query("DELETE FROM app_sessions WHERE user_id=$1 AND token_hash<>$2", [req.user.id, hashSessionToken(token)]);
    await writeAudit(pool, { actorId: req.user.id, targetId: req.user.id, action: "user.password_changed" });
    return res.json({ ok: true });
  } catch (error) { console.error("Password change error:", error); return res.status(503).json({ ok: false, error: "Could not change password" }); }
});

app.get("/api/users", requireUserReadOrProjectManager, async (req, res) => {
  try {
    const scoped = !hasGlobalPermission(req.user, "users:read") && !hasGlobalPermission(req.user, "users:manage") && !hasGlobalPermission(req.user, "*");
    const managedIds = Object.entries(req.user.projectPermissions || {}).filter(([, permissions]) => permissions.includes("project:manage")).map(([id]) => id);
    const result = await pool.query(
      `SELECT u.id,u.username,u.display_name AS "displayName",CASE WHEN $1 THEN NULL ELSE u.email END AS email,CASE WHEN $1 THEN NULL ELSE u.phone END AS phone,u.is_active AS "isActive",
              CASE WHEN $1 THEN FALSE ELSE u.must_change_password END AS "mustChangePassword",u.created_at AS "createdAt",CASE WHEN $1 THEN NULL ELSE u.last_login_at END AS "lastLoginAt",
              (SELECT MAX(l.created_at) FROM app_audit_log l WHERE (l.actor_user_id=u.id OR l.target_user_id=u.id) AND (NOT $1 OR l.project_id=ANY($2::text[]))) AS "lastActivityAt",
              (SELECT COUNT(*) FROM app_user_projects p WHERE p.user_id=u.id AND (NOT $1 OR p.project_id=ANY($2::text[])))::int AS "projectCount",
              (SELECT COUNT(*) FROM app_user_panels p WHERE p.user_id=u.id AND (NOT $1 OR p.project_id=ANY($2::text[])))::int AS "panelCount",
              (SELECT COUNT(*) FROM app_user_project_permissions pp WHERE pp.user_id=u.id AND (NOT $1 OR pp.project_id=ANY($2::text[])))::int AS "projectPermissionCount",
              COALESCE((SELECT array_agg(p.project_id ORDER BY p.project_id) FROM app_user_projects p WHERE p.user_id=u.id AND (NOT $1 OR p.project_id=ANY($2::text[]))),ARRAY[]::text[]) AS "projectIds",
              COALESCE((SELECT array_agg(DISTINCT pp.permission ORDER BY pp.permission) FROM app_user_project_permissions pp WHERE pp.user_id=u.id AND pp.permission IN ('project:manage','permissions:delegate','devices:manage') AND (NOT $1 OR pp.project_id=ANY($2::text[]))),ARRAY[]::text[]) AS "projectPermissionsSummary",
              CASE WHEN $1 THEN ARRAY[]::text[] ELSE COALESCE((SELECT array_agg(permission ORDER BY permission) FROM app_user_global_permissions g WHERE g.user_id=u.id),ARRAY[]::text[]) END AS "globalPermissions"
       FROM app_users u WHERE NOT $1 OR EXISTS(SELECT 1 FROM app_user_projects up WHERE up.user_id=u.id AND up.project_id=ANY($2::text[])) OR NOT EXISTS(SELECT 1 FROM app_user_projects up WHERE up.user_id=u.id) ORDER BY u.display_name,u.username`,
      [scoped, managedIds],
    );
    return res.json({ ok: true, users: result.rows });
  } catch (error) { console.error("User list error:", error); return res.status(503).json({ ok: false, error: "Could not load users" }); }
});

app.post("/api/users", requireHttps, requireSameOrigin, requireUserPermission("users:manage"), async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const displayName = String(req.body?.displayName || "").trim();
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!validUsername(username) || displayName.length < 1 || displayName.length > 160 || !validPassword(password)) return res.status(400).json({ ok: false, error: "Enter a valid username, display name, and password (at least 10 characters)" });
  const id = newUserId();
  try {
    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO app_users(id,username,username_normalized,password_hash,display_name,email,phone,created_by,must_change_password)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
       RETURNING id,username,display_name AS "displayName",is_active AS "isActive",created_at AS "createdAt"`,
      [id, username, normalizeUsername(username), passwordHash, displayName, String(req.body?.email || "").trim().slice(0,254) || null, String(req.body?.phone || "").trim().slice(0,40) || null, req.user.id],
    );
    await writeAudit(pool, { actorId: req.user.id, targetId: id, action: "user.created" });
    return res.status(201).json({ ok: true, user: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ ok: false, error: "Username is already in use" });
    console.error("User create error:", error); return res.status(503).json({ ok: false, error: "Could not create user" });
  }
});

app.get("/api/users/:id", requireUserPermission("users:read"), async (req, res) => {
  try {
    const user = await loadUserById(pool, req.params.id);
    if (!user) return res.sendStatus(404);
    return res.json({ ok: true, user });
  } catch (error) { console.error("User detail error:", error); return res.status(503).json({ ok: false, error: "Could not load user" }); }
});

app.patch("/api/users/:id", requireHttps, requireSameOrigin, requireUserPermission("users:manage"), async (req, res) => {
  const displayName = String(req.body?.displayName || "").trim();
  const email = String(req.body?.email || "").trim().slice(0,254) || null;
  const phone = String(req.body?.phone || "").trim().slice(0,40) || null;
  if (!displayName || displayName.length > 160) return res.status(400).json({ ok: false, error: "Display name is required" });
  try {
    const result = await pool.query("UPDATE app_users SET display_name=$2,email=$3,phone=$4,updated_at=NOW() WHERE id=$1 RETURNING id", [req.params.id, displayName, email, phone]);
    if (!result.rowCount) return res.sendStatus(404);
    await writeAudit(pool, { actorId: req.user.id, targetId: req.params.id, action: "user.updated", details: { displayName, email, phone } });
    return res.json({ ok: true });
  } catch (error) { console.error("User update error:", error); return res.status(503).json({ ok: false, error: "Could not update user" }); }
});

app.patch("/api/users/:id/status", requireHttps, requireSameOrigin, requireUserPermission("users:manage"), async (req, res) => {
  if (typeof req.body?.isActive !== "boolean") return res.status(400).json({ ok: false, error: "isActive must be boolean" });
  if (req.params.id === req.user.id && !req.body.isActive) return res.status(400).json({ ok: false, error: "You cannot disable your own account" });
  const client = await pool.connect().catch(() => null);
  if (!client) return res.status(503).json({ ok: false, error: "User service unavailable" });
  try {
    await client.query("BEGIN");
    const result = await client.query("UPDATE app_users SET is_active=$2,updated_at=NOW() WHERE id=$1 RETURNING id", [req.params.id, req.body.isActive]);
    if (!result.rowCount) { await client.query("ROLLBACK"); return res.sendStatus(404); }
    if (!req.body.isActive) await client.query("DELETE FROM app_sessions WHERE user_id=$1", [req.params.id]);
    if (!req.body.isActive) {
      const admins = await client.query(`SELECT COUNT(DISTINCT u.id)::int AS count FROM app_users u
        WHERE u.is_active AND (EXISTS (SELECT 1 FROM app_user_global_permissions p WHERE p.user_id=u.id AND p.permission='*')
          OR (EXISTS (SELECT 1 FROM app_user_global_permissions p WHERE p.user_id=u.id AND p.permission='users:manage')
          AND EXISTS (SELECT 1 FROM app_user_global_permissions p WHERE p.user_id=u.id AND p.permission='projects:manage')
          AND EXISTS (SELECT 1 FROM app_user_global_permissions p WHERE p.user_id=u.id AND p.permission='permissions:delegate')))`);
      if (!admins.rows[0].count) { await client.query("ROLLBACK"); return res.status(409).json({ ok: false, error: "At least one active global administrator must remain" }); }
    }
    await client.query(`INSERT INTO app_audit_log(actor_user_id,target_user_id,action,details) VALUES($1,$2,$3,$4::jsonb)`, [req.user.id, req.params.id, req.body.isActive ? "user.activated" : "user.deactivated", JSON.stringify({ isActive: req.body.isActive })]);
    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); console.error("User status error:", error); return res.status(503).json({ ok: false, error: "Could not update account status" }); }
  finally { client.release(); }
});

app.post("/api/users/:id/password-reset", requireHttps, requireSameOrigin, requireUserPermission("users:manage"), async (req, res) => {
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!validPassword(password)) return res.status(400).json({ ok: false, error: "Password must contain 10 to 256 characters" });
  try {
    const passwordHash = await hashPassword(password);
    const result = await pool.query("UPDATE app_users SET password_hash=$2,must_change_password=TRUE,updated_at=NOW() WHERE id=$1 RETURNING id", [req.params.id, passwordHash]);
    if (!result.rowCount) return res.sendStatus(404);
    await pool.query("DELETE FROM app_sessions WHERE user_id=$1", [req.params.id]);
    await writeAudit(pool, { actorId: req.user.id, targetId: req.params.id, action: "user.password_reset" });
    return res.json({ ok: true });
  } catch (error) { console.error("Password reset error:", error); return res.status(503).json({ ok: false, error: "Could not reset password" }); }
});

app.get("/api/users/:id/access", requireUserReadOrProjectManager, async (req, res) => {
  try {
    const user = await loadUserById(pool, req.params.id);
    if (!user) return res.sendStatus(404);
    const projects = await getWorkspaceProjects();
    const globalReader = hasGlobalPermission(req.user, "users:read") || hasGlobalPermission(req.user, "users:manage") || hasGlobalPermission(req.user, "*");
    const visible = projects.filter((project) => globalReader || hasProjectPermission(req.user, project.id, "project:manage"));
    return res.json({ ok: true, projects: visible.map((project) => ({ projectId: project.id, projectName: project.name, isActive: Object.hasOwn(user.projectPanels || {}, project.id) || Object.hasOwn(user.projectPermissions || {}, project.id), panelIds: user.projectPanels?.[project.id] || [], panels: (project.panels || []).map((panel) => ({ id: panel.id, name: panel.name, allowed: hasGlobalPermission(user, "panels:all") || hasGlobalPermission(user, "*") || (user.projectPanels?.[project.id] || []).includes(panel.id) })), permissions: user.projectPermissions?.[project.id] || [] })), globalPermissions: globalReader ? user.globalPermissions : [] });
  } catch (error) { console.error("User access read error:", error); return res.status(503).json({ ok: false, error: "Could not load access" }); }
});

app.put("/api/users/:id/access", requireHttps, requireSameOrigin, requireUserManageOrProjectManager, async (req, res) => {
  const requestedGlobals = req.body?.globalPermissions;
  const requestedProjects = req.body?.projects;
  if (!Array.isArray(requestedGlobals) || !Array.isArray(requestedProjects)) return res.status(400).json({ ok: false, error: "Invalid access payload" });
  if (requestedGlobals.some((permission) => !GLOBAL_PERMISSIONS.includes(permission)) || requestedProjects.some((item) => !item || typeof item.projectId !== "string" || (item.isActive !== undefined && typeof item.isActive !== "boolean") || !Array.isArray(item.panelIds) || !Array.isArray(item.permissions) || item.permissions.some((p) => !PROJECT_PERMISSIONS.includes(p)))) return res.status(400).json({ ok: false, error: "Unknown permission" });
  try {
    const workspaceProjects = await getWorkspaceProjects();
    const projectMap = new Map(workspaceProjects.map((project) => [String(project.id), project]));
    for (const item of requestedProjects) {
      const project = projectMap.get(item.projectId);
      if (!project || item.panelIds.some((id) => !(project.panels || []).some((panel) => String(panel.id) === String(id)))) return res.status(400).json({ ok: false, error: "Unknown project or panel" });
      if (!hasGlobalPermission(req.user, "projects:all") && !hasGlobalPermission(req.user, "projects:manage") && !hasGlobalPermission(req.user, "*") && !hasProjectPermission(req.user, item.projectId, "project:manage")) return res.status(403).json({ ok: false, error: "You cannot manage this project" });
    }
    const existingGlobal = await pool.query("SELECT permission FROM app_user_global_permissions WHERE user_id=$1 ORDER BY permission", [req.params.id]);
    const previousGlobals = existingGlobal.rows.map((row) => row.permission).sort();
    if (hasGlobalPermission(req.user, "users:manage") && !hasGlobalPermission(req.user, "*") && JSON.stringify([...requestedGlobals].sort()) !== JSON.stringify(previousGlobals)) return res.status(403).json({ ok: false, error: "Only a global administrator can change global permissions" });
    for (const item of requestedProjects) if (item.permissions.some((permission) => !hasGlobalPermission(req.user, "*") && !hasProjectPermission(req.user, item.projectId, permission))) return res.status(403).json({ ok: false, error: "You cannot delegate this project permission" });
    const manageableProjectIds = workspaceProjects.filter((project) => hasGlobalPermission(req.user, "projects:all") || hasGlobalPermission(req.user, "projects:manage") || hasGlobalPermission(req.user, "*") || hasProjectPermission(req.user, project.id, "project:manage")).map((project) => String(project.id));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const exists = await client.query("SELECT id FROM app_users WHERE id=$1 FOR UPDATE", [req.params.id]);
      if (!exists.rowCount) { await client.query("ROLLBACK"); return res.sendStatus(404); }
      const previousProjects = await client.query(
        `SELECT up.project_id AS "projectId",
                COALESCE(array_agg(DISTINCT p.panel_id) FILTER (WHERE p.panel_id IS NOT NULL), ARRAY[]::text[]) AS "panelIds",
                COALESCE(array_agg(DISTINCT pp.permission) FILTER (WHERE pp.permission IS NOT NULL), ARRAY[]::text[]) AS permissions
         FROM app_user_projects up
         LEFT JOIN app_user_panels p ON p.user_id=up.user_id AND p.project_id=up.project_id
         LEFT JOIN app_user_project_permissions pp ON pp.user_id=up.user_id AND pp.project_id=up.project_id
         WHERE up.user_id=$1 GROUP BY up.project_id ORDER BY up.project_id`, [req.params.id],
      );
      if (hasGlobalPermission(req.user, "*")) {
        await client.query("DELETE FROM app_user_global_permissions WHERE user_id=$1", [req.params.id]);
        for (const permission of requestedGlobals) await client.query("INSERT INTO app_user_global_permissions(user_id,permission,granted_by) VALUES($1,$2,$3)", [req.params.id, permission, req.user.id]);
      }
      await client.query("DELETE FROM app_user_projects WHERE user_id=$1 AND project_id=ANY($2::text[])", [req.params.id, manageableProjectIds]);
      for (const item of requestedProjects) {
        if (item.isActive === false && !item.panelIds.length && !item.permissions.length) continue;
        await client.query("INSERT INTO app_user_projects(user_id,project_id,granted_by) VALUES($1,$2,$3)", [req.params.id, item.projectId, req.user.id]);
        for (const panelId of item.panelIds) await client.query("INSERT INTO app_user_panels(user_id,project_id,panel_id,granted_by) VALUES($1,$2,$3,$4)", [req.params.id, item.projectId, panelId, req.user.id]);
        for (const permission of item.permissions) await client.query("INSERT INTO app_user_project_permissions(user_id,project_id,permission,granted_by) VALUES($1,$2,$3,$4)", [req.params.id, item.projectId, permission, req.user.id]);
      }
      const admins = await client.query(`SELECT COUNT(DISTINCT u.id)::int AS count FROM app_users u
        WHERE u.is_active AND (EXISTS (SELECT 1 FROM app_user_global_permissions p WHERE p.user_id=u.id AND p.permission='*')
          OR (EXISTS (SELECT 1 FROM app_user_global_permissions p WHERE p.user_id=u.id AND p.permission='users:manage')
          AND EXISTS (SELECT 1 FROM app_user_global_permissions p WHERE p.user_id=u.id AND p.permission='projects:manage')
          AND EXISTS (SELECT 1 FROM app_user_global_permissions p WHERE p.user_id=u.id AND p.permission='permissions:delegate')))`);
      if (!admins.rows[0].count) { await client.query("ROLLBACK"); return res.status(409).json({ ok: false, error: "At least one active global administrator must remain" }); }
      await client.query("INSERT INTO app_audit_log(actor_user_id,target_user_id,action,details) VALUES($1,$2,'user.access_updated',$3::jsonb)", [req.user.id, req.params.id, JSON.stringify({ source: "/api/users/:id/access", before: { globalPermissions: previousGlobals, projects: previousProjects.rows }, after: { globalPermissions: requestedGlobals, projects: requestedProjects } })]);
      await client.query("COMMIT");
      return res.json({ ok: true });
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  } catch (error) { console.error("User access save error:", error); return res.status(503).json({ ok: false, error: "Could not save access" }); }
});

app.get("/api/audit", requireAuditRead, async (req, res) => {
  const target = String(req.query.userId || "");
  if (target && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target)) return res.status(400).json({ ok: false, error: "Invalid user id" });
  const category = String(req.query.category || "");
  if (category && !["login", "access", "panel", "account"].includes(category)) return res.status(400).json({ ok: false, error: "Invalid activity category" });
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  const pageSize = Math.max(10, Math.min(100, Number.parseInt(req.query.pageSize, 10) || 25));
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) return res.status(400).json({ ok: false, error: "Invalid date filter" });
  if (from && to && from > to) return res.status(400).json({ ok: false, error: "Start date must be before end date" });
  try {
    const global = hasGlobalPermission(req.user, "audit:read") || hasGlobalPermission(req.user, "*");
    const scopedProjectIds = Object.entries(req.user.projectPermissions || {}).filter(([, permissions]) => permissions.includes("audit:read")).map(([id]) => id);
    const workspaceProjects = await getWorkspaceProjects();
    const visibleProjects = workspaceProjects.filter((project) => global || scopedProjectIds.includes(String(project.id)));
    const values = [];
    const where = [];
    const add = (sql, value) => { values.push(value); where.push(sql.replace("?", `$${values.length}`)); };
    if (!global) add("l.project_id = ANY(?::text[])", scopedProjectIds);
    if (target) { values.push(target); where.push(`(l.target_user_id=$${values.length}::uuid OR l.actor_user_id=$${values.length}::uuid)`); }
    if (req.query.action) add("l.action = ?", String(req.query.action).slice(0, 100));
    if (category === "login") where.push("l.action LIKE 'auth.%'");
    if (category === "access") where.push("l.action IN ('user.access_updated','project.access_revoked')");
    if (category === "panel") where.push("(l.action LIKE 'panel.%' OR l.action LIKE 'device.%')");
    if (category === "account") where.push("(l.action LIKE 'user.%' AND l.action <> 'user.access_updated')");
    if (req.query.projectId === "none") where.push("l.project_id IS NULL");
    else if (req.query.projectId) add("l.project_id = ?", String(req.query.projectId).slice(0, 120));
    if (req.query.panelId === "none") where.push("l.panel_id IS NULL");
    else if (req.query.panelId) add("l.panel_id = ?", String(req.query.panelId).slice(0, 120));
    if (req.query.outcome === "failure") where.push("l.outcome IN ('failure','denied')");
    else if (req.query.outcome) add("l.outcome = ?", String(req.query.outcome).slice(0, 24));
    if (from) add("l.created_at >= ?::date", from);
    if (to) add("l.created_at < (?::date + INTERVAL '1 day')", to);
    if (req.query.q) {
      const query = String(req.query.q).slice(0, 160);
      values.push(`%${query}%`);
      const i = values.length;
      const searchParts = [`l.action ILIKE $${i}`, `COALESCE(actor.username,'') ILIKE $${i}`, `COALESCE(actor.display_name,'') ILIKE $${i}`, `COALESCE(target.username,'') ILIKE $${i}`, `COALESCE(target.display_name,'') ILIKE $${i}`, `COALESCE(l.project_id,'') ILIKE $${i}`, `COALESCE(l.panel_id,'') ILIKE $${i}`, `l.details::text ILIKE $${i}`];
      const matchingProjects = visibleProjects.filter((project) => String(project.name || "").toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((project) => String(project.id));
      const matchingPanels = visibleProjects.flatMap((project) => (project.panels || []).filter((panel) => String(panel.name || "").toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((panel) => String(panel.id)));
      if (matchingProjects.length) { values.push(matchingProjects); searchParts.push(`l.project_id=ANY($${values.length}::text[])`); }
      if (matchingPanels.length) { values.push(matchingPanels); searchParts.push(`l.panel_id=ANY($${values.length}::text[])`); }
      where.push(`(${searchParts.join(" OR ")})`);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const base = `FROM app_audit_log l LEFT JOIN app_users actor ON actor.id=l.actor_user_id LEFT JOIN app_users target ON target.id=l.target_user_id ${clause}`;
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER(WHERE l.action='auth.login_failed')::int AS "failedLogins", COUNT(*) FILTER(WHERE l.action IN ('user.access_updated','project.access_revoked'))::int AS "accessChanges", COUNT(*) FILTER(WHERE l.action LIKE 'panel.%' OR l.action LIKE 'device.%')::int AS "panelOperations" ${base}`, values);
    const total = countResult.rows[0].total;
    const offset = (page - 1) * pageSize;
    const rows = await pool.query(`SELECT l.id,l.action,l.project_id AS "projectId",l.panel_id AS "panelId",l.outcome,l.details,l.created_at AS "createdAt", actor.username AS "actorUsername",actor.display_name AS "actorName",target.username AS "targetUsername",target.display_name AS "targetName" ${base} ORDER BY l.created_at DESC,l.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, pageSize, offset]);
    const filterUsers = global
      ? await pool.query("SELECT DISTINCT u.id,u.username,u.display_name AS \"displayName\" FROM app_audit_log l JOIN app_users u ON u.id=l.actor_user_id OR u.id=l.target_user_id ORDER BY u.display_name,u.username LIMIT 500")
      : await pool.query("SELECT DISTINCT u.id,u.username,u.display_name AS \"displayName\" FROM app_audit_log l JOIN app_users u ON u.id=l.actor_user_id OR u.id=l.target_user_id WHERE l.project_id=ANY($1::text[]) ORDER BY u.display_name,u.username LIMIT 500", [scopedProjectIds]);
    const projectById = new Map(workspaceProjects.map((p) => [String(p.id), p]));
    const events = rows.rows.map((event) => { const project = projectById.get(String(event.projectId)); const panel = project?.panels?.find((p) => String(p.id) === String(event.panelId)); return { ...event, projectName: project?.name || null, panelName: panel?.name || null }; });
    const filterProjects = visibleProjects.map((project) => ({ id: project.id, name: project.name, panels: (project.panels || []).map((panel) => ({ id: panel.id, name: panel.name })) }));
    return res.json({ ok: true, events, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), summary: { total, failedLogins: countResult.rows[0].failedLogins, accessChanges: countResult.rows[0].accessChanges, panelOperations: countResult.rows[0].panelOperations }, filters: { projects: filterProjects, users: filterUsers.rows } });
  } catch (error) { console.error("Audit list error:", error); return res.status(503).json({ ok: false, error: "Could not load activity" }); }
});

const sendDeviceDatabaseError = (res) => res.status(503).json({ ok: false, error: "Device service temporarily unavailable" });

async function authenticateDevice(req, res, next) {
  const deviceId = req.params.deviceId || req.get("x-device-id") || "";
  const match = (req.get("authorization") || "").match(/^Bearer ([A-Za-z0-9_-]{40,100})$/);
  if (!deviceId || !match) return res.status(401).json({ ok: false, error: "Device credentials required" });
  try {
    await ensureDeviceSchema();
    const result = await pool.query(
      "SELECT device_id, token_hash, revoked_at FROM esp_devices WHERE device_id = $1",
      [deviceId],
    );
    const device = result.rows[0];
    if (!device || device.revoked_at || !safeEqual(device.token_hash, sha256(match[1]))) {
      return res.status(401).json({ ok: false, error: "Invalid device credentials" });
    }
    req.espDevice = device;
    return next();
  } catch (error) {
    console.error("ESP device authentication error:", error);
    return sendDeviceDatabaseError(res);
  }
}

app.get("/api/talk/session", (req, res) => {
  res.set("Cache-Control", "no-store");
  const authorized = hasGlobalPermission(req.user, "devices:manage") || hasGlobalPermission(req.user, "*") || Object.values(req.user.projectPermissions || {}).some((permissions) => permissions.includes("devices:manage"));
  return res.json({ authenticated: authorized, user: { id: req.user.id, displayName: req.user.displayName } });
});

app.post("/api/talk/pairing", requireHttps, requireSameOrigin, requireDeviceAdmin, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 100) : "";
  const projectId = typeof req.body?.projectId === "string" && req.body.projectId.length <= 100 ? req.body.projectId : null;
  if (!canManageDevices(req.user, projectId)) return res.status(403).json({ ok: false, error: "Device management permission required for this project" });
  try {
    await ensureDeviceSchema();
    if (projectId && !(await getWorkspaceProjects()).some((project) => String(project.id) === projectId)) return res.status(400).json({ ok: false, error: "Unknown project" });
    const code = randomBytes(24).toString("base64url");
    await pool.query("DELETE FROM esp_pairing_tokens WHERE expires_at <= NOW() OR used_at IS NOT NULL");
    await pool.query("INSERT INTO esp_pairing_tokens (token_hash, device_name, project_id, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')", [sha256(code), name, projectId]);
    await writeAudit(pool, { actorId: req.user.id, action: "device.pairing_created", projectId, details: { name } });
    res.set("Cache-Control", "no-store");
    return res.status(201).json({ ok: true, provisioningCode: code, expiresInSeconds: 600 });
  } catch (error) {
    console.error("ESP pairing token creation error:", error);
    return sendDeviceDatabaseError(res);
  }
});

app.get("/api/talk/devices", requireDeviceAdmin, async (req, res) => {
  try {
    await ensureDeviceSchema();
    const result = await pool.query(
      `SELECT d.device_id AS "deviceId", d.name, d.project_id AS "projectId", d.firmware_version AS "firmwareVersion",
              d.last_seen_at AS "lastSeenAt", d.last_ip AS "lastIp", d.created_at AS "createdAt", d.metadata,
              (d.last_seen_at >= NOW() - ($1::int * INTERVAL '1 second')) AS online
       FROM esp_devices d WHERE d.revoked_at IS NULL ORDER BY d.created_at DESC`,
      [DEVICE_ONLINE_WINDOW_SECONDS],
    );
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, devices: result.rows.filter((device) => canManageDevices(req.user, device.projectId)) });
  } catch (error) {
    console.error("ESP device listing error:", error);
    return sendDeviceDatabaseError(res);
  }
});

app.delete("/api/talk/devices/:deviceId", requireHttps, requireSameOrigin, requireDeviceAdmin, requireManagedDevice, async (req, res) => {
  try {
    await ensureDeviceSchema();
    const result = await pool.query(
      "UPDATE esp_devices SET revoked_at = NOW(), token_hash = $2 WHERE device_id = $1 AND revoked_at IS NULL RETURNING device_id",
      [req.params.deviceId, randomBytes(32)],
    );
    if (!result.rowCount) return res.status(404).json({ ok: false, error: "Device not found" });
    await pool.query("UPDATE esp_commands SET status = 'expired' WHERE device_id = $1 AND status IN ('pending', 'claimed')", [req.params.deviceId]);
    await writeAudit(pool, { actorId: req.user.id, action: "device.revoked", projectId: req.managedDeviceProjectId, details: { deviceId: req.params.deviceId } });
    return res.json({ ok: true });
  } catch (error) {
    console.error("ESP device revocation error:", error);
    return sendDeviceDatabaseError(res);
  }
});

app.post("/api/talk/devices/:deviceId/commands", requireHttps, requireSameOrigin, requireDeviceAdmin, requireManagedDevice, async (req, res) => {
  const command = typeof req.body?.command === "string" ? req.body.command.trim() : "";
  if (!command || command.length > 256 || /[\u0000-\u001f\u007f]/.test(command)) {
    return res.status(400).json({ ok: false, error: "Command must be 1–256 printable characters" });
  }
  try {
    await ensureDeviceSchema();
    const device = await pool.query("SELECT device_id FROM esp_devices WHERE device_id = $1 AND revoked_at IS NULL", [req.params.deviceId]);
    if (!device.rowCount) return res.status(404).json({ ok: false, error: "Device not found" });
    const pending = await pool.query("SELECT count(*)::int AS count FROM esp_commands WHERE device_id = $1 AND status IN ('pending', 'claimed') AND expires_at > NOW()", [req.params.deviceId]);
    if (pending.rows[0].count >= 10) return res.status(429).json({ ok: false, error: "Device command queue is full" });
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO esp_commands (id, device_id, command, expires_at)
       VALUES ($1, $2, $3, NOW() + ($4::int * INTERVAL '1 second'))
       RETURNING id, command, status, created_at AS "createdAt", expires_at AS "expiresAt"`,
      [id, req.params.deviceId, command, DEVICE_COMMAND_TTL_SECONDS],
    );
    await writeAudit(pool, { actorId: req.user.id, action: "device.command_queued", projectId: req.managedDeviceProjectId, details: { deviceId: req.params.deviceId, command } });
    return res.status(201).json({ ok: true, command: result.rows[0] });
  } catch (error) {
    console.error("ESP command enqueue error:", error);
    return sendDeviceDatabaseError(res);
  }
});

app.get("/api/talk/devices/:deviceId/commands", requireDeviceAdmin, requireManagedDevice, async (req, res) => {
  try {
    await ensureDeviceSchema();
    const result = await pool.query(
      `SELECT c.id, c.command, c.status, c.response, c.error, c.created_at AS "createdAt", c.claimed_at AS "claimedAt", c.completed_at AS "completedAt", c.expires_at AS "expiresAt"
       FROM esp_commands c JOIN esp_devices d ON d.device_id = c.device_id
       WHERE c.device_id = $1 AND c.created_at > COALESCE(GREATEST(d.commands_cleared_at, d.history_cleared_at), '-infinity'::timestamptz)
       ORDER BY c.created_at DESC LIMIT 50`,
      [req.params.deviceId],
    );
    return res.json({ ok: true, commands: result.rows });
  } catch (error) {
    console.error("ESP command history error:", error);
    return sendDeviceDatabaseError(res);
  }
});

app.get("/api/talk/devices/:deviceId/messages", requireDeviceAdmin, requireManagedDevice, async (req, res) => {
  try {
    await ensureDeviceSchema();
    const result = await pool.query(
      `SELECT m.id, m.sender, m.message, m.created_at AS "createdAt", m.delivered_at AS "deliveredAt"
       FROM esp_chat_messages m JOIN esp_devices d ON d.device_id = m.device_id
       WHERE m.device_id = $1 AND m.created_at > COALESCE(GREATEST(d.messages_cleared_at, d.history_cleared_at), '-infinity'::timestamptz)
       ORDER BY m.created_at DESC LIMIT 100`,
      [req.params.deviceId],
    );
    return res.json({ ok: true, messages: result.rows.reverse() });
  } catch (error) {
    console.error("ESP chat history error:", error);
    return sendDeviceDatabaseError(res);
  }
});

app.delete("/api/talk/devices/:deviceId/commands/history", requireHttps, requireSameOrigin, requireDeviceAdmin, requireManagedDevice, async (req, res) => {
  const client = await pool.connect().catch(() => null);
  if (!client) return sendDeviceDatabaseError(res);
  try {
    await ensureDeviceSchema();
    await client.query("BEGIN");
    const device = await client.query(
      "UPDATE esp_devices SET commands_cleared_at = clock_timestamp() WHERE device_id = $1 AND revoked_at IS NULL RETURNING commands_cleared_at",
      [req.params.deviceId],
    );
    if (!device.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Device not found" });
    }
    const cutoff = device.rows[0].commands_cleared_at;
    const commands = await client.query(
      "DELETE FROM esp_commands WHERE device_id = $1 AND status IN ('completed', 'failed', 'expired') AND created_at <= $2",
      [req.params.deviceId, cutoff],
    );
    await client.query("COMMIT");
    return res.json({ ok: true, removedCommands: commands.rowCount });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ESP command history clear error:", error);
    return sendDeviceDatabaseError(res);
  } finally {
    client.release();
  }
});

app.delete("/api/talk/devices/:deviceId/messages", requireHttps, requireSameOrigin, requireDeviceAdmin, requireManagedDevice, async (req, res) => {
  const client = await pool.connect().catch(() => null);
  if (!client) return sendDeviceDatabaseError(res);
  try {
    await ensureDeviceSchema();
    await client.query("BEGIN");
    const device = await client.query(
      "UPDATE esp_devices SET messages_cleared_at = clock_timestamp() WHERE device_id = $1 AND revoked_at IS NULL RETURNING messages_cleared_at",
      [req.params.deviceId],
    );
    if (!device.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Device not found" });
    }
    const messages = await client.query(
      "DELETE FROM esp_chat_messages WHERE device_id = $1 AND created_at <= $2",
      [req.params.deviceId, device.rows[0].messages_cleared_at],
    );
    await client.query("COMMIT");
    return res.json({ ok: true, removedMessages: messages.rowCount });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ESP chat clear error:", error);
    return sendDeviceDatabaseError(res);
  } finally {
    client.release();
  }
});

app.post("/api/talk/devices/:deviceId/messages", requireHttps, requireSameOrigin, requireDeviceAdmin, requireManagedDevice, async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > 256 || /[\u0000-\u001f\u007f]/.test(message)) {
    return res.status(400).json({ ok: false, error: "Message must be 1–256 printable characters" });
  }
  try {
    await ensureDeviceSchema();
    const device = await pool.query("SELECT device_id FROM esp_devices WHERE device_id = $1 AND revoked_at IS NULL", [req.params.deviceId]);
    if (!device.rowCount) return res.status(404).json({ ok: false, error: "Device not found" });
    const pending = await pool.query("SELECT count(*)::int AS count FROM esp_chat_messages WHERE device_id = $1 AND sender = 'web' AND delivered_at IS NULL", [req.params.deviceId]);
    if (pending.rows[0].count >= 50) return res.status(429).json({ ok: false, error: "Device message queue is full" });
    const result = await pool.query(
      `INSERT INTO esp_chat_messages (id, device_id, sender, message) VALUES ($1, $2, 'web', $3)
       RETURNING id, sender, message, created_at AS "createdAt", delivered_at AS "deliveredAt"`,
      [randomUUID(), req.params.deviceId, message],
    );
    await writeAudit(pool, { actorId: req.user.id, action: "device.message_queued", projectId: req.managedDeviceProjectId, details: { deviceId: req.params.deviceId } });
    return res.status(201).json({ ok: true, message: result.rows[0] });
  } catch (error) {
    console.error("ESP chat enqueue error:", error);
    return sendDeviceDatabaseError(res);
  }
});

app.post("/api/esp/v1/provision", requireHttps, async (req, res) => {
  const { provisioningCode, deviceId, name, firmwareVersion } = req.body || {};
  if (typeof provisioningCode !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(provisioningCode)
      || typeof deviceId !== "string" || !/^[A-Za-z0-9._:-]{3,80}$/.test(deviceId)
      || (name !== undefined && (typeof name !== "string" || name.length > 100))
      || (firmwareVersion !== undefined && (typeof firmwareVersion !== "string" || firmwareVersion.length > 64))) {
    return res.status(400).json({ ok: false, error: "Invalid provisioning request" });
  }
  const client = await pool.connect().catch(() => null);
  if (!client) return sendDeviceDatabaseError(res);
  try {
    await ensureDeviceSchema();
    await client.query("BEGIN");
    const tokenResult = await client.query(
      "SELECT token_hash, device_name, project_id FROM esp_pairing_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() FOR UPDATE",
      [sha256(provisioningCode)],
    );
    if (!tokenResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(401).json({ ok: false, error: "Provisioning code is invalid, expired, or already used" });
    }
    const deviceToken = randomBytes(32).toString("base64url");
    await client.query("UPDATE esp_pairing_tokens SET used_at = NOW() WHERE token_hash = $1", [sha256(provisioningCode)]);
    const enrollment = await client.query(
      `INSERT INTO esp_devices (device_id, name, project_id, token_hash, firmware_version, last_seen_at, last_ip)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       ON CONFLICT (device_id) DO UPDATE SET name = EXCLUDED.name, project_id = EXCLUDED.project_id,
         token_hash = EXCLUDED.token_hash, firmware_version = EXCLUDED.firmware_version,
         last_seen_at = NOW(), last_ip = EXCLUDED.last_ip, metadata = '{}'::jsonb,
         revoked_at = NULL, created_at = NOW()
       WHERE esp_devices.revoked_at IS NOT NULL
       RETURNING device_id`,
      [deviceId, tokenResult.rows[0].device_name || name?.trim() || deviceId, tokenResult.rows[0].project_id, sha256(deviceToken), firmwareVersion || null, req.ip],
    );
    if (!enrollment.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, error: "Device ID is already registered" });
    }
    await client.query("UPDATE esp_commands SET status = 'expired' WHERE device_id = $1 AND status IN ('pending', 'claimed')", [deviceId]);
    await client.query("COMMIT");
    res.set("Cache-Control", "no-store");
    return res.status(201).json({ ok: true, deviceId, deviceToken, apiVersion: 1, pollIntervalSeconds: 2, heartbeatIntervalSeconds: 15 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") return res.status(409).json({ ok: false, error: "Device ID is already registered" });
    console.error("ESP provisioning error:", error);
    return sendDeviceDatabaseError(res);
  } finally {
    client.release();
  }
});

app.post("/api/esp/v1/heartbeat", requireHttps, authenticateDevice, async (req, res) => {
  const firmwareVersion = typeof req.body?.firmwareVersion === "string" ? req.body.firmwareVersion.slice(0, 64) : null;
  const uptimeSeconds = Number.isSafeInteger(req.body?.uptimeSeconds) && req.body.uptimeSeconds >= 0 ? req.body.uptimeSeconds : null;
  const rssiDbm = Number.isInteger(req.body?.rssiDbm) && req.body.rssiDbm >= -127 && req.body.rssiDbm <= 0 ? req.body.rssiDbm : null;
  try {
    await pool.query(
      `UPDATE esp_devices SET last_seen_at = NOW(), last_ip = $2,
       firmware_version = COALESCE($3, firmware_version),
       metadata = jsonb_strip_nulls(jsonb_build_object('uptimeSeconds', $4::int, 'rssiDbm', $5::int))
       WHERE device_id = $1`,
      [req.espDevice.device_id, req.ip, firmwareVersion, uptimeSeconds, rssiDbm],
    );
    return res.json({ ok: true, serverTime: new Date().toISOString(), pollIntervalSeconds: 2 });
  } catch (error) {
    console.error("ESP heartbeat error:", error);
    return sendDeviceDatabaseError(res);
  }
});

app.get("/api/esp/v1/commands/next", requireHttps, authenticateDevice, async (req, res) => {
  try {
    await pool.query("UPDATE esp_devices SET last_seen_at = NOW(), last_ip = $2 WHERE device_id = $1", [req.espDevice.device_id, req.ip]);
    await pool.query("UPDATE esp_commands SET status = 'expired' WHERE device_id = $1 AND status IN ('pending', 'claimed') AND expires_at <= NOW()", [req.espDevice.device_id]);
    const result = await pool.query(
      `UPDATE esp_commands SET status = 'claimed', claimed_at = NOW(), attempts = attempts + 1
       WHERE id = (
         SELECT id FROM esp_commands WHERE device_id = $1 AND status = 'pending' AND expires_at > NOW()
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       RETURNING id, command, created_at AS "createdAt", expires_at AS "expiresAt"`,
      [req.espDevice.device_id],
    );
    return res.json({ ok: true, command: result.rows[0] || null, serverTime: new Date().toISOString() });
  } catch (error) {
    console.error("ESP command poll error:", error);
    return sendDeviceDatabaseError(res);
  }
});

app.get("/api/esp/v1/chat/next", requireHttps, authenticateDevice, async (req, res) => {
  const client = await pool.connect().catch(() => null);
  if (!client) return sendDeviceDatabaseError(res);
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE esp_chat_messages SET delivered_at = NOW()
       WHERE id = (SELECT id FROM esp_chat_messages WHERE device_id = $1 AND sender = 'web' AND delivered_at IS NULL
                  ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING id, message, created_at AS "createdAt"`,
      [req.espDevice.device_id],
    );
    await client.query("COMMIT");
    return res.json({ ok: true, message: result.rows[0] || null });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ESP chat poll error:", error);
    return sendDeviceDatabaseError(res);
  } finally {
    client.release();
  }
});

app.post("/api/esp/v1/chat", requireHttps, authenticateDevice, async (req, res) => {
  const clientMessageId = typeof req.body?.clientMessageId === "string" ? req.body.clientMessageId : "";
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(clientMessageId) || !message || message.length > 256 || /[\u0000-\u001f\u007f]/.test(message)) {
    return res.status(400).json({ ok: false, error: "Invalid chat message" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO esp_chat_messages (id, device_id, client_message_id, sender, message)
       VALUES ($1, $2, $3, 'device', $4) ON CONFLICT (device_id, client_message_id) DO NOTHING
       RETURNING id`,
      [randomUUID(), req.espDevice.device_id, clientMessageId, message],
    );
    return res.status(201).json({ ok: true, accepted: true, duplicate: !result.rowCount });
  } catch (error) {
    console.error("ESP chat send error:", error);
    return sendDeviceDatabaseError(res);
  }
});

app.post("/api/esp/v1/commands/:commandId/result", requireHttps, authenticateDevice, async (req, res) => {
  const success = req.body?.success === true;
  const response = typeof req.body?.response === "string" ? req.body.response : "";
  const errorText = typeof req.body?.error === "string" ? req.body.error : "";
  if (!/^[0-9a-f-]{36}$/i.test(req.params.commandId) || response.length > 4096 || errorText.length > 512) {
    return res.status(400).json({ ok: false, error: "Invalid command result" });
  }
  try {
    const result = await pool.query(
      `UPDATE esp_commands SET status = $3, response = $4, error = $5, completed_at = NOW()
       WHERE id = $1 AND device_id = $2 AND status = 'claimed' AND expires_at > NOW() RETURNING id`,
      [req.params.commandId, req.espDevice.device_id, success ? "completed" : "failed", response, errorText],
    );
    if (!result.rowCount) return res.status(409).json({ ok: false, error: "Command is unknown, expired, or already completed" });
    return res.json({ ok: true, commandId: req.params.commandId });
  } catch (error) {
    console.error("ESP command result error:", error);
    return sendDeviceDatabaseError(res);
  }
});

// Floor plans are stored independently from the application JSON state.
app.post("/api/floor-plans", floorPlanUpload.single("pdf"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ ok: false, error: "A PDF file is required" });
  const projectId = String(req.body?.projectId || "").trim().slice(0, 120);
  if (!projectId) { unlinkSync(file.path); return res.status(400).json({ ok: false, error: "Select a project before uploading a floor plan" }); }
  if (!canManageProjectResource(req.user, projectId)) { unlinkSync(file.path); return res.status(403).json({ ok: false, error: "Project management access required" }); }
  try {
    const bytes = readFileSync(file.path);
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      unlinkSync(file.path);
      return res.status(400).json({ ok: false, error: "The uploaded file is not a valid PDF" });
    }
    let document;
    try {
      document = await PDFDocument.load(bytes, { ignoreEncryption: false });
    } catch (error) {
      unlinkSync(file.path);
      console.warn("Floor plan PDF could not be parsed:", error.message);
      return res.status(400).json({ ok: false, error: "The uploaded file is not a readable PDF" });
    }
    const pages = document.getPages();
    if (!pages.length) throw new Error("PDF has no pages");
    const { width, height } = pages[0].getSize();
    const id = randomUUID();
    const name = (typeof req.body?.name === "string" ? req.body.name.trim() : "").slice(0, 160) || path.basename(file.originalname, path.extname(file.originalname)).slice(0, 160) || "Floor plan";
    await ensureFloorPlanSchema();
    await pool.query("INSERT INTO floor_plans (id,name,pdf_path,page_count,width,height,project_id) VALUES ($1,$2,$3,$4,$5,$6,$7)", [id, name, file.path, pages.length, width, height, projectId]);
    return res.status(201).json({ ok: true, plan: { id, name, projectId, pageCount: pages.length, width, height } });
  } catch (error) {
    if (existsSync(file.path)) unlinkSync(file.path);
    console.error("Floor plan upload error:", error);
    return res.status(503).json({ ok: false, error: "Floor plan service temporarily unavailable" });
  }
});

app.get("/api/floor-plans", async (req, res) => {
  try {
    await ensureFloorPlanSchema();
    const result = await pool.query("SELECT id,name,project_id AS \"projectId\",page_count AS \"pageCount\",width,height,created_at AS \"createdAt\" FROM floor_plans ORDER BY created_at DESC");
    return res.json({ ok: true, plans: result.rows.filter((plan) => canAccessProject(req.user, plan.projectId)) });
  } catch (error) {
    console.error("Floor plan list error:", error);
    return res.status(503).json({ ok: false, error: "Floor plan service temporarily unavailable" });
  }
});

app.get("/api/floor-plans/:id/file", async (req, res) => {
  try {
    await ensureFloorPlanSchema();
    const result = await pool.query("SELECT pdf_path,project_id AS \"projectId\" FROM floor_plans WHERE id=$1", [req.params.id]);
    if (result.rowCount && !canAccessProject(req.user, result.rows[0].projectId)) return res.sendStatus(403);
    const pdfPath = result.rows[0]?.pdf_path;
    if (!pdfPath || !existsSync(pdfPath)) return res.sendStatus(404);
    res.set({ "Content-Type": "application/pdf", "Content-Length": String(statSync(pdfPath).size), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
    return createReadStream(pdfPath).pipe(res);
  } catch (error) {
    console.error("Floor plan PDF read error:", error);
    return res.status(503).json({ ok: false, error: "Floor plan service temporarily unavailable" });
  }
});

// A migrated floor plan can be assigned once; subsequent project changes are rejected.
app.post("/api/floor-plans/:id/project", async (req, res) => {
  const projectId = String(req.body?.projectId || "").trim().slice(0, 120);
  if (!projectId) return res.status(400).json({ ok: false, error: "A project is required" });
  if (!canManageProjectResource(req.user, projectId)) return res.sendStatus(403);
  try {
    await ensureFloorPlanSchema();
    const result = await pool.query("UPDATE floor_plans SET project_id=$2 WHERE id=$1 AND project_id IS NULL RETURNING project_id AS \"projectId\"", [req.params.id, projectId]);
    if (result.rowCount) return res.json({ ok: true, projectId: result.rows[0].projectId });
    const existing = await pool.query("SELECT project_id AS \"projectId\" FROM floor_plans WHERE id=$1", [req.params.id]);
    if (!existing.rowCount) return res.sendStatus(404);
    if (existing.rows[0].projectId !== projectId) return res.status(409).json({ ok: false, error: "The project assigned to a floor plan cannot be changed" });
    return res.json({ ok: true, projectId });
  } catch (error) {
    console.error("Floor plan project assignment error:", error);
    return res.status(503).json({ ok: false, error: "Floor plan service temporarily unavailable" });
  }
});

// Remove a floor plan and its cascaded device layout, then delete its stored PDF.
app.delete("/api/floor-plans/:id", async (req, res) => {
  try {
    await ensureFloorPlanSchema();
    const existing = await pool.query("SELECT pdf_path,project_id AS \"projectId\" FROM floor_plans WHERE id=$1", [req.params.id]);
    if (!existing.rowCount) return res.sendStatus(404);
    if (!canManageProjectResource(req.user, existing.rows[0].projectId)) return res.sendStatus(403);

    const pdfPath = path.resolve(existing.rows[0].pdf_path);
    const planRoot = path.resolve(floorPlanUploadDirectory);
    const relativePath = path.relative(planRoot, pdfPath);
    const isManagedUpload = relativePath && relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
    if (!isManagedUpload) return res.status(400).json({ ok: false, error: "The stored PDF is outside the floor plan upload directory" });

    const deleted = await pool.query("DELETE FROM floor_plans WHERE id=$1 RETURNING id", [req.params.id]);
    if (!deleted.rowCount) return res.sendStatus(404);
    if (existsSync(pdfPath)) unlinkSync(pdfPath);
    return res.json({ ok: true, id: deleted.rows[0].id });
  } catch (error) {
    console.error("Floor plan delete error:", error);
    return res.status(503).json({ ok: false, error: "Floor plan service temporarily unavailable" });
  }
});

app.get("/api/floor-plans/:id/layout", async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const allPages = req.query.allPages === "true";
  try {
    await ensureFloorPlanSchema();
    const plan = await pool.query("SELECT id,project_id AS \"projectId\" FROM floor_plans WHERE id=$1", [req.params.id]);
    if (!plan.rowCount) return res.sendStatus(404);
    if (!canAccessProject(req.user, plan.rows[0].projectId)) return res.sendStatus(403);
    const result = await pool.query(
      `SELECT id,page_number AS "pageNumber",device_id AS "deviceId",panel_id AS "panelId",panel_no AS "panelNumber",device_type AS "deviceType",icon_type AS "iconType",device_name AS name,loop_no AS loop,address,zone,label,norm_x AS "normX",norm_y AS "normY",rotation
       FROM floor_plan_devices WHERE floor_plan_id=$1 ${allPages ? "" : "AND page_number=$2"} ORDER BY page_number,id`, allPages ? [req.params.id] : [req.params.id, page]);
    const devices = result.rows
      .filter((device) => ![device.deviceType, device.iconType].some((type) => ["zone", "io"].includes(type)))
      .filter((device) => canAccessPanel(req.user, plan.rows[0].projectId, device.panelId));
    return res.json({ ok: true, devices });
  } catch (error) {
    console.error("Floor plan layout read error:", error);
    return res.status(503).json({ ok: false, error: "Floor plan service temporarily unavailable" });
  }
});

app.post("/api/floor-plans/:id/layout", async (req, res) => {
  const page = Number(req.body?.page || 1);
  const devices = req.body?.devices;
  if (!Number.isInteger(page) || page < 1 || !Array.isArray(devices) || devices.length > 5000) {
    return res.status(400).json({ ok: false, error: "Invalid page or device list" });
  }
  const allowedTypes = new Set(["SD", "HD", "MS", "MCP", "SND/FL", "MOD", "FACP"]);
  const normalized = [];
  for (const device of devices) {
    const normX = Number(device?.normX), normY = Number(device?.normY), rotation = Number(device?.rotation || 0), panelNumber = Number(device?.panelNumber || 0);
    if (!allowedTypes.has(device?.deviceType) || !Number.isFinite(normX) || !Number.isFinite(normY) || normX < 0 || normX > 1 || normY < 0 || normY > 1 || !Number.isInteger(rotation) || !Number.isInteger(panelNumber) || panelNumber < 0) {
      return res.status(400).json({ ok: false, error: "Invalid device mapping" });
    }
    normalized.push({
      projectId: String(device.projectId || "").slice(0, 120),
      values: [randomUUID(), req.params.id, page, String(device.deviceId || "").slice(0, 120) || null, String(device.panelId || "").slice(0, 120) || null, panelNumber, device.deviceType,
        String(device.iconType || "").slice(0, 30), String(device.name || "").slice(0, 120), String(device.loop || "").slice(0, 40), String(device.address || "").slice(0, 80), String(device.zone || "").slice(0, 80), String(device.label || "").slice(0, 160), normX, normY, rotation % 360],
    });
  }
  const client = await pool.connect().catch(() => null);
  if (!client) return res.status(503).json({ ok: false, error: "Floor plan service temporarily unavailable" });
  try {
    await ensureFloorPlanSchema();
    await client.query("BEGIN");
    const plan = await client.query("SELECT id,page_count,project_id FROM floor_plans WHERE id=$1 FOR UPDATE", [req.params.id]);
    if (!plan.rowCount || page > plan.rows[0].page_count) {
      await client.query("ROLLBACK");
      return res.sendStatus(plan.rowCount ? 400 : 404);
    }
    if (!canAccessProject(req.user, plan.rows[0].project_id)) {
      await client.query("ROLLBACK");
      return res.sendStatus(403);
    }
    if (normalized.some((item) => item.projectId !== String(plan.rows[0].project_id || ""))) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "A floor plan can only contain devices from its assigned project" });
    }
    if (normalized.some((item) => !canAccessPanel(req.user, String(plan.rows[0].project_id || ""), item.values[4]))) {
      await client.query("ROLLBACK");
      return res.sendStatus(403);
    }
    const projectId = String(plan.rows[0].project_id || "");
    if (canManageProjectResource(req.user, projectId)) await client.query("DELETE FROM floor_plan_devices WHERE floor_plan_id=$1 AND page_number=$2", [req.params.id, page]);
    else await client.query("DELETE FROM floor_plan_devices WHERE floor_plan_id=$1 AND page_number=$2 AND panel_id=ANY($3::text[])", [req.params.id, page, req.user.projectPanels?.[projectId] || []]);
    for (const item of normalized) await client.query(
      `INSERT INTO floor_plan_devices (id,floor_plan_id,page_number,device_id,panel_id,panel_no,device_type,icon_type,device_name,loop_no,address,zone,label,norm_x,norm_y,rotation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, item.values);
    await client.query("COMMIT");
    return res.json({ ok: true, count: normalized.length });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Floor plan layout save error:", error);
    return res.status(503).json({ ok: false, error: "Floor plan service temporarily unavailable" });
  } finally { client.release(); }
});

app.get("/api/floor-plans/:id/export", async (req, res) => {
  const pageNumber = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  try {
    await ensureFloorPlanSchema();
    const result = await pool.query("SELECT name,pdf_path,page_count,project_id AS \"projectId\" FROM floor_plans WHERE id=$1", [req.params.id]);
    const plan = result.rows[0];
    if (!plan || !existsSync(plan.pdf_path)) return res.sendStatus(404);
    if (!canAccessProject(req.user, plan.projectId)) return res.sendStatus(403);
    if (pageNumber > plan.page_count) return res.sendStatus(400);
    const pdf = await PDFDocument.load(readFileSync(plan.pdf_path));
    pdf.registerFontkit(fontkit);
    const page = pdf.getPage(pageNumber - 1);
    const { width, height } = page.getSize();
    const rowResult = await pool.query("SELECT device_type AS type,icon_type AS \"iconType\",device_name AS name,panel_id AS \"panelId\",panel_no AS \"panelNumber\",loop_no AS loop,address,zone,label,norm_x AS x,norm_y AS y,rotation FROM floor_plan_devices WHERE floor_plan_id=$1 AND page_number=$2", [req.params.id, pageNumber]);
    const rows = { ...rowResult, rows: rowResult.rows.filter((device) => canAccessPanel(req.user, plan.projectId, device.panelId)) };
    const labelFont = await pdf.embedFont(readFileSync(pdfLabelFontPath), { subset: true });
    const ink = rgb(0.02, 0.15, 0.30), white = rgb(1, 1, 1);
    const formatPdfLabel = (value, fallback = "") => {
      const raw = String(value || "").trim();
      if (!raw || (/\?{2,}/.test(raw) && /^[\s?/:._-]+$/.test(raw))) return { text: fallback || "" };
      const hasPersian = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(raw);
      // PersianShaper converts letters to connected presentation forms while
      // preserving logical character order. Applying a second bidi reversal
      // makes the PDF viewer reverse the letters again and corrupts the label.
      return { text: hasPersian ? reshaper.PersianShaper.convertArabic(raw) : raw };
    };
    const drawPdfLabel = (text, centerX, baselineY, size, maxWidth) => {
      if (!text) return;
      const naturalWidth = labelFont.widthOfTextAtSize(text, size);
      const fittedSize = naturalWidth > maxWidth ? size * maxWidth / naturalWidth : size;
      const textWidth = labelFont.widthOfTextAtSize(text, fittedSize);
      page.drawText(text, { x: centerX - textWidth / 2, y: baselineY, size: fittedSize, font: labelFont, color: ink });
    };
    const getDeviceFallbackName = (type) => ({ SD: "Smoke Detector", HD: "Heat Detector", MS: "Multi-Sensor", MCP: "Manual Call Point", "SND/FL": "Sounder / Flasher", MOD: "Control / Monitor Module", FACP: "Fire Alarm Control Panel" }[type] || "Device");
    const iconFiles = { smoke: "SMOKE.svg", heat: "HEAT.svg", multi: "MULTI.svg", manual: "MANUAL.svg", sounder: "SOUNDER.svg", input: "INPUT.svg", panel: "PANEL.svg" };
    const iconForType = { SD: "smoke", HD: "heat", MS: "multi", MCP: "manual", "SND/FL": "sounder", MOD: "input", FACP: "panel" };
    const iconCache = new Map();
    const getDeviceIcon = (device) => {
      const key = iconFiles[device.iconType] ? device.iconType : iconForType[device.type] || "smoke";
      if (!iconCache.has(key)) {
        const svg = readFileSync(path.join(deviceIconDirectory, iconFiles[key]), "utf8");
        // Render the exact same SVG symbol used by the web app at high resolution.
        iconCache.set(key, pdf.embedPng(new Resvg(svg, { fitTo: { mode: "width", value: 256 } }).render().asPng()));
      }
      return iconCache.get(key);
    };
    const labelPlacements = [];
    for (const device of rows.rows.filter((item) => ![item.type, item.iconType].some((type) => ["zone", "io"].includes(type)))) {
      const anchorX = device.x * width, anchorY = height - device.y * height;
      const icon = await getDeviceIcon(device);
      const iconSize = 14; // Web canvas uses a 28 px icon at PDF.js scale 2.
      const iconCenterY = anchorY + 5; // Match the SVG's -10 px offset above the text labels.
      page.drawImage(icon, { x: anchorX - iconSize / 2, y: iconCenterY - iconSize / 2, width: iconSize, height: iconSize, rotate: degrees(-(device.rotation || 0)) });
      const nameText = formatPdfLabel(device.name, getDeviceFallbackName(device.type)).text;
      const addressText = formatPdfLabel(`A: ${device.address || ""}`).text;
      const panelText = formatPdfLabel(`P: ${device.panelNumber || ""}`).text;
      const loopText = formatPdfLabel(`L: ${device.loop || ""}`).text;
      const labelWidth = Math.min(120, Math.max(32,
        labelFont.widthOfTextAtSize(nameText, 6.5),
        labelFont.widthOfTextAtSize(addressText, 5.8),
        labelFont.widthOfTextAtSize(panelText, 5.8),
        labelFont.widthOfTextAtSize(loopText, 5.8)) + 8);
      labelPlacements.push({ anchorX, anchorY, nameText, addressText, panelText, loopText, width: labelWidth });
    }
    // Keep close devices' two-line tags separate and readable on top of busy plan artwork.
    // Keep labels close to their own icon while using small horizontal and
    // vertical nudges to prevent the tags from colliding on dense plans.
    const occupiedLabels = [];
    for (const label of labelPlacements) {
      const boxWidth = label.width;
      const boxHeight = 32;
      const baseX = Math.max(boxWidth / 2 + 3, Math.min(width - boxWidth / 2 - 3, label.anchorX));
      const baseY = Math.max(boxHeight / 2 + 3, label.anchorY - 25);
      const shifts = [];
      for (const dx of [0, -8, 8, -16, 16, -24, 24, -32, 32]) {
        for (const dy of [0, 6, 12, 18, 24]) {
          if (Math.hypot(dx, dy) <= 36) shifts.push({ dx, dy, distance: Math.hypot(dx, dy) });
        }
      }
      shifts.sort((a, b) => a.distance - b.distance || a.dy - b.dy);
      let centerX = baseX, centerY = baseY;
      for (const shift of shifts) {
        const candidateX = Math.max(boxWidth / 2 + 3, Math.min(width - boxWidth / 2 - 3, baseX + shift.dx));
        const candidateY = Math.max(boxHeight / 2 + 3, baseY - shift.dy);
        const bounds = { left: candidateX - boxWidth / 2, right: candidateX + boxWidth / 2, bottom: candidateY - boxHeight / 2, top: candidateY + boxHeight / 2 };
        const overlaps = occupiedLabels.some((other) => bounds.left < other.right + 1 && bounds.right > other.left - 1 && bounds.bottom < other.top + 1 && bounds.top > other.bottom - 1);
        if (!overlaps) { centerX = candidateX; centerY = candidateY; occupiedLabels.push(bounds); break; }
      }
      page.drawRectangle({ x: centerX - boxWidth / 2, y: centerY - boxHeight / 2, width: boxWidth, height: boxHeight, color: white });
      drawPdfLabel(label.nameText, centerX, centerY + 10, 6.5, boxWidth - 6);
      drawPdfLabel(label.addressText, centerX, centerY + 3, 5.8, boxWidth - 6);
      drawPdfLabel(label.panelText, centerX, centerY - 4, 5.8, boxWidth - 6);
      drawPdfLabel(label.loopText, centerX, centerY - 11, 5.8, boxWidth - 6);
    }
    const bytes = await pdf.save();
    const filename = `${plan.name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "floor-plan"}-mapped.pdf`;
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "X-Content-Type-Options": "nosniff" });
    return res.send(Buffer.from(bytes));
  } catch (error) {
    console.error("Floor plan export error:", error);
    return res.status(500).json({ ok: false, error: "Could not export this floor plan" });
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS database_time");
    res.json({ ok: true, database: "connected", databaseTime: result.rows[0].database_time });
  } catch (error) {
    res.status(503).json({ ok: false, database: "unavailable", error: process.env.NODE_ENV === "production" ? "Database unavailable" : error.message });
  }
});

async function findWorkspacePanel(client, projectId, panelId, lock = false) {
  const result = await client.query(`SELECT payload FROM app_state WHERE workspace_key=$1${lock ? " FOR UPDATE" : ""}`, [workspaceKey]);
  const projects = Array.isArray(result.rows[0]?.payload?.projects) ? result.rows[0].payload.projects : [];
  const project = projects.find((item) => String(item?.id) === projectId);
  const panel = project?.panels?.find((item) => String(item?.id) === panelId);
  return { exists: Boolean(project && panel), project, panel, payload: result.rows[0]?.payload || null };
}

function panelFilesFor(files, panelId) {
  return (Array.isArray(files) ? files : []).filter((file) => file && String(file.panelId) === panelId);
}

async function getPanelSettings(client, projectId, panelId, actorId) {
  const existing = await client.query("SELECT settings,saved_setting_files,updated_at FROM app_panel_settings WHERE project_id=$1 AND panel_id=$2", [projectId, panelId]);
  if (existing.rowCount) return existing.rows[0];
  const workspace = await findWorkspacePanel(client, projectId, panelId, true);
  if (!workspace.exists) return null;
  const savedState = workspace.payload?.state || {};
  const legacySettings = {};
  // The old document held one active panel configuration. Preserve that data
  // when it can be attributed unambiguously to the panel selected at migration.
  if (String(savedState.selectedPanelId || "") === panelId) {
    for (const key of PANEL_SETTING_KEYS) if (Object.hasOwn(savedState, key)) legacySettings[key] = savedState[key];
  }
  const files = panelFilesFor(savedState.savedSettingFiles, panelId);
  const seeded = await client.query(
    `INSERT INTO app_panel_settings(project_id,panel_id,settings,saved_setting_files,updated_by)
     VALUES($1,$2,$3::jsonb,$4::jsonb,$5) ON CONFLICT(project_id,panel_id) DO NOTHING
     RETURNING settings,saved_setting_files,updated_at`,
    [projectId, panelId, JSON.stringify(legacySettings), JSON.stringify(files), actorId],
  );
  if (seeded.rowCount) return seeded.rows[0];
  const raced = await client.query("SELECT settings,saved_setting_files,updated_at FROM app_panel_settings WHERE project_id=$1 AND panel_id=$2", [projectId, panelId]);
  return raced.rows[0] || null;
}

const panelCredentialSecret = process.env.PANEL_CREDENTIALS_KEY;
const panelProfileKey = panelCredentialSecret && panelCredentialSecret.length >= 32
  ? createHash("sha256").update(panelCredentialSecret).digest()
  : null;
function encryptPanelPassword(password) {
  if (!panelProfileKey) throw new Error("Panel credential encryption is not configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", panelProfileKey, iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}
function decryptPanelPassword(value) {
  if (!panelProfileKey) throw new Error("Panel credential encryption is not configured");
  const [iv, tag, encrypted] = String(value || "").split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", panelProfileKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
let panelProfilesSchemaPromise;
function ensurePanelProfilesSchema() {
  if (!panelProfilesSchemaPromise) {
    panelProfilesSchemaPromise = pool.query(`CREATE TABLE IF NOT EXISTS app_panel_user_profiles (
      project_id text NOT NULL, panel_id text NOT NULL,
      user_slot smallint NOT NULL CHECK (user_slot BETWEEN 1 AND 4),
      display_name text NOT NULL DEFAULT '', photo_data text NOT NULL DEFAULT '',
      password_ciphertext text, updated_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_id, panel_id, user_slot)
    )`).catch((error) => { panelProfilesSchemaPromise = null; throw error; });
  }
  return panelProfilesSchemaPromise;
}
const emptyPanelProfiles = () => Array.from({ length: 4 }, (_unused, index) => ({ slot: index + 1, name: "", photo: "", passwordSet: false }));
const publicPanelProfiles = (rows) => {
  const profiles = emptyPanelProfiles();
  for (const row of rows) profiles[Number(row.user_slot) - 1] = { slot: Number(row.user_slot), name: row.display_name, photo: row.photo_data, passwordSet: Boolean(row.password_ciphertext) };
  return profiles;
};

app.get("/api/projects/:projectId/panels/:panelId/user-profiles", async (req, res) => {
  const { projectId, panelId } = req.params;
  if (!canAccessPanel(req.user, projectId, panelId)) return res.sendStatus(403);
  try {
    await ensurePanelProfilesSchema();
    const panel = await pool.query("SELECT 1 FROM app_state CROSS JOIN LATERAL jsonb_array_elements(COALESCE(payload->'projects','[]'::jsonb)) AS p(project) CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.project->'panels','[]'::jsonb)) AS q(panel) WHERE workspace_key=$1 AND p.project->>'id'=$2 AND q.panel->>'id'=$3 LIMIT 1", [workspaceKey, projectId, panelId]);
    if (!panel.rowCount) return res.sendStatus(404);
    const result = await pool.query("SELECT user_slot,display_name,photo_data,password_ciphertext FROM app_panel_user_profiles WHERE project_id=$1 AND panel_id=$2 ORDER BY user_slot", [projectId, panelId]);
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, profiles: publicPanelProfiles(result.rows) });
  } catch (error) {
    console.error("Panel user profiles read error:", error);
    return res.status(503).json({ ok: false, error: "Could not load panel user profiles" });
  }
});

app.put("/api/projects/:projectId/panels/:panelId/user-profiles", requireHttps, requireSameOrigin, async (req, res) => {
  const { projectId, panelId } = req.params;
  if (!canAccessPanel(req.user, projectId, panelId)) return res.sendStatus(403);
  if (!panelProfileKey) return res.status(503).json({ ok: false, error: "Panel credential encryption is not configured" });
  const profiles = req.body?.profiles;
  if (!Array.isArray(profiles) || profiles.length !== 4) return res.status(400).json({ ok: false, error: "Exactly four user profiles are required" });
  const checked = [];
  for (let index = 0; index < 4; index += 1) {
    const profile = profiles[index];
    const name = typeof profile?.name === "string" ? profile.name.trim() : "";
    const photo = typeof profile?.photo === "string" ? profile.photo : "";
    const password = typeof profile?.password === "string" ? profile.password : "";
    if (Number(profile?.slot) !== index + 1 || name.length > 100 || password.length > 256) return res.status(400).json({ ok: false, error: "Invalid panel user profile" });
    if (photo && (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(photo) || Buffer.byteLength(photo, "utf8") > 500_000)) return res.status(400).json({ ok: false, error: "Profile photo must be a PNG, JPEG or WebP image under 500 KB" });
    checked.push({ slot: index + 1, name, photo, password, clearPassword: profile?.clearPassword === true });
  }
  const client = await pool.connect().catch(() => null);
  if (!client) return res.status(503).json({ ok: false, error: "Database unavailable" });
  try {
    await ensurePanelProfilesSchema();
    await client.query("BEGIN");
    const panel = await client.query("SELECT 1 FROM app_state CROSS JOIN LATERAL jsonb_array_elements(COALESCE(payload->'projects','[]'::jsonb)) AS p(project) CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.project->'panels','[]'::jsonb)) AS q(panel) WHERE workspace_key=$1 AND p.project->>'id'=$2 AND q.panel->>'id'=$3 LIMIT 1", [workspaceKey, projectId, panelId]);
    if (!panel.rowCount) { await client.query("ROLLBACK"); return res.sendStatus(404); }
    for (const profile of checked) {
      const existing = await client.query("SELECT password_ciphertext FROM app_panel_user_profiles WHERE project_id=$1 AND panel_id=$2 AND user_slot=$3", [projectId, panelId, profile.slot]);
      const passwordCiphertext = profile.password ? encryptPanelPassword(profile.password) : profile.clearPassword ? null : existing.rows[0]?.password_ciphertext || null;
      await client.query(`INSERT INTO app_panel_user_profiles(project_id,panel_id,user_slot,display_name,photo_data,password_ciphertext,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(project_id,panel_id,user_slot) DO UPDATE SET display_name=EXCLUDED.display_name,photo_data=EXCLUDED.photo_data,password_ciphertext=EXCLUDED.password_ciphertext,updated_at=NOW()`,
      [projectId, panelId, profile.slot, profile.name, profile.photo, passwordCiphertext]);
    }
    await client.query("COMMIT");
    const result = await client.query("SELECT user_slot,display_name,photo_data,password_ciphertext FROM app_panel_user_profiles WHERE project_id=$1 AND panel_id=$2 ORDER BY user_slot", [projectId, panelId]);
    await writeAudit(pool, { actorId: req.user.id, action: "panel.user_profiles.saved", projectId, panelId, outcome: "success", details: { slots: checked.map(({ slot }) => slot) } }).catch(() => {});
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, profiles: publicPanelProfiles(result.rows) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Panel user profiles save error:", error);
    return res.status(503).json({ ok: false, error: "Could not save panel user profiles" });
  } finally { client.release(); }
});

app.get("/api/projects/:projectId/panels/:panelId/settings", async (req, res) => {
  const { projectId, panelId } = req.params;
  if (!canAccessPanel(req.user, projectId, panelId)) {
    void writeAudit(pool, { actorId: req.user.id, action: "panel.settings.read", projectId, panelId, outcome: "denied" }).catch(() => {});
    return res.sendStatus(403);
  }
  const client = await pool.connect().catch(() => null);
  if (!client) return res.status(503).json({ ok: false, error: "Database unavailable" });
  try {
    await client.query("BEGIN");
    const panel = await findWorkspacePanel(client, projectId, panelId);
    if (!panel.exists) { await client.query("ROLLBACK"); return res.sendStatus(404); }
    const row = await getPanelSettings(client, projectId, panelId, req.user.id);
    await client.query("COMMIT");
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, projectId, panelId, settings: row?.settings || {}, savedSettingFiles: row?.saved_setting_files || [], updatedAt: row?.updated_at || null });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Panel settings read error:", error);
    return res.status(503).json({ ok: false, error: "Could not load panel settings" });
  } finally { client.release(); }
});

app.put("/api/projects/:projectId/panels/:panelId/settings", async (req, res) => {
  const { projectId, panelId } = req.params;
  if (!canAccessPanel(req.user, projectId, panelId)) {
    void writeAudit(pool, { actorId: req.user.id, action: "panel.settings.write", projectId, panelId, outcome: "denied" }).catch(() => {});
    return res.sendStatus(403);
  }
  const checked = validatePanelSettings(req.body?.settings);
  if (!checked.ok) return res.status(400).json({ ok: false, error: checked.error });
  if (!Array.isArray(req.body?.savedSettingFiles) || req.body.savedSettingFiles.length > 100) return res.status(400).json({ ok: false, error: "Invalid saved settings files" });
  const files = panelFilesFor(req.body.savedSettingFiles, panelId);
  if (Buffer.byteLength(JSON.stringify(files), "utf8") > 2_000_000) return res.status(413).json({ ok: false, error: "Saved settings files are too large" });
  const client = await pool.connect().catch(() => null);
  if (!client) return res.status(503).json({ ok: false, error: "Database unavailable" });
  try {
    await client.query("BEGIN");
    const panel = await findWorkspacePanel(client, projectId, panelId, true);
    if (!panel.exists) { await client.query("ROLLBACK"); return res.sendStatus(404); }
    const previous = await getPanelSettings(client, projectId, panelId, req.user.id);
    const result = await client.query(
      `INSERT INTO app_panel_settings(project_id,panel_id,settings,saved_setting_files,updated_by,updated_at)
       VALUES($1,$2,$3::jsonb,$4::jsonb,$5,NOW())
       ON CONFLICT(project_id,panel_id) DO UPDATE SET settings=EXCLUDED.settings,saved_setting_files=EXCLUDED.saved_setting_files,updated_by=EXCLUDED.updated_by,updated_at=NOW()
       RETURNING updated_at`,
      [projectId, panelId, JSON.stringify(checked.settings), JSON.stringify(files), req.user.id],
    );
    const changedKeys = [...new Set([...Object.keys(previous?.settings || {}), ...Object.keys(checked.settings)])]
      .filter((key) => JSON.stringify(previous?.settings?.[key]) !== JSON.stringify(checked.settings[key]));
    const filesChanged = JSON.stringify(previous?.saved_setting_files || []) !== JSON.stringify(files);
    if (changedKeys.length || filesChanged) {
      const before = Object.fromEntries(changedKeys.map((key) => [key, previous?.settings?.[key]]));
      const after = Object.fromEntries(changedKeys.map((key) => [key, checked.settings[key]]));
      await client.query(
        `INSERT INTO app_audit_log(actor_user_id,action,project_id,panel_id,outcome,details)
         VALUES($1,'panel.settings.saved',$2,$3,'success',$4::jsonb)`,
        [req.user.id, projectId, panelId, JSON.stringify({ changedKeys, filesChanged, before: redactPanelSecrets(before), after: redactPanelSecrets(after) })],
      );
    }
    await client.query("COMMIT");
    return res.json({ ok: true, projectId, panelId, updatedAt: result.rows[0].updated_at, settings: checked.settings, savedSettingFiles: files });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Panel settings save error:", error);
    await writeAudit(pool, { actorId: req.user.id, action: "panel.settings.saved", projectId, panelId, outcome: "failure", details: { reason: "storage_error" } }).catch(() => {});
    return res.status(503).json({ ok: false, error: "Could not save panel settings" });
  } finally { client.release(); }
});

app.get("/api/state", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT payload, updated_at FROM app_state WHERE workspace_key = $1",
      [workspaceKey],
    );
    if (!result.rowCount) return res.json({ workspaceKey, payload: null, updatedAt: null });
    const payload = sanitizeWorkspaceForUser(result.rows[0].payload, req.user, { hasGlobalPermission, hasProjectPermission });
    res.json({ workspaceKey, payload, updatedAt: result.rows[0].updated_at });
  } catch (error) {
    res.status(503).json({ ok: false, error: process.env.NODE_ENV === "production" ? "Database unavailable" : error.message });
  }
});

app.get("/api/projects/:projectId/image", async (req, res) => {
  if (!canAccessProject(req.user, req.params.projectId)) return res.sendStatus(403);
  try {
    const result = await pool.query(
      "SELECT payload FROM app_state WHERE workspace_key = $1",
      [workspaceKey],
    );
    const project = result.rows[0]?.payload?.projects?.find((item) => item?.id === req.params.projectId);
    const source = typeof project?.image === "string" ? project.image : "";
    const match = source.match(/^data:image\/(png|jpeg|jpg|webp|gif|avif|bmp);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) return res.sendStatus(404);

    const contentType = match[1].toLowerCase() === "jpg" ? "image/jpeg" : `image/${match[1].toLowerCase()}`;
    res.set({
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    return res.send(Buffer.from(match[2], "base64"));
  } catch (error) {
    return res.status(503).json({ ok: false, error: process.env.NODE_ENV === "production" ? "Database unavailable" : error.message });
  }
});

app.get("/api/projects/:projectId/images/:imageId", async (req, res) => {
  if (!canAccessProject(req.user, req.params.projectId)) return res.sendStatus(403);
  try {
    const result = await pool.query("SELECT payload FROM app_state WHERE workspace_key = $1", [workspaceKey]);
    const project = result.rows[0]?.payload?.projects?.find((item) => item?.id === req.params.projectId);
    const gallery = Array.isArray(project?.images) ? project.images : [];
    const image = gallery.find((item) => (typeof item === "string" ? `${project.id}-image-${gallery.indexOf(item) + 1}` : item?.id) === req.params.imageId);
    const source = typeof image === "string" ? image : image?.src || "";
    const match = source.match(/^data:image\/(png|jpeg|jpg|webp|gif|avif|bmp);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) return res.sendStatus(404);
    const contentType = match[1].toLowerCase() === "jpg" ? "image/jpeg" : `image/${match[1].toLowerCase()}`;
    res.set({ "Content-Type": contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    return res.send(Buffer.from(match[2], "base64"));
  } catch (error) {
    return res.status(503).json({ ok: false, error: process.env.NODE_ENV === "production" ? "Database unavailable" : error.message });
  }
});

const MAX_LOOP_CARDS_PER_PANEL = 2;

function limitPersistedLoopCards(payload) {
  const savedState = payload.state;
  if (!savedState || typeof savedState !== "object" || Array.isArray(savedState)) return payload;
  let changed = false;
  const loopCards = savedState.loopCards;
  const limitedLoopCards = Array.isArray(loopCards) ? loopCards.slice(0, MAX_LOOP_CARDS_PER_PANEL) : loopCards;
  if (Array.isArray(loopCards) && limitedLoopCards.length !== loopCards.length) changed = true;

  const savedSettingFiles = Array.isArray(savedState.savedSettingFiles)
    ? savedState.savedSettingFiles.map((file) => {
      const snapshotCards = file?.snapshot?.loopCards;
      if (!Array.isArray(snapshotCards) || snapshotCards.length <= MAX_LOOP_CARDS_PER_PANEL) return file;
      changed = true;
      return { ...file, snapshot: { ...file.snapshot, loopCards: snapshotCards.slice(0, MAX_LOOP_CARDS_PER_PANEL) } };
    })
    : savedState.savedSettingFiles;

  if (!changed) return payload;
  return {
    ...payload,
    state: { ...savedState, loopCards: limitedLoopCards, savedSettingFiles },
  };
}

const saveState = async (req, res) => {
  const incomingPayload = req.body?.payload;
  const payload = incomingPayload && typeof incomingPayload === "object" && !Array.isArray(incomingPayload)
    ? limitPersistedLoopCards(incomingPayload)
    : incomingPayload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return res.status(400).json({ ok: false, error: "payload must be a JSON object" });
  }
  if (!Array.isArray(payload.projects) || payload.projects.some((project) => !project || typeof project.id !== "string" || !project.id || !Array.isArray(project.panels))) {
    return res.status(400).json({ ok: false, error: "payload must include valid projects and panels" });
  }
  const projectIds = payload.projects.map((project) => project.id);
  if (new Set(projectIds).size !== projectIds.length) return res.status(400).json({ ok: false, error: "Project ids must be unique" });

  if (!hasGlobalPermission(req.user, "projects:all") && !hasGlobalPermission(req.user, "projects:manage") && !hasGlobalPermission(req.user, "*") && hasGlobalPermission(req.user, "projects:create")) {
    const client = await pool.connect().catch(() => null);
    if (!client) return res.status(503).json({ ok: false, error: "Database unavailable" });
    try {
      await client.query("BEGIN");
      const current = await client.query("SELECT payload FROM app_state WHERE workspace_key=$1 FOR UPDATE", [workspaceKey]);
      const existingPayload = current.rows[0]?.payload || { projects: [], state: {} };
      const existingProjects = Array.isArray(existingPayload.projects) ? existingPayload.projects : [];
      if (!Array.isArray(payload.projects)) { await client.query("ROLLBACK"); return res.status(400).json({ ok: false, error: "Project list is required" }); }
      const existingById = new Map(existingProjects.map((project) => [String(project.id), project]));
      const additions = [];
      const seenProjectIds = new Set();
      for (const project of payload.projects) {
        const id = String(project?.id || "");
        const panelIds = Array.isArray(project?.panels) ? project.panels.map((panel) => String(panel?.id || "")) : [];
        if (!id || id.length > 120 || seenProjectIds.has(id) || typeof project.name !== "string" || !project.name.trim() || project.name.length > 160 || !Array.isArray(project.panels) || panelIds.some((panelId) => !panelId || panelId.length > 120) || new Set(panelIds).size !== panelIds.length) {
          await client.query("ROLLBACK"); return res.status(400).json({ ok: false, error: "Invalid or duplicate project" });
        }
        seenProjectIds.add(id);
        if (existingById.has(id)) {
          if (JSON.stringify(existingById.get(id)) !== JSON.stringify(project)) { await client.query("ROLLBACK"); return res.status(403).json({ ok: false, error: "Project creation permission does not allow editing existing projects" }); }
        } else additions.push(project);
      }
      if (!additions.length) { await client.query("ROLLBACK"); return res.status(403).json({ ok: false, error: "Project creation only accepts new projects" }); }
      const nextPayload = { ...existingPayload, projects: [...existingProjects, ...additions] };
      const saved = await client.query("INSERT INTO app_state(workspace_key,payload,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(workspace_key) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW() RETURNING updated_at", [workspaceKey, JSON.stringify(nextPayload)]);
      for (const project of additions) {
        await client.query("INSERT INTO app_user_projects(user_id,project_id,granted_by) VALUES($1,$2,$1) ON CONFLICT DO NOTHING", [req.user.id, String(project.id)]);
        await client.query("INSERT INTO app_user_project_permissions(user_id,project_id,permission,granted_by) VALUES($1,$2,'project:manage',$1) ON CONFLICT DO NOTHING", [req.user.id, String(project.id)]);
        await client.query("INSERT INTO app_user_project_permissions(user_id,project_id,permission,granted_by) VALUES($1,$2,'permissions:delegate',$1) ON CONFLICT DO NOTHING", [req.user.id, String(project.id)]);
        await client.query("INSERT INTO app_audit_log(actor_user_id,action,project_id,details) VALUES($1,'project.created',$2,$3::jsonb)", [req.user.id, String(project.id), JSON.stringify({ name: String(project.name || "").slice(0,160) })]);
      }
      await client.query("COMMIT");
      return res.json({ ok: true, workspaceKey, updatedAt: saved.rows[0].updated_at });
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); console.error("Scoped project create error:", error); return res.status(503).json({ ok: false, error: "Could not create project" }); }
    finally { client.release(); }
  }

  // The current persisted model stores cross-project editor state in one document.
  // Until that state is split into project-scoped records, only explicitly global
  // workspace managers may replace it; panel membership alone never authorizes a
  // whole-workspace write.
  if (!hasGlobalPermission(req.user, "projects:all") && !hasGlobalPermission(req.user, "projects:manage") && !hasGlobalPermission(req.user, "*")) {
    return res.status(403).json({ ok: false, error: "Workspace editing requires global project management access" });
  }

  const workspacePayload = { ...payload, state: { ...(payload.state || {}) } };
  for (const key of PANEL_SETTING_KEYS) delete workspacePayload.state[key];
  delete workspacePayload.state.savedSettingFiles;

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const previous = await client.query("SELECT payload FROM app_state WHERE workspace_key=$1 FOR UPDATE", [workspaceKey]);
      const previousProjects = Array.isArray(previous.rows[0]?.payload?.projects) ? previous.rows[0].payload.projects : [];
      const nextProjectIds = new Set(Array.isArray(payload.projects) ? payload.projects.map((project) => String(project.id)) : []);
      const removedProjectIds = previousProjects.map((project) => String(project.id)).filter((id) => !nextProjectIds.has(id));
      const result = await client.query(
        "INSERT INTO app_state (workspace_key, payload, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (workspace_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW() RETURNING updated_at",
        [workspaceKey, JSON.stringify(workspacePayload)],
      );
      await client.query("INSERT INTO app_audit_log(actor_user_id,action,details) VALUES($1,'workspace.state_saved',$2::jsonb)", [req.user.id, JSON.stringify({ projectCount: nextProjectIds.size })]);
      for (const projectId of removedProjectIds) {
        const affected = await client.query("SELECT user_id FROM app_user_projects WHERE project_id=$1", [projectId]);
        await client.query("DELETE FROM app_user_projects WHERE project_id=$1", [projectId]);
        for (const membership of affected.rows) await client.query("INSERT INTO app_audit_log(actor_user_id,target_user_id,action,project_id,details) VALUES($1,$2,'project.access_revoked',$3,'{}'::jsonb)", [req.user.id, membership.user_id, projectId]);
      }
      await client.query("COMMIT");
      return res.json({ ok: true, workspaceKey, updatedAt: result.rows[0].updated_at });
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  } catch (error) {
    res.status(503).json({ ok: false, error: process.env.NODE_ENV === "production" ? "Database unavailable" : error.message });
  }
};

app.put("/api/state", saveState);
app.post("/api/state", saveState);

if (existsSync(distDirectory)) {
  app.use(express.static(distDirectory, { index: "index.html" }));
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
    if (req.method !== "GET" || !existsSync(distIndex)) return next();
    res.sendFile(distIndex, (error) => { if (error) next(error); });
  });
}

const server = app.listen(port, "0.0.0.0", () => {
  console.log("Monitoring API listening on port " + port);
});

const shutdown = async (signal) => {
  console.log(signal + " received; shutting down gracefully.");
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
