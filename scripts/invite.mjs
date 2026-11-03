import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const quote = (value) => `'${value.replaceAll("'", "''")}'`;

export function planInvitation({ slot, email, name, reset = false }, people, currentAccounts) {
  if (![1, 2].includes(slot)) throw new Error("Slot must be 1 or 2.");
  email = email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email.");
  if (!name.trim() || name.length > 80) throw new Error("Name must contain 1–80 characters.");
  const account = currentAccounts.find((item) => item.slot === slot);
  if (account && account.email !== email) throw new Error("This slot belongs to a different email. Refusing to replace its owner.");
  if (currentAccounts.some((item) => item.email === email && item.slot !== slot)) throw new Error("Email already occupies the other slot.");
  if (account?.password_hash && !reset) throw new Error("Account already registered. Use --reset to revoke sessions and reset its password.");
  if (reset && !account) throw new Error("Cannot reset an account that does not exist.");
  const matches = people.filter((person) => person.email.toLowerCase() === email);
  if (matches.length > 1) throw new Error("Multiple old profiles share this email. Resolve the duplicate profiles before inviting.");
  const userId = account?.user_id || matches[0]?.user_id || randomUUID();
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  const expiresAt = Date.now() + 7 * 86400_000;
  const statements = [];
  if (!account && !matches.length) statements.push(`INSERT INTO profiles (user_id, display_name, email) VALUES (${quote(userId)}, ${quote(name.trim())}, ${quote(email)});`);
  if (account) {
    statements.push(`DELETE FROM sessions WHERE user_id = ${quote(userId)};`);
    statements.push(`UPDATE accounts SET password_hash = NULL, invitation_hash = ${quote(hash)}, invitation_expires_at = ${expiresAt} WHERE slot = ${slot} AND email = ${quote(email)};`);
  } else {
    statements.push(`INSERT INTO accounts (slot, user_id, email, invitation_hash, invitation_expires_at) VALUES (${slot}, ${quote(userId)}, ${quote(email)}, ${quote(hash)}, ${expiresAt});`);
  }
  return { token, email, sql: statements.join("\n") };
}

function main() {
  const { values } = parseArgs({ options: {
    slot: { type: "string" }, email: { type: "string" }, name: { type: "string" }, origin: { type: "string" },
    config: { type: "string", default: "dist/server/wrangler.json" }, database: { type: "string", default: "DB" },
    local: { type: "boolean" }, remote: { type: "boolean" }, reset: { type: "boolean" },
  } });
  if (Boolean(values.local) === Boolean(values.remote) || !values.email || !values.name || !values.origin) {
    throw new Error("Usage: npm run invite -- --local|--remote --slot 1|2 --email ADDRESS --name NAME --origin https://your-site [--config PATH] [--database DB] [--reset]");
  }
  const origin = new URL(values.origin);
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) throw new Error("Use HTTPS, or loopback HTTP for local development.");
  const run = (sql) => {
    const result = spawnSync(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "d1", "execute", values.database,
      values.remote ? "--remote" : "--local", "--config", values.config, ...(values.local ? ["--persist-to", ".wrangler/state"] : []), "--command", sql, "--json"], { encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || "D1 command failed");
    return JSON.parse(result.stdout);
  };
  const people = run("SELECT user_id, email FROM profiles;")[0].results;
  const accounts = run("SELECT slot, user_id, email, password_hash FROM accounts;")[0].results;
  const plan = planInvitation({ slot: Number(values.slot), email: values.email, name: values.name, reset: values.reset }, people, accounts);
  run(plan.sql);
  const fragment = new URLSearchParams({ invite: plan.token, email: plan.email });
  console.log(`Invitation (one use, expires in 7 days):\n${origin.origin}/login#${fragment}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
