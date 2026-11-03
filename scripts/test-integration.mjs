import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Miniflare } from "miniflare";
import { unstable_getMiniflareWorkerOptions, unstable_splitSqlQuery as splitSqlQuery } from "wrangler";
import { createHash, randomBytes } from "node:crypto";

// The compiled Worker and a fresh local D1/R2 store exercise the actual runtime.
mkdirSync(".wrangler", { recursive: true });
const state = mkdtempSync(resolve(".wrangler/integration-"));
const base = "https://two.test";
const config = unstable_getMiniflareWorkerOptions("dist/server/wrangler.json");
const root = dirname(config.main);
const modules = [config.main, ...readdirSync(root, { recursive: true }).filter((path) => path.endsWith(".js") && path !== "index.js").map((path) => resolve(root, path))].map((path) => ({ path, type: "ESModule" }));
const mf = new Miniflare({ ...config.workerOptions, modules, modulesRoot: root,
  d1Persist: resolve(state, "v3/d1"), r2Persist: resolve(state, "v3/r2"), cf: false });
const database = await mf.getD1Database("DB");
async function sql(command) {
  return (await database.batch(splitSqlQuery(command).map((statement) => database.prepare(statement)))).flatMap((result) => result.results);
}
for (const file of readdirSync("drizzle").filter((file) => file.endsWith(".sql")).sort()) await sql(readFileSync(`drizzle/${file}`, "utf8"));
const fetch = async (url, init) => {
  const request = new Request(url, init);
  return mf.dispatchFetch(url, { method: request.method, headers: Object.fromEntries(request.headers),
    body: request.body ? await request.arrayBuffer() : undefined, redirect: init?.redirect });
};
const invite = randomBytes(32).toString("hex");
const secondInvite = randomBytes(32).toString("hex");
const hash = (value) => createHash("sha256").update(value).digest("hex");
await sql(`INSERT INTO profiles (user_id, display_name, email) VALUES ('first', 'First', 'first@two.test'), ('second', 'Second', 'second@two.test');
INSERT INTO accounts (slot, user_id, email, invitation_hash, invitation_expires_at) VALUES (1, 'first', 'first@two.test', '${hash(invite)}', ${Date.now() + 600000}), (2, 'second', 'second@two.test', '${hash(secondInvite)}', 1);`);
const post = (path, payload, cookie = "", origin = base) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie }, body: JSON.stringify(payload) });
const cookieOf = (response) => response.headers.get("set-cookie").split(";")[0];
const password = "private test passphrase only";
try {
  const home = await fetch(base, { redirect: "manual" });
  assert.equal(home.status, 307);
  assert.equal(home.headers.get("location"), "/login");
  for (const path of ["/api/workspace", "/api/memory-photos?id=1"]) {
    assert.equal((await fetch(base + path, { headers: { "oai-authenticated-user-id": "forged", "oai-authenticated-user-email": "first@two.test" } })).status, 401);
  }
  assert.equal((await post("/api/auth", { action: "login", email: "first@two.test", password }, "", "https://evil.test")).status, 403);
  assert.equal((await post("/api/auth", { action: "register", email: "outsider@two.test", password, invitation: invite })).status, 400);
  assert.equal((await post("/api/auth", { action: "register", email: "second@two.test", password, invitation: secondInvite })).status, 400);
  console.log("PASS anonymous protection, forged identity headers, CSRF, expired/mismatched invitations");

  const registrations = await Promise.all([1, 2].map(() => post("/api/auth", { action: "register", email: "FIRST@two.test", password, invitation: invite })));

  assert.equal(registrations.filter((response) => response.status === 200).length, 1);
  assert.equal(registrations.filter((response) => [400, 409].includes(response.status)).length, 1);
  const registered = registrations.find((response) => response.ok);
  const cookie = cookieOf(registered);
  assert.match(registered.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
  assert.match(registered.headers.get("set-cookie"), /; Secure/);
  assert.equal((await post("/api/auth", { action: "login", email: "first@two.test", password: "incorrect" })).status, 401);
  const login = await post("/api/auth", { action: "login", email: "first@two.test", password });
  assert.equal(login.status, 200);
  const secondDevice = cookieOf(login);
  await sql(`UPDATE accounts SET invitation_expires_at=${Date.now() + 600000} WHERE slot=2`);
  const partner = await post("/api/auth", { action: "register", email: "second@two.test", password, invitation: secondInvite });
  assert.equal(partner.status, 200);
  const partnerCookie = cookieOf(partner);
  const session = (await sql("SELECT token_hash FROM sessions LIMIT 1"))[0];
  assert.notEqual(session.token_hash, cookie.split("=")[1]);
  console.log("PASS one-use registration under concurrency, password login, hashed server sessions");

  const create = await post("/api/workspace", { action: "createHabit", title: "Walk", cadence: "每天" }, cookie);
  assert.equal(create.status, 201);
  const { habit } = await create.json();
  const checks = await Promise.all(Array.from({ length: 4 }, () => post("/api/workspace", { action: "setHabitCheck", habitId: habit.id, day: "2026-11-03", checked: true }, cookie)));
  assert(checks.every((response) => response.ok));
  assert.equal((await sql("SELECT count(*) AS count FROM habit_checks"))[0].count, 1);
  assert.equal((await post("/api/workspace", { action: "setHabitCheck", habitId: habit.id, day: "2026-11-03", checked: false }, cookie)).status, 200);
  assert.equal((await sql("SELECT count(*) AS count FROM habit_checks"))[0].count, 0);
  assert.equal((await post("/api/workspace", { action: "createMemory", title: "Bad date", memoryDate: "2026-02-30" }, cookie)).status, 400);
  assert.equal((await post("/api/workspace", { action: "updateIdea", id: 99999, status: "planned", plannedDate: "2026-11-03" }, cookie)).status, 404);
  const invalidJson = await fetch(base + "/api/workspace", { method: "POST", headers: { Origin: base, Cookie: cookie, "Content-Type": "application/json" }, body: "null" });
  assert.equal(invalidJson.status, 400);
  const idea = (await (await post("/api/workspace", { action: "createIdea", title: "A trip" }, cookie)).json()).item;
  const memoryResponse = await post("/api/workspace", { action: "createMemory", title: "A trip", memoryDate: "2026-11-03", sourceIdeaId: idea.id }, cookie);
  assert.equal(memoryResponse.status, 201);
  const { memory } = await memoryResponse.json();
  assert.equal((await sql(`SELECT status FROM ideas WHERE id=${idea.id}`))[0].status, "done");
  console.log("PASS idempotent check-ins, calendar validation, malformed JSON, atomic idea completion");

  const form = new FormData();
  form.set("memoryId", String(memory.id));
  // A valid 1x1 PNG exercises R2 storage and authenticated reads.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=", "base64");
  form.append("photos", new File([png], "photo.png", { type: "image/png" }));
  const uploaded = await fetch(base + "/api/memory-photos", { method: "POST", headers: { Origin: base, Cookie: cookie }, body: form });
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const photo = (await uploaded.json()).photos[0];
  const photoResponse = await fetch(base + `/api/memory-photos?id=${photo.id}`, { headers: { Cookie: cookie } });
  assert.equal(photoResponse.status, 200);
  assert.deepEqual(Buffer.from(await photoResponse.arrayBuffer()), png);
  assert.match(photoResponse.headers.get("cache-control"), /no-store/);
  const workspace = await fetch(base + "/api/workspace", { headers: { Cookie: secondDevice } });
  assert.equal(workspace.status, 200);
  assert.equal((await workspace.json()).memories.length, 1);
  const partnerData = await (await fetch(base + "/api/workspace", { headers: { Cookie: partnerCookie } })).json();
  assert.equal(partnerData.currentUserId, "second");
  assert.equal(partnerData.memories.length, 1);
  assert.equal(partnerData.people.length, 2);
  assert.equal((await post("/api/auth", { action: "logout" }, cookie)).status, 200);
  assert.equal((await fetch(base + "/api/workspace", { headers: { Cookie: cookie } })).status, 401);
  await sql("UPDATE sessions SET expires_at=1");
  assert.equal((await fetch(base + "/api/workspace", { headers: { Cookie: secondDevice } })).status, 401);
  console.log("PASS photo round-trip, private caching, second device refresh, logout and expiry");

  for (let attempt = 0; attempt < 10; attempt++) await post("/api/auth", { action: "login", email: "ratelimit@two.test", password: "incorrect" });
  assert.equal((await post("/api/auth", { action: "login", email: "ratelimit@two.test", password: "incorrect" })).status, 429);
  console.log("PASS persistent authentication rate limit");
} finally {
  await mf.dispose();
}
