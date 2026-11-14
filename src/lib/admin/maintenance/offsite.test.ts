/**
 * The weekly encrypted off-site backup (SECURITY_REPORT 12.4.b): the encryption (round trip, wrong
 * key, a file cut short or changed), the archive, and the whole job against a FAKE S3 server
 * (node:http on 127.0.0.1) that records every request: Object Lock headers, Content-MD5, no
 * delete ever, the verify step's download.
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const recorded = vi.hoisted(() => ({ events: [] as { type: string; meta?: unknown }[], audits: [] as { action: string }[] }));
vi.mock("@/lib/security/events", () => ({
  recordSecurityEvent: async (event: { type: string; meta?: unknown }) => {
    recorded.events.push(event);
    return true;
  },
}));
vi.mock("@/lib/audit", () => ({
  audit: async (entry: { action: string }) => {
    recorded.audits.push(entry);
  },
}));

import { isArchiveEntryName, packBackupFolder, unpackBackupArchive } from "./backup-archive";
import {
  BackupCryptoError,
  backupKeyId,
  createBackupDecryptStream,
  createBackupEncryptStream,
  parseBackupKey,
  readBackupHeader,
} from "./backup-crypto";
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, isDevelopmentRestoreTarget, type BackupMeta } from "./backup-format";
import { offsiteConfigProblems, readOffsiteConfig, retainUntil, type OffsiteConfig } from "./offsite-config";
import { decryptBackupInto, encryptBackupFolder, offsiteS3Client, runAndRecordOffsiteBackup, runOffsiteBackup } from "./offsite";

const KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 9);

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const chunk of stream) parts.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(parts);
}

async function encrypt(plain: Buffer, key = KEY, chunkSize = 16): Promise<Buffer> {
  // Fed in odd-sized pieces, as a real stream would be.
  const pieces: Buffer[] = [];
  for (let i = 0; i < plain.length; i += 7) pieces.push(plain.subarray(i, i + 7));
  return collect(Readable.from(pieces).pipe(createBackupEncryptStream(key, { chunkSize })));
}

async function decrypt(file: Buffer, key = KEY): Promise<Buffer> {
  const pieces: Buffer[] = [];
  for (let i = 0; i < file.length; i += 5) pieces.push(file.subarray(i, i + 5));
  const out: Buffer[] = [];
  await pipeline(Readable.from(pieces), createBackupDecryptStream(key), async function* (source) {
    for await (const chunk of source) out.push(Buffer.from(chunk as Buffer));
  });
  return Buffer.concat(out);
}

async function decryptError(file: Buffer, key = KEY): Promise<BackupCryptoError> {
  try {
    await decrypt(file, key);
  } catch (error) {
    return error as BackupCryptoError;
  }
  throw new Error("decrypted without an error");
}

describe("backup encryption (AES-256-GCM, chunked)", () => {
  it("round-trips any length, including empty and exact chunk multiples", async () => {
    for (const size of [0, 1, 15, 16, 17, 32, 100, 1000]) {
      const plain = randomBytes(size);
      const file = await encrypt(plain);
      expect(file.subarray(0, 8).toString("ascii")).toBe("BAYITENC");
      expect(await decrypt(file)).toEqual(plain);
    }
  });

  it("writes a header with the version and the key id, never the key", async () => {
    const file = await encrypt(Buffer.from("hello"));
    const header = readBackupHeader(file)!;
    expect(header.version).toBe(1);
    expect(header.keyId).toBe(backupKeyId(KEY));
    expect(header.keyId).toMatch(/^[0-9a-f]{16}$/);
    expect(file.includes(KEY)).toBe(false);
    // Two files of the same data differ (random salt and nonce).
    expect((await encrypt(Buffer.from("hello"))).equals(file)).toBe(false);
  });

  it("refuses another key with a clear message naming both key ids", async () => {
    const file = await encrypt(Buffer.from("secret rows"));
    const error = await decryptError(file, OTHER_KEY);
    expect(error).toBeInstanceOf(BackupCryptoError);
    expect(error.code).toBe("wrong_key");
    expect(error.message).toContain(backupKeyId(KEY));
    expect(error.message).toContain(backupKeyId(OTHER_KEY));
  });

  it("refuses a file cut short (inside a chunk, at a chunk boundary, inside the header)", async () => {
    const file = await encrypt(randomBytes(100));
    const header = readBackupHeader(file)!.bytes.length;
    for (const cut of [file.length - 1, file.length - 20, header + 32, header + 33, header, 30, 0]) {
      const error = await decryptError(file.subarray(0, cut));
      expect(error, `cut at ${cut}`).toBeInstanceOf(BackupCryptoError);
      expect(["truncated", "damaged"]).toContain(error.code);
    }
  });

  it("refuses a changed byte, a changed header and bytes added at the end", async () => {
    const file = await encrypt(randomBytes(100));
    const header = readBackupHeader(file)!.bytes.length;
    const flipped = Buffer.from(file);
    flipped[header + 3] ^= 1;
    expect((await decryptError(flipped)).code).toBe("damaged");
    const headerChanged = Buffer.from(file);
    headerChanged[header - 1] ^= 1; // the nonce prefix: authenticated as additional data
    expect(["damaged", "truncated"]).toContain((await decryptError(headerChanged)).code);
    expect(["damaged", "truncated"]).toContain((await decryptError(Buffer.concat([file, Buffer.from("x")]))).code);
  });

  it("refuses chunks in another order, or one left out (each chunk's number is in its nonce)", async () => {
    const file = await encrypt(randomBytes(100)); // 16-byte chunks: six full ones and a short last one
    const header = readBackupHeader(file)!.bytes.length;
    const sealed = 16 + 16;
    const chunk = (i: number) => file.subarray(header + i * sealed, header + (i + 1) * sealed);
    const rest = file.subarray(header + 2 * sealed);
    const swapped = Buffer.concat([file.subarray(0, header), chunk(1), chunk(0), rest]);
    expect((await decryptError(swapped)).code).toBe("damaged");
    const dropped = Buffer.concat([file.subarray(0, header), chunk(1), rest]);
    expect((await decryptError(dropped)).code).toBe("damaged");
  });

  it("refuses files that are not backups, and keys that are not 32 bytes", async () => {
    expect((await decryptError(Buffer.from("PK\u0003\u0004 not ours at all"))).code).toBe("not_a_backup");
    expect(() => parseBackupKey("")).toThrow(/not set/);
    expect(() => parseBackupKey(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
    expect(parseBackupKey(KEY.toString("base64"))).toEqual(KEY);
  });
});

// ── A backup folder on disk (the real format's file names) ─────────────────

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bayit-offsite-test-"));
  dirs.push(dir);
  return dir;
}
afterAll(async () => {
  for (const dir of dirs) await fs.rm(dir, { recursive: true, force: true });
});

const BACKUP_ID = "2026-11-08T02-53-10Z-a1b2";

async function fakeBackup(root: string): Promise<BackupMeta> {
  const dir = path.join(root, BACKUP_ID);
  await fs.mkdir(path.join(dir, "tables"), { recursive: true });
  const rows = Array.from({ length: 50 }, (_, i) => JSON.stringify({ id: `u${i}`, name: `Test user ${i}` })).join("\n") + "\n";
  await fs.writeFile(path.join(dir, "tables", "User.jsonl"), rows);
  await fs.writeFile(path.join(dir, "tables", "Listing.jsonl"), "");
  await fs.writeFile(path.join(dir, "schema.prisma"), "// schema\n");
  const meta: BackupMeta = {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    id: BACKUP_ID,
    createdAt: "2026-11-08T02:53:10.000Z",
    createdBy: { userId: null, via: "cli" },
    database: { name: "bayit_test", server: "16" },
    schemaSha256: null,
    tables: [
      { name: "Listing", rows: 0, bytes: 0, sha256: createHash("sha256").digest("hex"), columns: ["id"] },
      { name: "User", rows: 50, bytes: rows.length, sha256: createHash("sha256").update(rows).digest("hex"), columns: ["id", "name"] },
    ],
    totalRows: 50,
    totalBytes: rows.length,
    pgDump: null,
    complete: true,
  };
  await fs.writeFile(path.join(dir, "metadata.json"), JSON.stringify(meta));
  return meta;
}

async function filesOf(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of await fs.readdir(dir, { recursive: true })) {
    const full = path.join(dir, name);
    if ((await fs.stat(full)).isFile()) out[name.split(path.sep).join("/")] = await fs.readFile(full, "utf8");
  }
  return out;
}

describe("backup archive", () => {
  it("packs a backup folder and unpacks the same files", async () => {
    const root = await tempDir();
    await fakeBackup(root);
    const out = path.join(await tempDir(), "restored");
    const written = await unpackBackupArchive(packBackupFolder(path.join(root, BACKUP_ID)), out);
    expect(written[0]).toBe("metadata.json");
    expect(await filesOf(out)).toEqual(await filesOf(path.join(root, BACKUP_ID)));
  });

  it("only allows a backup folder's own file names (no path tricks)", async () => {
    expect(isArchiveEntryName("tables/User.jsonl")).toBe(true);
    for (const bad of ["../x", "tables/../../etc/passwd", "/etc/passwd", "tables/a b.jsonl", "x.json", "tables/User.jsonl/.."]) {
      expect(isArchiveEntryName(bad), bad).toBe(false);
    }
    const name = Buffer.from("../evil.jsonl");
    const size = Buffer.alloc(8);
    const crafted = Buffer.concat([Buffer.from("BAYITARC\u0001", "latin1"), Buffer.from([1, 0, name.length]), name, size, Buffer.from([0])]);
    await expect(unpackBackupArchive(Readable.from([crafted]), path.join(await tempDir(), "x"))).rejects.toThrow(/unexpected file name/);
  });
});

// ── The job against a fake S3 server ───────────────────────────────────────

type SeenRequest = { method: string; url: string; headers: http.IncomingHttpHeaders; body: Buffer };
const fake = { requests: [] as SeenRequest[], objects: new Map<string, { body: Buffer; headers: http.IncomingHttpHeaders }>(), corrupt: false, dropLock: false };
let server: http.Server;
let endpoint = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url ?? "/", "http://fake");
      fake.requests.push({ method: req.method ?? "", url: url.pathname, headers: req.headers, body });
      const stored = fake.objects.get(url.pathname);
      if (req.method === "PUT") {
        const md5 = createHash("md5").update(body).digest("base64");
        if (req.headers["content-md5"] !== md5) {
          res.writeHead(400).end("<Error><Code>BadDigest</Code></Error>");
          return;
        }
        fake.objects.set(url.pathname, { body, headers: req.headers });
        res.writeHead(200, { ETag: '"etag"' }).end();
        return;
      }
      if (!stored) {
        res.writeHead(404).end("<Error><Code>NoSuchKey</Code></Error>");
        return;
      }
      const lock = fake.dropLock
        ? {}
        : {
            "x-amz-object-lock-mode": String(stored.headers["x-amz-object-lock-mode"]),
            "x-amz-object-lock-retain-until-date": String(stored.headers["x-amz-object-lock-retain-until-date"]),
          };
      const data = fake.corrupt ? Buffer.concat([stored.body.subarray(0, stored.body.length - 1), Buffer.from([stored.body[stored.body.length - 1]! ^ 1])]) : stored.body;
      res.writeHead(200, { "Content-Length": String(data.length), "Content-Type": "application/octet-stream", ...lock });
      res.end(req.method === "HEAD" ? undefined : data);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
afterEach(() => {
  fake.requests = [];
  fake.objects.clear();
  fake.corrupt = false;
  fake.dropLock = false;
  recorded.events = [];
  recorded.audits = [];
});

function config(): OffsiteConfig {
  return {
    endpoint,
    region: "eu-central-003",
    bucket: "bayit-offsite",
    accessKeyId: "test-key-id",
    secretAccessKey: "test-secret",
    retentionDays: 60,
    prefix: "bayit/development/",
  };
}
const NOW = new Date("2026-11-08T02:53:10.500Z");

function deps() {
  const c = config();
  return { config: c, key: KEY, client: offsiteS3Client(c), makeBackup: fakeBackup, now: () => NOW, chunkSize: 64 };
}

describe("the off-site job (fake S3)", () => {
  it("uploads one encrypted object with Object Lock COMPLIANCE for 60 days and Content-MD5, then reads it back", async () => {
    const result = await runOffsiteBackup(deps());
    const puts = fake.requests.filter((r) => r.method === "PUT");
    expect(puts).toHaveLength(1);
    const put = puts[0]!;
    expect(put.url).toBe(`/bayit-offsite/bayit/development/${BACKUP_ID}.bkenc`);
    expect(put.headers["x-amz-object-lock-mode"]).toBe("COMPLIANCE");
    expect(new Date(String(put.headers["x-amz-object-lock-retain-until-date"])).toISOString()).toBe(retainUntil(NOW, 60).toISOString());
    expect(new Date(String(put.headers["x-amz-object-lock-retain-until-date"])).getTime() - NOW.getTime()).toBeGreaterThan(59.9 * 24 * 3600 * 1000);
    expect(put.headers["content-md5"]).toBe(createHash("md5").update(put.body).digest("base64"));
    expect(put.headers["x-amz-meta-bayit-key-id"]).toBe(backupKeyId(KEY));
    expect(put.headers["x-amz-meta-bayit-sha256"]).toBe(createHash("sha256").update(put.body).digest("hex"));
    expect(String(put.headers.authorization)).toContain("Credential=test-key-id/");
    // Only ciphertext leaves the server.
    expect(put.body.subarray(0, 8).toString("ascii")).toBe("BAYITENC");
    expect(put.body.includes(Buffer.from("Test user"))).toBe(false);
    // The verify step: HEAD (size + lock) and a full download.
    expect(fake.requests.map((r) => r.method)).toEqual(["PUT", "HEAD", "GET"]);
    // The job never deletes (its key needs no delete right).
    expect(fake.requests.some((r) => r.method === "DELETE" || r.url.includes("delete"))).toBe(false);
    expect(result).toMatchObject({ key: `bayit/development/${BACKUP_ID}.bkenc`, backupId: BACKUP_ID, bytes: put.body.length, keyId: backupKeyId(KEY), tables: 2, rows: 50 });
  });

  it("the stored copy decrypts to exactly the backup folder", async () => {
    await runOffsiteBackup(deps());
    const stored = [...fake.objects.values()][0]!.body;
    const out = path.join(await tempDir(), "restored");
    await decryptBackupInto(Readable.from([stored]), out, KEY);
    const original = path.join(await tempDir(), "original");
    await fakeBackup(original);
    expect(await filesOf(out)).toEqual(await filesOf(path.join(original, BACKUP_ID)));
    await expect(decryptBackupInto(Readable.from([stored]), path.join(await tempDir(), "other"), OTHER_KEY)).rejects.toMatchObject({ code: "wrong_key" });
  });

  it("fails the verify step when the stored copy differs or is not locked", async () => {
    fake.corrupt = true;
    await expect(runOffsiteBackup(deps())).rejects.toMatchObject({ name: "OffsiteBackupError", step: "verify" });
    fake.corrupt = false;
    fake.dropLock = true;
    await expect(runOffsiteBackup(deps())).rejects.toMatchObject({ step: "verify", message: expect.stringMatching(/COMPLIANCE/) });
  });

  it("records success and failure (audit + security event, no error text)", async () => {
    await runAndRecordOffsiteBackup("cron", deps());
    expect(recorded.audits.map((a) => a.action)).toEqual(["maintenance.offsite_backup"]);
    expect(recorded.events.map((e) => e.type)).toEqual(["offsite_backup_ok"]);
    recorded.events = [];
    const broken = { ...deps(), config: { ...config(), bucket: "missing-bucket" }, client: offsiteS3Client({ ...config(), endpoint: "http://127.0.0.1:1" }) };
    await expect(runAndRecordOffsiteBackup("cron", broken)).rejects.toMatchObject({ step: "upload" });
    expect(recorded.events).toEqual([{ type: "offsite_backup_failed", ip: null, meta: { via: "cron", step: "upload", reason: expect.stringMatching(/^[A-Za-z0-9_]+$/) } }]);
  });

  it("deletes its temporary files", async () => {
    const before = (await fs.readdir(os.tmpdir())).filter((n) => n.startsWith("bayit-offsite-") && !n.startsWith("bayit-offsite-test-"));
    await runOffsiteBackup(deps());
    const after = (await fs.readdir(os.tmpdir())).filter((n) => n.startsWith("bayit-offsite-") && !n.startsWith("bayit-offsite-test-"));
    expect(after).toEqual(before);
  });

  it("encrypts a folder to a file whose hash matches what is uploaded", async () => {
    const root = await tempDir();
    await fakeBackup(root);
    const file = path.join(root, "x.bkenc");
    const sums = await encryptBackupFolder(path.join(root, BACKUP_ID), file, KEY);
    const bytes = await fs.readFile(file);
    expect(sums.bytes).toBe(bytes.length);
    expect(sums.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
});

describe("off-site settings", () => {
  const full = {
    SITE_ENV: "production",
    BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    OFFSITE_S3_ENDPOINT: "https://s3.eu-central-003.backblazeb2.com",
    OFFSITE_S3_REGION: "eu-central-003",
    OFFSITE_S3_BUCKET: "bayit-offsite",
    OFFSITE_S3_ACCESS_KEY_ID: "003abc",
    OFFSITE_S3_SECRET_ACCESS_KEY: "K003secret",
    S3_ENDPOINT: "https://example-account.r2.cloudflarestorage.com",
    S3_ACCESS_KEY_ID: "r2key",
  };

  it("reads a complete set (60 days by default)", () => {
    expect(offsiteConfigProblems(full)).toEqual([]);
    expect(readOffsiteConfig(full)).toMatchObject({ bucket: "bayit-offsite", retentionDays: 60, prefix: "bayit/production/" });
  });

  it("refuses a half-filled set, http, a bad key, the photo storage's key or provider", () => {
    expect(readOffsiteConfig({ ...full, OFFSITE_S3_BUCKET: "" })).toBeNull();
    expect(offsiteConfigProblems({ ...full, OFFSITE_S3_ENDPOINT: "http://s3.example" }).join()).toMatch(/https/);
    expect(offsiteConfigProblems({ ...full, BACKUP_ENCRYPTION_KEY: "short" }).join()).toMatch(/32 bytes/);
    expect(offsiteConfigProblems({ ...full, OFFSITE_S3_ACCESS_KEY_ID: "r2key" }).join()).toMatch(/own account/);
    expect(offsiteConfigProblems({ ...full, OFFSITE_S3_ENDPOINT: full.S3_ENDPOINT }).join()).toMatch(/another provider/);
    expect(offsiteConfigProblems({ ...full, APP_ENCRYPTION_KEY: full.BACKUP_ENCRYPTION_KEY }).join()).toMatch(/its own key/);
    expect(offsiteConfigProblems({ ...full, OFFSITE_RETENTION_DAYS: "3" }).join()).toMatch(/OFFSITE_RETENTION_DAYS/);
  });
});

describe("restoring real data into development is refused (2.4.j)", () => {
  it("a local database or any target from a codespace counts as development", () => {
    expect(isDevelopmentRestoreTarget("postgresql://bayit:bayit@localhost:5432/x")).toBe(true);
    expect(isDevelopmentRestoreTarget("postgresql://u:p@127.0.0.1/x")).toBe(true);
    expect(isDevelopmentRestoreTarget("postgresql://u:p@ep-cool-1.eu-central-1.aws.neon.tech/x?sslmode=require")).toBe(false);
    expect(isDevelopmentRestoreTarget("postgresql://u:p@ep-cool-1.eu-central-1.aws.neon.tech/x", { CODESPACES: "true" })).toBe(true);
  });
});
