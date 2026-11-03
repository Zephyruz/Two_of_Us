import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getUser } from "../../auth";
import { requireSameOrigin } from "../../../lib/request-security";
import { storePhotoBatch } from "../../../lib/photo-upload";
import { getDb } from "../../../db";
import { memories, memoryPhotos } from "../../../db/schema";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const maxFileSize = 8 * 1024 * 1024;
const maxBatchSize = 9;

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!env.BUCKET) return Response.json({ error: "照片存储不可用" }, { status: 503 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "无效照片" }, { status: 400 });
  const db = getDb();
  const [photo] = await db.select().from(memoryPhotos).where(eq(memoryPhotos.id, id)).limit(1);
  if (!photo) return Response.json({ error: "照片不存在" }, { status: 404 });
  const object = await env.BUCKET.get(photo.objectKey);
  if (!object) return Response.json({ error: "照片不存在" }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(photo.fileName)}`,
    },
  });
}

export async function POST(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const user = await getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!env.BUCKET) return Response.json({ error: "照片存储不可用" }, { status: 503 });
  let form: FormData;
  try { form = await request.formData(); }
  catch { return Response.json({ error: "上传格式无效" }, { status: 400 }); }
  const memoryId = Number(form.get("memoryId"));
  const files = form.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
  if (!Number.isInteger(memoryId) || memoryId <= 0) return Response.json({ error: "无效记录" }, { status: 400 });
  if (!files.length || files.length > maxBatchSize) return Response.json({ error: "每次请选择 1 到 9 张照片" }, { status: 400 });
  for (const file of files) {
    if (!allowedTypes.has(file.type)) return Response.json({ error: "仅支持 JPG、PNG、WebP 和 HEIC" }, { status: 400 });
    if (file.size > maxFileSize) return Response.json({ error: "单张照片不能超过 8 MB" }, { status: 400 });
  }
  const db = getDb();
  const [memory] = await db.select().from(memories).where(eq(memories.id, memoryId)).limit(1);
  if (!memory) return Response.json({ error: "记录不存在" }, { status: 404 });

  const rows = files.map((file) => {
    const suffix = file.name.includes(".") ? file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() : "jpg";
    const objectKey = `memories/${memoryId}/${crypto.randomUUID()}.${suffix || "jpg"}`;
    return {
        memoryId,
        objectKey,
        fileName: file.name.slice(0, 180) || "photo",
        contentType: file.type,
        uploadedBy: user.userId,
    };
  });
  const bucket = env.BUCKET;
  try {
    const saved = await storePhotoBatch(rows.map((row) => row.objectKey),
      (key, index) => bucket.put(key, files[index].stream(), { httpMetadata: { contentType: files[index].type } }),
      () => db.insert(memoryPhotos).values(rows).returning(),
      (keys) => bucket.delete(keys));
    return Response.json({ photos: saved }, { status: 201 });
  } catch {
    return Response.json({ error: "这批照片未保存，请重试" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const rejected = requireSameOrigin(request);
  if (rejected) return rejected;
  const user = await getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!env.BUCKET) return Response.json({ error: "照片存储不可用" }, { status: 503 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "无效照片" }, { status: 400 });
  const db = getDb();
  const [photo] = await db.select().from(memoryPhotos).where(eq(memoryPhotos.id, id)).limit(1);
  if (!photo) return Response.json({ error: "照片不存在" }, { status: 404 });
  await env.BUCKET.delete(photo.objectKey);
  await db.delete(memoryPhotos).where(eq(memoryPhotos.id, id));
  return Response.json({ deleted: true });
}
