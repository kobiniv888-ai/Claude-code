import "server-only";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { audit } from "@/lib/audit";
import { recordSecurityEvent } from "@/lib/security/events";
import { packBackupFolder, unpackBackupArchive } from "./backup-archive";
import { backupKeyId, createBackupDecryptStream, createBackupEncryptStream, parseBackupKey } from "./backup-crypto";
import type { BackupMeta } from "./backup-format";
import { offsiteObjectKey, readOffsiteConfig, retainUntil, type OffsiteConfig } from "./offsite-config";

/**
 * The weekly encrypted off-site backup (SECURITY_REPORT 12.4.b; founder's choice: Backblaze B2 in
 * the EU, its own account, a bucket with Object Lock). Run by /api/cron/offsite-backup (Sundays,
 * vercel.json) and `npm run backup:offsite`.
 *
 * 1. A full backup in the usual format (./backup.ts) into a temporary folder.
 * 2. Packed into one archive (./backup-archive.ts) and encrypted on the fly with
 *    BACKUP_ENCRYPTION_KEY (./backup-crypto.ts) into a temporary file: SHA-256 and MD5 of it on the way.
 * 3. Uploaded with the same S3 client library as the photo storage (src/lib/storage/s3.ts) but its
 *    OWN credentials (OFFSITE_S3_*, ./offsite-config.ts), with Object Lock: mode COMPLIANCE, kept
 *    until now + OFFSITE_RETENTION_DAYS (60). The job never deletes, so its key needs no delete
 *    right; old copies leave by the bucket's lifecycle rule once their lock has ended.
 * 4. Verified: the stored size and lock are read back, the object is downloaded again and its
 *    SHA-256 compared, and every chunk is decrypted (so the copy is known to be readable).
 * 5. The temporary files are deleted; the audit log and the security event log say how it went
 *    (a failure alerts the founder: src/lib/security/alerts.ts).
 */

export type OffsiteResult = {
  key: string;
  backupId: string;
  bytes: number;
  sha256: string;
  keyId: string;
  retainUntil: string;
  tables: number;
  rows: number;
};

export type OffsiteDeps = {
  config?: OffsiteConfig;
  /** The 32-byte backup key (default: BACKUP_ENCRYPTION_KEY). */
  key?: Buffer;
  client?: S3Client;
  /** Makes the backup folder inside `root` (default: createBackup from ./backup.ts). */
  makeBackup?: (root: string) => Promise<BackupMeta>;
  now?: () => Date;
  /** Chunk size of the encryption (tests). */
  chunkSize?: number;
};

export class OffsiteBackupError extends Error {
  constructor(
    /** Which step failed: config, backup, encrypt, upload, verify. */
    readonly step: "config" | "backup" | "encrypt" | "upload" | "verify",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "OffsiteBackupError";
  }
}

/** The S3 client for the off-site bucket (path-style; checksums only where the API needs them: B2 takes Content-MD5). */
export function offsiteS3Client(config: OffsiteConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

/** The settings from the environment, or a clear error (the startup check refuses a half-filled set on the real site). */
export function requireOffsiteConfig(env: NodeJS.ProcessEnv = process.env): OffsiteConfig {
  const config = readOffsiteConfig(env);
  if (!config) throw new OffsiteBackupError("config", "The off-site backup is not set up: see docs/BACKUPS.md (OFFSITE_S3_* and BACKUP_ENCRYPTION_KEY).");
  return config;
}

/** A pass-through that hashes what flows (SHA-256 and MD5) and counts the bytes. */
function hasher(): Transform & { result: () => { sha256: string; md5: string; bytes: number } } {
  const sha = createHash("sha256");
  const md5 = createHash("md5");
  let bytes = 0;
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      sha.update(chunk);
      md5.update(chunk);
      bytes += chunk.length;
      callback(null, chunk);
    },
  }) as Transform & { result: () => { sha256: string; md5: string; bytes: number } };
  stream.result = () => ({ sha256: sha.digest("hex"), md5: md5.digest("base64"), bytes });
  return stream;
}

