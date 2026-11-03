import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";

// OWASP's scrypt alternative: N=2^15, r=8, p=3 (~32 MiB).
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, options, (error, key) => error ? reject(error) : resolve(key));
  });
}
export const randomToken = () => randomBytes(32).toString("hex");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const normalizeEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
export const validEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const validPassword = (value: unknown): value is string => typeof value === "string" && value.length >= 15 && value.length <= 128;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string | null) {
  const parts = encoded?.split("$");
  const valid = parts?.length === 3 && parts[0] === "scrypt" && /^[a-f0-9]{32}$/.test(parts[1]) && /^[a-f0-9]{128}$/.test(parts[2]);
  // Do the same expensive work for unknown/unregistered accounts.
  const actual = await derive(password, valid ? parts[1] : "0".repeat(32));
  const expected = Buffer.from(valid ? parts[2] : "0".repeat(128), "hex");
  return timingSafeEqual(actual, expected) && Boolean(valid);
}
