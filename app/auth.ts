import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lte } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, profiles, sessions } from "../db/schema";
import { randomToken, tokenHash } from "../lib/auth-crypto";

export const SESSION_COOKIE = "two_of_us_session";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

export async function getUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [user] = await getDb().select({ userId: profiles.userId, email: accounts.email, displayName: profiles.displayName })
    .from(sessions).innerJoin(accounts, eq(accounts.userId, sessions.userId))
    .innerJoin(profiles, eq(profiles.userId, accounts.userId))
    .where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, Date.now()))).limit(1);
  return user ?? null;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export function sessionCookie(token: string, request: Request, maxAge = SESSION_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

export async function createSession(userId: string, request: Request) {
  const token = randomToken();
  const db = getDb();
  await db.delete(sessions).where(lte(sessions.expiresAt, Date.now()));
  await db.insert(sessions).values({ tokenHash: tokenHash(token), userId, expiresAt: Date.now() + SESSION_SECONDS * 1000 });
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(token, request), "Cache-Control": "no-store" } });
}
