import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const devLock = new URL("../.vinext/dev/lock.json", import.meta.url);

try {
  const lock = JSON.parse(await readFile(devLock, "utf8"));
  if (Number.isInteger(lock.pid)) {
    try {
      process.kill(lock.pid, 0);
    } catch (error) {
      if (error?.code === "ESRCH") await rm(devLock, { force: true });
    }
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

process.argv = [
  process.execPath,
  fileURLToPath(new URL("./run-framework.mjs", import.meta.url)),
  "dev",
  "--hostname",
  "0.0.0.0",
];

await import("./run-framework.mjs");
