/**
 * FE-5: an encrypted off-site copy (.bkenc) is refused for a codespace or a local database BEFORE
 * it is decrypted: no "bayit-restore-*" folder (a plain copy of every table) ever appears in the
 * temp directory. Runs the real command with a fake .bkenc (random bytes) and a fake key.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { encryptedRestoreRefusal } from "@/lib/admin/maintenance/backup-format";

const ROOT = path.resolve(__dirname, "../..");

describe("encryptedRestoreRefusal", () => {
  it("refuses a local or codespace target, allows a database at the host", () => {
    expect(encryptedRestoreRefusal("postgresql://u:p@localhost:5432/x")).toMatch(/never into a codespace/);
    expect(encryptedRestoreRefusal("postgresql://u:p@ep-fake.eu-central-1.aws.neon.tech/x", { CODESPACE_NAME: "cs" })).not.toBeNull();
    expect(encryptedRestoreRefusal("postgresql://u:p@ep-fake.eu-central-1.aws.neon.tech/x", {})).toBeNull();
  });
});

describe("npm run db:restore with a .bkenc and a local target", () => {
  it("stops before decrypting anything", () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "fe5-test-"));
    const file = path.join(work, "copy.bkenc");
    fs.writeFileSync(file, randomBytes(256));
    const before = new Set(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("bayit-restore-")));
    try {
      const run = spawnSync("npx", ["tsx", "--require", "./scripts/server-script.cjs", "scripts/db-restore.ts", file], {
        cwd: ROOT,
        env: { ...process.env, RESTORE_TARGET_URL: "postgresql://u:p@localhost:5432/fe5_never", BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("base64") },
        encoding: "utf8",
        timeout: 60_000,
      });
      expect(run.status).toBe(1);
      expect(run.stderr + run.stdout).toMatch(/Nothing was downloaded or decrypted/);
      const after = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("bayit-restore-") && !before.has(n));
      expect(after).toEqual([]);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }, 90_000);
});
