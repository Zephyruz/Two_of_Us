import { cookies } from "next/headers";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { accounts, authAttempts, sessions } from "../../../db/schema";
import { hashPassword, normalizeEmail, tokenHash, validEmail, validPassword, verifyPassword } from "../../../lib/auth-crypto";
import { readJsonObject, requireSameOrigin } from "../../../lib/request-security";
import { createSession, SESSION_COOKIE, sessionCookie } from "../../auth";

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const payload = await readJsonObject(request);
  if (!payload) return Response.json({ error: "请求格式无效" }, { status: 400 });
  const db = getDb();
  if (payload.action === "logout") {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
    return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", request, 0) } });
  }
  if (payload.action !== "login" && payload.action !== "register") return Response.json({ error: "无效操作" }, { status: 400 });
  const email = normalizeEmail(payload.email);
  const password = payload.password;
  if (!validEmail(email) || typeof password !== "string" || password.length > 128 || !password.length) {
    return Response.json({ error: "请填写有效的邮箱和密码" }, { status: 400 });
  }

  // Persistent, atomic counters shared across Worker instances. CF supplies this IP.
  const now = Date.now();
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  await db.delete(authAttempts).where(lte(authAttempts.expiresAt, now));
  const counters = await db.batch([
    db.insert(authAttempts).values({ key: tokenHash(`email:${email}`), count: 1, expiresAt: now + 900_000 })
      .onConflictDoUpdate({ target: authAttempts.key, set: { count: sql`${authAttempts.count} + 1` } }).returning(),
    db.insert(authAttempts).values({ key: tokenHash(`ip:${ip}`), count: 1, expiresAt: now + 900_000 })
      .onConflictDoUpdate({ target: authAttempts.key, set: { count: sql`${authAttempts.count} + 1` } }).returning(),
  ]);
  if (counters[0][0].count > 10 || counters[1][0].count > 50) {
    return Response.json({ error: "尝试次数过多，请 15 分钟后再试" }, { status: 429, headers: { "Retry-After": "900" } });
  }

  const [account] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
  if (payload.action === "login") {
    const verified = await verifyPassword(password, account?.passwordHash ?? null);
    if (!verified || !account) return Response.json({ error: "邮箱或密码不正确" }, { status: 401 });
    return createSession(account.userId, request);
  }

  if (!validPassword(password)) return Response.json({ error: "密码须为 15 到 128 个字符" }, { status: 400 });
  const invitation = typeof payload.invitation === "string" ? payload.invitation : "";
  if (!/^[a-f0-9]{64}$/.test(invitation) || !account || account.passwordHash || account.invitationHash !== tokenHash(invitation) || (account.invitationExpiresAt ?? 0) <= now) {
    return Response.json({ error: "邀请无效或已过期，请向邀请人索取新链接" }, { status: 400 });
  }
  const passwordHash = await hashPassword(password);
  // Consume the invitation in the same statement that sets the password.
  const [registered] = await db.update(accounts).set({ passwordHash, invitationHash: null, invitationExpiresAt: null })
    .where(and(eq(accounts.slot, account.slot), isNull(accounts.passwordHash), eq(accounts.invitationHash, tokenHash(invitation)), gt(accounts.invitationExpiresAt, Date.now())))
    .returning();
  if (!registered) return Response.json({ error: "邀请已使用或已过期" }, { status: 409 });
  return createSession(registered.userId, request);
}
