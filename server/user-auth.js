import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export const USER_SESSION_COOKIE = "monitoring_site";
export const USER_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const GLOBAL_PERMISSIONS = [
  "users:read", "users:manage", "projects:create", "projects:manage",
  "permissions:delegate", "audit:read", "projects:all", "panels:all", "devices:manage",
];
export const PROJECT_PERMISSIONS = ["project:manage", "permissions:delegate", "audit:read", "devices:manage"];

export function normalizeUsername(value) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export function validUsername(value) {
  return typeof value === "string" && value.trim().length >= 3 && value.trim().length <= 64 && /^[\p{L}\p{N}._-]+$/u.test(value.trim());
}

export function validPassword(value) {
  return typeof value === "string" && value.length >= 10 && value.length <= 256;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT_OPTIONS);
  return `scrypt$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password, encoded) {
  try {
    const [algorithm, n, r, p, saltText, keyText] = String(encoded).split("$");
    if (algorithm !== "scrypt" || !/^\d+$/.test(n) || !/^\d+$/.test(r) || !/^\d+$/.test(p)) return false;
    const expected = Buffer.from(keyText, "base64url");
    const actual = await scrypt(password, Buffer.from(saltText, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}

export const hashSessionToken = (token) => createHash("sha256").update(token).digest("hex");
export const newSessionToken = () => randomBytes(32).toString("base64url");
export const newUserId = () => randomUUID();

export function readSessionCookie(req) {
  const part = String(req.headers.cookie || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(`${USER_SESSION_COOKIE}=`));
  if (!part) return "";
  try { return decodeURIComponent(part.slice(USER_SESSION_COOKIE.length + 1)); } catch { return ""; }
}

export function sessionCookie(token, secure, maxAgeSeconds = USER_SESSION_TTL_MS / 1000) {
  return `${USER_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

export function hasGlobalPermission(user, permission) {
  const permissions = user?.globalPermissions || [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function hasProjectPermission(user, projectId, permission) {
  if (hasGlobalPermission(user, "projects:all") || hasGlobalPermission(user, "*")) return true;
  const scope = user?.projectPermissions?.[projectId];
  return Boolean(scope?.includes("*") || scope?.includes(permission));
}

export async function loadUserById(pool, id) {
  const result = await pool.query(
    `SELECT u.id, u.username, u.display_name AS "displayName", u.email, u.phone,
            u.is_active AS "isActive", u.must_change_password AS "mustChangePassword",
            u.created_at AS "createdAt", u.updated_at AS "updatedAt", u.last_login_at AS "lastLoginAt",
            COALESCE((SELECT array_agg(permission ORDER BY permission) FROM app_user_global_permissions WHERE user_id=u.id), ARRAY[]::text[]) AS "globalPermissions"
     FROM app_users u WHERE u.id=$1`, [id],
  );
  const user = result.rows[0];
  if (!user) return null;
  const memberships = await pool.query(
    `SELECT up.project_id AS "projectId", COALESCE(array_agg(DISTINCT p.panel_id) FILTER (WHERE p.panel_id IS NOT NULL), ARRAY[]::text[]) AS "panelIds",
            COALESCE(array_agg(DISTINCT pp.permission) FILTER (WHERE pp.permission IS NOT NULL), ARRAY[]::text[]) AS permissions
     FROM app_user_projects up LEFT JOIN app_user_panels p ON p.user_id=up.user_id AND p.project_id=up.project_id
     LEFT JOIN app_user_project_permissions pp ON pp.user_id=up.user_id AND pp.project_id=up.project_id
     WHERE up.user_id=$1 GROUP BY up.project_id`, [id],
  );
  user.projectPanels = Object.fromEntries(memberships.rows.map((row) => [row.projectId, row.panelIds]));
  user.projectPermissions = Object.fromEntries(memberships.rows.map((row) => [row.projectId, row.permissions]));
  return user;
}

export async function writeAudit(pool, { actorId = null, targetId = null, action, projectId = null, panelId = null, outcome = "success", details = {} }) {
  await pool.query(
    `INSERT INTO app_audit_log (actor_user_id,target_user_id,action,project_id,panel_id,outcome,details)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [actorId, targetId, action, projectId, panelId, outcome, JSON.stringify(details)],
  );
}
