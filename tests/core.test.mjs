import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { hashPassword, verifyPassword, tokenHash, randomToken } from "../lib/auth-crypto.ts";
import { isCalendarDay } from "../lib/dates.ts";
import { readJsonObject, requireSameOrigin } from "../lib/request-security.ts";
import { storePhotoBatch } from "../lib/photo-upload.ts";
import { planInvitation } from "../scripts/invite.mjs";

test("password hashes have independent salts and reject wrong/missing credentials", async () => {
  const first = await hashPassword("a long private passphrase");
  const second = await hashPassword("a long private passphrase");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("a long private passphrase", first), true);
  assert.equal(await verifyPassword("another long private passphrase", first), false);
  assert.equal(await verifyPassword("a long private passphrase", null), false);
  assert.equal(await verifyPassword("a long private passphrase", "invalid"), false);
  const token = randomToken();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(tokenHash(token), token);
});

test("calendar validation rejects overflow, truncated and non-date values", () => {
  for (const day of ["2024-02-29", "2026-11-03", "2000-02-29"]) assert.equal(isCalendarDay(day), true);
  for (const day of ["2026-02-29", "2026-04-31", "2026-13-01", "0000-01-01", "2026-11-03x", "2026-1-1", null, {}]) assert.equal(isCalendarDay(day), false);
});

test("mutations require same-origin requests and bounded JSON objects", async () => {
  const make = (origin, body = "{}") => new Request("https://two.test/api/auth", { method: "POST", headers: { ...(origin ? { Origin: origin } : {}), "Content-Type": "application/json" }, body });
  assert.equal(requireSameOrigin(make("https://two.test")), null);
  assert.equal(requireSameOrigin(make("https://evil.test")).status, 403);
  assert.equal(requireSameOrigin(make(null)).status, 403);
  assert.deepEqual(await readJsonObject(make("https://two.test", '{"action":"login"}')), { action: "login" });
  for (const body of ["null", "[]", "oops", JSON.stringify({ x: "x".repeat(17000) })]) assert.equal(await readJsonObject(make("https://two.test", body)), null);
});

test("a failed photo put removes the whole batch without committing metadata", async () => {
  let committed = false; let removed;
  await assert.rejects(storePhotoBatch(["one", "two", "three"], async (_, index) => { if (index === 1) throw new Error("R2 unavailable"); }, async () => { committed = true; }, async (keys) => { removed = keys; }), /R2 unavailable/);
  assert.equal(committed, false);
  assert.deepEqual(removed, ["one", "two", "three"]);
});

test("a failed metadata commit rolls back objects; success keeps them", async () => {
  let removed = false;
  await assert.rejects(storePhotoBatch(["one"], async () => {}, async () => { throw new Error("D1 unavailable"); }, async () => { removed = true; }), /D1 unavailable/);
  assert.equal(removed, true);
  removed = false;
  assert.equal(await storePhotoBatch(["one"], async () => {}, async () => "saved", async () => { removed = true; }), "saved");
  assert.equal(removed, false);
});

test("migrations preserve old records; invitations enforce two slots and preserve identity", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const files = readdirSync("drizzle").filter((file) => file.endsWith(".sql")).sort();
  for (const file of files.slice(0, 3)) db.exec(readFileSync(`drizzle/${file}`, "utf8"));
  db.exec("INSERT INTO profiles (user_id, display_name, email) VALUES ('original', 'Original', 'First@two.test'); INSERT INTO ideas (title, created_by) VALUES ('Keep this', 'original');");
  for (const file of files.slice(3)) db.exec(readFileSync(`drizzle/${file}`, "utf8"));
  const plan = planInvitation({ slot: 1, email: " FIRST@two.test ", name: "First" }, [{ user_id: "original", email: "First@two.test" }], []);
  assert.equal(plan.sql.includes(plan.token), false);
  db.exec(plan.sql);
  assert.equal(db.prepare("SELECT user_id FROM accounts").get().user_id, "original");
  assert.equal(db.prepare("SELECT title FROM ideas").get().title, "Keep this");
  const second = planInvitation({ slot: 2, email: "other@two.test", name: "O'Brien" }, [], []);
  db.exec(second.sql);
  assert.equal(db.prepare("SELECT count(*) AS count FROM accounts").get().count, 2);
  assert.throws(() => db.exec("INSERT INTO accounts (slot, user_id, email) VALUES (3, 'original', 'third@two.test')"));
  assert.throws(() => planInvitation({ slot: 1, email: "outsider@two.test", name: "Other" }, [], [{ slot: 1, email: "first@two.test", user_id: "original" }]), /different email/);
  assert.throws(() => planInvitation({ slot: 1, email: "first@two.test", name: "First" }, [], [{ slot: 1, email: "first@two.test", user_id: "original", password_hash: "registered" }]), /--reset/);
  db.exec("INSERT INTO sessions VALUES ('session-hash', 'original', 9999999999999)");
  const reset = planInvitation({ slot: 1, email: "first@two.test", name: "First", reset: true }, [], [{ slot: 1, email: "first@two.test", user_id: "original", password_hash: "registered" }]);
  db.exec(reset.sql);
  assert.equal(db.prepare("SELECT count(*) AS count FROM sessions").get().count, 0);
  assert.equal(db.prepare("SELECT user_id FROM accounts WHERE slot=1").get().user_id, "original");
  db.close();
});
