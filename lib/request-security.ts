export function requireSameOrigin(request: Request): Response | null {
  if (request.headers.get("Origin") !== new URL(request.url).origin || request.headers.get("Sec-Fetch-Site") === "cross-site") {
    return Response.json({ error: "请求来源无效，请刷新后重试" }, { status: 403 });
  }
  return null;
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("Content-Type")?.includes("application/json")) return null;
  // Bound streamed bodies too; Content-Length is not trusted.
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16 * 1024) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  try {
    const body = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch { return null; }
}
