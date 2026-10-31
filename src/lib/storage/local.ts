import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { assertValidStorageKey } from "./keys";

/**
 * Local-disk storage (development and single-server hosting).
 * Files live under ./storage/public and ./storage/private (STORAGE_LOCAL_DIR to change the root).
 * Public files are served by src/app/api/media/[...key]/route.ts; private files never are.
 */

export type Visibility = "public" | "private";

function root(): string {
  // Runtime data, not source: turbopackIgnore stops the build from tracing the whole project
  // into the server bundle because of these dynamic paths.
  return path.resolve(
    /* turbopackIgnore: true */ process.env.STORAGE_LOCAL_DIR?.trim() ||
      path.join(/* turbopackIgnore: true */ process.cwd(), "storage"),
  );
}

/** Absolute path for a key, guaranteed to stay inside the visibility folder. */
export function localPath(visibility: Visibility, key: string): string {
  assertValidStorageKey(key);
  const base = path.join(root(), visibility);
  const full = path.resolve(base, key);
  if (!full.startsWith(base + path.sep)) throw new Error("Storage key escapes the storage folder");
  return full;
}

export async function writeLocal(visibility: Visibility, key: string, body: Buffer): Promise<void> {
  const file = localPath(visibility, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Write to a temp file first so a crash never leaves a half-written file under the real name.
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, body);
  await fs.rename(temp, file);
}

/** File contents, or null when it does not exist. */
export async function readLocal(visibility: Visibility, key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(localPath(visibility, key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "EISDIR") {
      return null;
    }
    throw error;
  }
}

export async function deleteLocal(visibility: Visibility, key: string): Promise<void> {
  try {
    await fs.unlink(localPath(visibility, key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
