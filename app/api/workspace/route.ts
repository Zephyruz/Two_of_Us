import { and, desc, eq, gte } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getUser } from "../../auth";
import { isCalendarDay } from "../../../lib/dates";
import { readJsonObject, requireSameOrigin } from "../../../lib/request-security";
import { getDb } from "../../../db";
import { accounts, habitChecks, habits, ideas, memories, memoryPhotos, profiles, workspaceSettings } from "../../../db/schema";

const categories = new Set(["eat", "buy", "go", "cook", "watch", "other"]);
const statuses = new Set(["idea", "planned", "done"]);

function clean(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const db = getDb();
  const since = new Date();
  since.setDate(since.getDate() - 45);
  const [people, ideaRows, habitRows, checkRows, memoryRows, photoRows, settingsRows] = await Promise.all([
    db.select({ userId: profiles.userId, displayName: profiles.displayName, customName: profiles.customName, email: accounts.email }).from(profiles).innerJoin(accounts, eq(accounts.userId, profiles.userId)).orderBy(accounts.slot),
    db.select().from(ideas).orderBy(desc(ideas.createdAt)),
    db.select().from(habits).orderBy(desc(habits.createdAt)),
    db.select().from(habitChecks).where(gte(habitChecks.day, since.toISOString().slice(0, 10))),
    db.select().from(memories).orderBy(desc(memories.memoryDate), desc(memories.createdAt)),
    db.select({ id: memoryPhotos.id, memoryId: memoryPhotos.memoryId, fileName: memoryPhotos.fileName, contentType: memoryPhotos.contentType, uploadedBy: memoryPhotos.uploadedBy, createdAt: memoryPhotos.createdAt }).from(memoryPhotos).orderBy(memoryPhotos.createdAt),
    db.select().from(workspaceSettings).where(eq(workspaceSettings.id, 1)).limit(1),
  ]);
  return Response.json({ currentUserId: user.userId, people, ideas: ideaRows, habits: habitRows, checks: checkRows, memories: memoryRows, memoryPhotos: photoRows, pendingPartnerName: settingsRows[0]?.pendingPartnerName || "" });
}

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const user = await getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const payload = await readJsonObject(request);
  if (!payload) return Response.json({ error: "请求格式无效" }, { status: 400 });
  const action = clean(payload.action, 30);
  const db = getDb();

  if (action === "createIdea") {
    const title = clean(payload.title);
    if (!title) return Response.json({ error: "请写下一个想法" }, { status: 400 });
    const category = clean(payload.category, 20);
    const plannedDate = payload.plannedDate || null;
    if (plannedDate !== null && !isCalendarDay(plannedDate)) return Response.json({ error: "无效日期" }, { status: 400 });
    const [item] = await db.insert(ideas).values({
      title,
      category: categories.has(category) ? category : "other",
      note: clean(payload.note, 500),
      status: plannedDate ? "planned" : "idea",
      plannedDate,
      createdBy: user.userId,
    }).returning();
    return Response.json({ item }, { status: 201 });
  }

  if (action === "updateIdea") {
    const id = Number(payload.id);
    const status = clean(payload.status, 20);
    if (!Number.isInteger(id) || id <= 0 || !statuses.has(status)) return Response.json({ error: "无效操作" }, { status: 400 });
    const plannedDate = payload.plannedDate || null;
    if ((status === "planned" && !isCalendarDay(plannedDate)) || (plannedDate !== null && !isCalendarDay(plannedDate))) return Response.json({ error: "无效日期" }, { status: 400 });
    const [item] = await db.update(ideas).set({
      status,
      plannedDate: status === "idea" ? null : plannedDate,
      completedAt: status === "done" ? new Date().toISOString() : null,
    }).where(eq(ideas.id, id)).returning();
    if (!item) return Response.json({ error: "记录不存在" }, { status: 404 });
    return Response.json({ item });
  }

  if (action === "createHabit") {
    const title = clean(payload.title);
    if (!title) return Response.json({ error: "请填写习惯名称" }, { status: 400 });
    const [habit] = await db.insert(habits).values({ title, cadence: clean(payload.cadence, 40) || "每天", createdBy: user.userId }).returning();
    return Response.json({ habit }, { status: 201 });
  }

  if (action === "setHabitCheck") {
    const habitId = Number(payload.habitId);
    const day = payload.day;
    if (!Number.isInteger(habitId) || habitId <= 0 || !isCalendarDay(day) || typeof payload.checked !== "boolean") return Response.json({ error: "无效打卡" }, { status: 400 });
    const [habit] = await db.select({ id: habits.id }).from(habits).where(eq(habits.id, habitId)).limit(1);
    if (!habit) return Response.json({ error: "习惯不存在" }, { status: 404 });
    if (payload.checked) {
      await db.insert(habitChecks).values({ habitId, userId: user.userId, day }).onConflictDoNothing();
    } else {
      await db.delete(habitChecks).where(and(eq(habitChecks.habitId, habitId), eq(habitChecks.userId, user.userId), eq(habitChecks.day, day)));
    }
    return Response.json({ checked: payload.checked });
  }

  if (action === "createMemory") {
    const title = clean(payload.title);
    const memoryDate = payload.memoryDate;
    if (!title || !isCalendarDay(memoryDate)) return Response.json({ error: "请填写有效的标题和日期" }, { status: 400 });
    const sourceIdeaId = payload.sourceIdeaId ? Number(payload.sourceIdeaId) : null;
    if (sourceIdeaId !== null) {
      if (!Number.isInteger(sourceIdeaId) || sourceIdeaId <= 0) return Response.json({ error: "无效清单" }, { status: 400 });
      const [idea] = await db.select({ id: ideas.id }).from(ideas).where(eq(ideas.id, sourceIdeaId)).limit(1);
      if (!idea) return Response.json({ error: "清单不存在" }, { status: 404 });
    }
    const insert = db.insert(memories).values({
      title,
      note: clean(payload.note, 1000),
      memoryDate,
      sourceIdeaId: Number.isInteger(sourceIdeaId) ? sourceIdeaId : null,
      createdBy: user.userId,
    }).returning();
    const [memory] = sourceIdeaId
      ? (await db.batch([insert, db.update(ideas).set({ status: "done", completedAt: new Date().toISOString() }).where(eq(ideas.id, sourceIdeaId))]))[0]
      : await insert;
    return Response.json({ memory }, { status: 201 });
  }

  if (action === "updateNames") {
    const myName = clean(payload.myName, 30);
    const partnerName = clean(payload.partnerName, 30);
    if (!myName || !partnerName) return Response.json({ error: "请填写双方名字" }, { status: 400 });
    const allPeople = await db.select({ userId: accounts.userId }).from(accounts).orderBy(accounts.slot);
    const partner = allPeople.find((person) => person.userId !== user.userId);
    await db.update(profiles).set({ customName: myName, updatedAt: new Date().toISOString() }).where(eq(profiles.userId, user.userId));
    if (partner) {
      await db.update(profiles).set({ customName: partnerName, updatedAt: new Date().toISOString() }).where(eq(profiles.userId, partner.userId));
    } else {
      await db.insert(workspaceSettings).values({ id: 1, pendingPartnerName: partnerName, updatedAt: new Date().toISOString() }).onConflictDoUpdate({
        target: workspaceSettings.id,
        set: { pendingPartnerName: partnerName, updatedAt: new Date().toISOString() },
      });
    }
    return Response.json({ saved: true });
  }

  if (action === "deleteIdea") {
    const id = Number(payload.id);
    if (!Number.isInteger(id)) return Response.json({ error: "无效记录" }, { status: 400 });
    await db.delete(ideas).where(eq(ideas.id, id));
    return Response.json({ deleted: true });
  }

  if (action === "deleteHabit") {
    const id = Number(payload.id);
    if (!Number.isInteger(id)) return Response.json({ error: "无效习惯" }, { status: 400 });
    await db.delete(habits).where(eq(habits.id, id));
    return Response.json({ deleted: true });
  }

  if (action === "deleteMemory") {
    const id = Number(payload.id);
    if (!Number.isInteger(id)) return Response.json({ error: "无效记录" }, { status: 400 });
    const photos = await db.select().from(memoryPhotos).where(eq(memoryPhotos.memoryId, id));
    if (photos.length && !env.BUCKET) return Response.json({ error: "照片存储不可用，请稍后重试删除" }, { status: 503 });
    if (env.BUCKET && photos.length) await Promise.all(photos.map((photo) => env.BUCKET!.delete(photo.objectKey)));
    await db.delete(memories).where(eq(memories.id, id));
    return Response.json({ deleted: true });
  }

  return Response.json({ error: "未知操作" }, { status: 400 });
}
