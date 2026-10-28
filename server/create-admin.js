import "dotenv/config";
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashPassword, newUserId, normalizeUsername, validPassword, validUsername } from "./user-auth.js";

const { Pool } = pg;
const directory = path.dirname(fileURLToPath(import.meta.url));
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
        if (char === "\u0003") { stdin.setRawMode(false); stdin.pause(); process.exit(130); }
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
  await pool.query(readFileSync(path.join(directory, "schema.sql"), "utf8"));
  await pool.query(readFileSync(path.join(directory, "user-auth-schema.sql"), "utf8"));
  const existing = await pool.query("SELECT COUNT(*)::int AS count FROM app_users");
  if (existing.rows[0].count !== 0) throw new Error("Bootstrap is only available before the first account is created.");
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const username = (await rl.question("Admin username: ")).trim();
  const displayName = (await rl.question("Display name: ")).trim();
  rl.close();
  const password = await hiddenPrompt("Admin password (10+ characters): ");
  if (!validUsername(username) || !displayName || displayName.length > 160 || !validPassword(password)) throw new Error("Invalid username, display name, or password length.");
  const passwordHash = await hashPassword(password);
  const id = newUserId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query("SELECT pg_advisory_xact_lock(hashtext('monitoring-first-admin'))");
    const count = await client.query("SELECT COUNT(*)::int AS count FROM app_users");
    if (count.rows[0].count !== 0) throw new Error("An account was created while bootstrap was running.");
    await client.query("INSERT INTO app_users(id,username,username_normalized,password_hash,display_name) VALUES($1,$2,$3,$4,$5)", [id, username, normalizeUsername(username), passwordHash, displayName]);
    await client.query("INSERT INTO app_user_global_permissions(user_id,permission) VALUES($1,'*')", [id]);
    await client.query("INSERT INTO app_audit_log(actor_user_id,target_user_id,action) VALUES($1,$1,'system.first_admin_created')", [id]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
  stdout.write("Initial administrator created. Sign in through /login.\n");
} catch (error) {
  console.error(error.message || "Could not create initial administrator.");
  process.exitCode = 1;
} finally { await pool.end(); }