/** Encrypts a complete backup folder into `file`. */
export async function encryptBackupFolder(
  dir: string,
  file: string,
  key: Buffer,
  chunkSize?: number,
): Promise<{ sha256: string; md5: string; bytes: number }> {
  const hash = hasher();
  await pipeline(Readable.from(packBackupFolder(dir)), createBackupEncryptStream(key, { chunkSize }), hash, createWriteStream(file, { flags: "wx", mode: 0o600 }));
  return hash.result();
}

/** Decrypts an encrypted backup (a stream of its bytes) into a backup folder `dir`. */
export async function decryptBackupInto(source: Readable, dir: string, key: Buffer): Promise<string[]> {
  const decrypt = createBackupDecryptStream(key);
  source.on("error", (error) => decrypt.destroy(error));
  return unpackBackupArchive(source.pipe(decrypt), dir);
}

function bodyStream(body: unknown): Readable {
  if (body instanceof Readable) return body;
  if (body && typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === "function") return Readable.from(body as AsyncIterable<Uint8Array>);
  throw new Error("The storage answered without a readable body.");
}

/**
 * Reads the stored copy back: size and lock (HEAD), then the bytes (GET) through SHA-256 and the
 * decryption (every chunk must check out). Throws OffsiteBackupError("verify") on any difference.
 */
export async function verifyOffsiteObject(
  client: S3Client,
  config: OffsiteConfig,
  objectKey: string,
  expected: { bytes: number; sha256: string; retainUntil: Date },
  key: Buffer,
): Promise<void> {
  const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }));
  if (head.ContentLength !== expected.bytes) {
    throw new OffsiteBackupError("verify", `The stored copy has ${head.ContentLength ?? "?"} bytes, ${expected.bytes} were sent.`);
  }
  if (head.ObjectLockMode !== "COMPLIANCE") {
    throw new OffsiteBackupError("verify", `The stored copy is not locked in COMPLIANCE mode (it says ${head.ObjectLockMode ?? "no lock"}): check the bucket's Object Lock.`);
  }
  const until = head.ObjectLockRetainUntilDate ? new Date(head.ObjectLockRetainUntilDate) : null;
  if (!until || until.getTime() < expected.retainUntil.getTime() - 24 * 3600 * 1000) {
    throw new OffsiteBackupError("verify", "The stored copy's lock ends earlier than asked.");
  }
  const got = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }));
  const hash = hasher();
  const decrypt = createBackupDecryptStream(key);
  const sink = new Writable({ write: (_chunk, _encoding, callback) => callback() });
  await pipeline(bodyStream(got.Body), hash, decrypt, sink);
  const { sha256, bytes } = hash.result();
  if (bytes !== expected.bytes || sha256 !== expected.sha256) {
    throw new OffsiteBackupError("verify", "The downloaded copy does not match what was uploaded (size or SHA-256).");
  }
}

async function defaultMakeBackup(root: string): Promise<BackupMeta> {
  const { createBackup } = await import("./backup");
  return createBackup({ userId: null, via: "cli" }, { root });
}

