import "dotenv/config";
import pg from "pg";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashPassword, normalizeUsername, validPassword, validUsername } from "./user-auth.js";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.PGHOST || undefined,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  database: process.env.PGDATABASE || undefined,
  user: process.env.PGUSER || undefined,
  password: process.env.PGPASSWORD || undefined,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
});

function hiddenPrompt(label) {
  if (!stdin.isTTY) throw new Error("Run this command from an interactive terminal so the password can be entered without echo.");
  return new Promise((resolve) => {
    stdout.write(label);
    let value = "";
    const onData = (chunk) => {
      for (const char of chunk.toString()) {
        if (char === "\u0003") { stdin.setRawMode(false); stdin.pause(); stdin.removeListener("data", onData); process.exit(130); }
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false); stdin.pause(); stdin.removeListener("data", onData); stdout.write("\n"); resolve(value); return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    stdin.setRawMode(true); stdin.resume(); stdin.on("data", onData);
  });
}

try {
  const admins = await pool.query(
    `SELECT u.username FROM app_users u WHERE u.is_active AND (
      EXISTS (SELECT 1 FROM app_user_global_permissions p WHERE p.user_id=u.id AND p.permission='*') OR (
        EXISTS (SELECT 1 FROM app_user_global_permissions p WHERE p.user_id=u.id AND p.permission='users:manage') AND
        EXISTS (SELECT 1 FROM app_user_global_permissions p WHERE p.user_id=u.id AND p.permission='projects:manage') AND
        EXISTS (SELECT 1 FROM app_user_global_permissions p WHERE p.user_id=u.id AND p.permission='permissions:delegate')
      )
    ) ORDER BY u.username`,
  );
  if (admins.rowCount) stdout.write(`Active administrator accounts: ${admins.rows.map((row) => row.username).join(", ")}\n`);
  else {
    const accounts = await pool.query("SELECT username,display_name FROM app_users WHERE is_active ORDER BY username");
    if (!accounts.rowCount) throw new Error("No active accounts were found to recover.");
    stdout.write(`No active global administrator exists. Active accounts: ${accounts.rows.map((row) => `${row.username} (${row.display_name})`).join(", ")}\n`);
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const currentUsername = (await rl.question("Current administrator username: ")).trim();
  const newUsername = (await rl.question("New username (3-64 characters): ")).trim();
  const restoreConfirmation = admins.rowCount ? "" : await rl.question("To restore administrator access to the selected account, type RESTORE ADMIN: ");
  rl.close();
  if (!admins.rowCount && restoreConfirmation !== "RESTORE ADMIN") throw new Error("Administrator recovery was not confirmed.");
  const password = await hiddenPrompt("New password (10+ characters): ");
  const confirmation = await hiddenPrompt("Confirm new password: ");
  if (!validUsername(currentUsername) || !validUsername(newUsername)) throw new Error("Enter valid usernames (3-64 letters, numbers, dots, underscores, or hyphens).");
  if (!validPassword(password)) throw new Error("Password must contain 10 to 256 characters.");
  if (password !== confirmation) throw new Error("Passwords do not match.");

  const client = await pool.connect();
  let restoredAdmin = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('monitoring-admin-recovery'))");
    const result = await client.query(
      "SELECT id,is_active FROM app_users WHERE username_normalized=$1 FOR UPDATE",
      [normalizeUsername(currentUsername)],
    );
    const user = result.rows[0];
    if (!user) throw new Error("No account matches that current username.");
    if (!user.is_active) throw new Error("That account is disabled. Recover an active administrator account instead.");
    const permissionResult = await client.query("SELECT permission FROM app_user_global_permissions WHERE user_id=$1", [user.id]);
    const permissions = permissionResult.rows.map((row) => row.permission);
    const isAdmin = permissions.includes("*") || ["users:manage", "projects:manage", "permissions:delegate"].every((permission) => permissions.includes(permission));
    if (!isAdmin) {
      const activeAdminResult = await client.query(
        `SELECT COUNT(*)::int AS count FROM app_users u WHERE u.is_active AND (
          EXISTS (SELECT 1 FROM app_user_global_permissions p WHERE p.user_id=u.id AND p.permission='*') OR (
            EXISTS (SELECT 1 FROM app_user_global_permissions p WHERE p.user_id=u.id AND p.permission='users:manage') AND
            EXISTS (SELECT 1 FROM app_user_global_permissions p WHERE p.user_id=u.id AND p.permission='projects:manage') AND
            EXISTS (SELECT 1 FROM app_user_global_permissions p WHERE p.user_id=u.id AND p.permission='permissions:delegate')
          )
        )`,
      );
      if (activeAdminResult.rows[0].count !== 0 || restoreConfirmation !== "RESTORE ADMIN") throw new Error("The selected account is not an administrator, or an active administrator now exists.");
      await client.query("INSERT INTO app_user_global_permissions(user_id,permission) VALUES($1,'*') ON CONFLICT DO NOTHING", [user.id]);
      restoredAdmin = true;
    }

    await client.query(
      `UPDATE app_users SET username=$2,username_normalized=$3,password_hash=$4,must_change_password=TRUE,updated_at=NOW() WHERE id=$1`,
      [user.id, newUsername, normalizeUsername(newUsername), await hashPassword(password)],
    );
    await client.query("DELETE FROM app_sessions WHERE user_id=$1", [user.id]);
    await client.query(
      "INSERT INTO app_audit_log(actor_user_id,target_user_id,action,details) VALUES(NULL,$1,'system.admin_recovery',$2::jsonb)",
      [user.id, JSON.stringify({ username: newUsername, restoredAdmin })],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
  stdout.write(`Administrator recovered. Sign in as ${newUsername}; the site will ask you to change the password.\n`);
} catch (error) {
  console.error(error.message || "Could not recover administrator account.");
  process.exitCode = 1;
} finally { await pool.end(); }
