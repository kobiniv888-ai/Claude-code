/**
 * FE-1 (SECURITY_REPORT 2.4.h, 12.2.b): a codespace made before the development-key mark existed
 * keeps unmarked BETTER_AUTH_SECRET / APP_ENCRYPTION_KEY / HASH_SALT / CRON_SECRET in .env.
 * .devcontainer/env-sync.sh (sync_env, run on every start) must replace them with marked values,
 * leave Codespaces secrets and already marked values alone, and never print a value.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isMarkedDevKey } from "@/lib/dev-keys";

const SCRIPT = path.resolve(__dirname, "../../.devcontainer/env-sync.sh");
const NAMES = ["BETTER_AUTH_SECRET", "APP_ENCRYPTION_KEY", "HASH_SALT", "CRON_SECRET"] as const;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function readEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}

function runSync(envFile: string, extraEnv: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "/tmp", ...extraEnv };
  return spawnSync("bash", ["-c", `source "${SCRIPT}"; sync_env`], { cwd: path.dirname(envFile), env, encoding: "utf8" });
}

function makeEnv(content: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "bayit-env-sync-"));
  dirs.push(dir);
  const file = path.join(dir, ".env");
  writeFileSync(file, content);
  return file;
}

describe("env-sync re-marks old development secrets", () => {
  it("replaces every unmarked codespace secret with a marked one and prints only names", () => {
    const old = {
      BETTER_AUTH_SECRET: "oldAuthSecretValueAAAAAAAAAAAAAAAAAAAAAAAAA=",
      APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      HASH_SALT: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      CRON_SECRET: "old-cron-secret-value",
    };
    const file = makeEnv(
      `SITE_ENV="development"\n${Object.entries(old).map(([k, v]) => `${k}="${v}"`).join("\n")}\nOTHER="keep-me"\n`,
    );
    const result = runSync(file);
    expect(result.status, result.stderr).toBe(0);
    const after = readEnv(file);
    for (const name of NAMES) {
      expect(isMarkedDevKey(after[name]), name).toBe(true);
      expect(result.stdout).toContain(name);
      expect(result.stdout).not.toContain(old[name]);
      expect(result.stdout).not.toContain(after[name]);
      expect(result.stderr).not.toContain(old[name]);
    }
    expect(Buffer.from(after.APP_ENCRYPTION_KEY, "base64")).toHaveLength(32);
    expect(after.OTHER).toBe("keep-me");
    expect(isMarkedDevKey(after.FIELD_ENCRYPTION_KEY)).toBe(true);

    // Idempotent: a second start changes nothing.
    const again = runSync(file);
    expect(again.status).toBe(0);
    expect(readEnv(file)).toEqual(after);
    for (const name of NAMES) expect(again.stdout).not.toContain(name);
  });

  it("leaves marked values, empty values and Codespaces secrets alone", () => {
    const marked = "bayit-dev-alreadyMarked";
    const file = makeEnv(`SITE_ENV="development"\nBETTER_AUTH_SECRET="${marked}"\nCRON_SECRET=""\nHASH_SALT="unmarked-but-secret"\n`);
    const result = runSync(file, { HASH_SALT: "from-codespaces-secret" });
    expect(result.status, result.stderr).toBe(0);
    const after = readEnv(file);
    expect(after.BETTER_AUTH_SECRET).toBe(marked);
    expect(after.CRON_SECRET).toBe("");
    expect(after.HASH_SALT).toBe("unmarked-but-secret");
    expect(result.stdout).not.toContain("HASH_SALT");
  });
});