/** Makes, encrypts, uploads and verifies one off-site copy. Throws OffsiteBackupError (with the step). */
export async function runOffsiteBackup(deps: OffsiteDeps = {}): Promise<OffsiteResult> {
  const config = deps.config ?? requireOffsiteConfig();
  let key: Buffer;
  try {
    key = deps.key ?? parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY);
  } catch (error) {
    throw new OffsiteBackupError("config", (error as Error).message);
  }
  const client = deps.client ?? offsiteS3Client(config);
  const now = (deps.now ?? (() => new Date()))();
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "bayit-offsite-"));
  try {
    let meta: BackupMeta;
    try {
      meta = await (deps.makeBackup ?? defaultMakeBackup)(work);
    } catch (error) {
      throw new OffsiteBackupError("backup", "The backup could not be made.", { cause: error });
    }
    const file = path.join(work, `${meta.id}.bkenc`);
    let sums: { sha256: string; md5: string; bytes: number };
    try {
      sums = await encryptBackupFolder(path.join(work, meta.id), file, key, deps.chunkSize);
    } catch (error) {
      throw new OffsiteBackupError("encrypt", "The backup could not be encrypted.", { cause: error });
    }
    const objectKey = offsiteObjectKey(config, meta.id);
    const until = retainUntil(now, config.retentionDays);
    const keyId = backupKeyId(key);
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: objectKey,
          Body: createReadStream(file),
          ContentLength: sums.bytes,
          ContentMD5: sums.md5,
          ContentType: "application/octet-stream",
          ObjectLockMode: "COMPLIANCE",
          ObjectLockRetainUntilDate: until,
          // Not secret: which key and format, and the checksum to compare after a download.
          Metadata: { "bayit-format": "1", "bayit-key-id": keyId, "bayit-sha256": sums.sha256, "bayit-backup-id": meta.id },
        }),
      );
    } catch (error) {
      throw new OffsiteBackupError("upload", "The encrypted backup could not be uploaded.", { cause: error });
    }
    try {
      await verifyOffsiteObject(client, config, objectKey, { bytes: sums.bytes, sha256: sums.sha256, retainUntil: until }, key);
    } catch (error) {
      if (error instanceof OffsiteBackupError) throw error;
      throw new OffsiteBackupError("verify", "The uploaded copy could not be read back.", { cause: error });
    }
    return {
      key: objectKey,
      backupId: meta.id,
      bytes: sums.bytes,
      sha256: sums.sha256,
      keyId,
      retainUntil: until.toISOString(),
      tables: meta.tables.length,
      rows: meta.totalRows,
    };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** A short, non-personal reason for logs and events (never the storage's full error text, which can quote URLs). */
export function offsiteFailureReason(error: unknown): { step: string; reason: string } {
  const step = error instanceof OffsiteBackupError ? error.step : "unknown";
  const cause = error instanceof OffsiteBackupError ? (error.cause ?? error) : error;
  const name = (cause as { name?: string; Code?: string })?.Code ?? (cause as Error)?.name ?? "Error";
  return { step, reason: String(name).replace(/[^A-Za-z0-9_]/g, "").slice(0, 60) || "Error" };
}

/**
 * The cron/CLI wrapper: runs the job and records the outcome (audit log + security event). Returns
 * the result, or throws (after recording) so the cron answers 500 and Sentry hears of it.
 */
export async function runAndRecordOffsiteBackup(via: "cron" | "cli", deps: OffsiteDeps = {}): Promise<OffsiteResult> {
  try {
    const result = await runOffsiteBackup(deps);
    await audit({
      actorId: null,
      action: "maintenance.offsite_backup",
      targetType: "Backup",
      targetId: result.backupId,
      details: { via, key: result.key, bytes: result.bytes, keyId: result.keyId, retainUntil: result.retainUntil, tables: result.tables, rows: result.rows },
    });
    await recordSecurityEvent({ type: "offsite_backup_ok", ip: null, meta: { via, bytes: result.bytes, tables: result.tables } });
    return result;
  } catch (error) {
    const { step, reason } = offsiteFailureReason(error);
    await recordSecurityEvent({ type: "offsite_backup_failed", ip: null, meta: { via, step, reason } });
    throw error;
  }
}

export type OffsiteObject = { key: string; bytes: number; lastModified: string | null };

/** The stored copies, newest first (needs the key's listFiles right). */
export async function listOffsiteBackups(client: S3Client, config: OffsiteConfig, limit = 50): Promise<OffsiteObject[]> {
  const out: OffsiteObject[] = [];
  let token: string | undefined;
  do {
    const page: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({ Bucket: config.bucket, Prefix: config.prefix, ContinuationToken: token }),
    );
    for (const item of page.Contents ?? []) {
      if (item.Key?.endsWith(".bkenc")) out.push({ key: item.Key, bytes: item.Size ?? 0, lastModified: item.LastModified?.toISOString() ?? null });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  // The names start with the backup's time, so they sort by age.
  return out.sort((a, b) => (a.key < b.key ? 1 : -1)).slice(0, limit);
}

/** Downloads one stored copy to `file` (still encrypted). */
export async function downloadOffsiteBackup(client: S3Client, config: OffsiteConfig, objectKey: string, file: string): Promise<number> {
  if (!objectKey.startsWith(config.prefix) || !objectKey.endsWith(".bkenc") || objectKey.includes("..")) {
    throw new OffsiteBackupError("config", `Not an off-site backup name: ${objectKey}`);
  }
  const got = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }));
  const hash = hasher();
  await pipeline(bodyStream(got.Body), hash, createWriteStream(file, { flags: "wx", mode: 0o600 }));
  return hash.result().bytes;
}
