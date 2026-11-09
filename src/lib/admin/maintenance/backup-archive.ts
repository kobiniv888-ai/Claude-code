/**
 * One backup folder (./backup-format.ts) as ONE stream, for the off-site copy (SECURITY_REPORT
 * 12.4.b): the folder's files one after the other, then encrypted (./backup-crypto.ts). No library:
 * a tiny format of our own, read back by unpackBackupArchive.
 *
 *   magic   8 bytes  "BAYITARC"
 *   version 1 byte   1
 *   then per file:  type 1 byte (1 = file) · name length 2 bytes · name (UTF-8) · size 8 bytes · bytes
 *   end:            type 1 byte (0)
 *
 * Only the names a backup folder has are allowed (metadata.json, schema.prisma, database.dump,
 * tables/<Table>.jsonl): a crafted archive cannot write anywhere else. metadata.json comes first.
 *
 * Pure node (no "@/" imports): scripts and tests import it.
 */
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

export const ARCHIVE_MAGIC = "BAYITARC";
export const ARCHIVE_VERSION = 1;
const TYPE_END = 0;
const TYPE_FILE = 1;
/** No single file of a backup comes near this (a sanity bound against a corrupt size field). */
const MAX_FILE_BYTES = 64 * 1024 ** 3;

const NAME_PATTERN = /^(?:metadata\.json|schema\.prisma|database\.dump|tables\/[A-Za-z_][A-Za-z0-9_]{0,62}\.jsonl)$/;

/** The files a backup folder may hold (the only names an archive may carry). */
export function isArchiveEntryName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

export class BackupArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupArchiveError";
  }
}

/** The folder's files in archive order: metadata.json first, then the rest sorted. */
export async function backupFolderEntries(dir: string): Promise<string[]> {
  const names: string[] = [];
  for (const name of await fs.readdir(dir)) {
    if (name === "tables") {
      for (const table of (await fs.readdir(path.join(dir, "tables"))).sort()) names.push(`tables/${table}`);
    } else names.push(name);
  }
  const unknown = names.filter((name) => !isArchiveEntryName(name));
  if (unknown.length) throw new BackupArchiveError(`Unexpected files in the backup folder: ${unknown.join(", ")}`);
  if (!names.includes("metadata.json")) throw new BackupArchiveError("The backup folder has no metadata.json (not complete).");
  return ["metadata.json", ...names.filter((n) => n !== "metadata.json").sort()];
}

function entryHeader(name: string, size: number): Buffer {
  const nameBytes = Buffer.from(name, "utf8");
  const out = Buffer.alloc(1 + 2 + nameBytes.length + 8);
  out.writeUInt8(TYPE_FILE, 0);
  out.writeUInt16BE(nameBytes.length, 1);
  nameBytes.copy(out, 3);
  out.writeBigUInt64BE(BigInt(size), 3 + nameBytes.length);
  return out;
}

/** The archive of a complete backup folder, as a stream of buffers. */
export async function* packBackupFolder(dir: string): AsyncGenerator<Buffer> {
  const entries = await backupFolderEntries(dir);
  const start = Buffer.alloc(ARCHIVE_MAGIC.length + 1);
  start.write(ARCHIVE_MAGIC, 0, "ascii");
  start.writeUInt8(ARCHIVE_VERSION, ARCHIVE_MAGIC.length);
  yield start;
  for (const name of entries) {
    const file = path.join(dir, ...name.split("/"));
    const { size } = await fs.stat(file);
    yield entryHeader(name, size);
    let read = 0;
    for await (const chunk of createReadStream(file)) {
      read += (chunk as Buffer).length;
      yield chunk as Buffer;
    }
    if (read !== size) throw new BackupArchiveError(`${name} changed while it was being packed.`);
  }
  yield Buffer.from([TYPE_END]);
}

/** Reads exact byte counts from an async stream of buffers. */
class ByteReader {
  private buffer: Buffer = Buffer.alloc(0);
  private done = false;
  constructor(private readonly source: AsyncIterator<Buffer | Uint8Array | string>) {}

  private async fill(min: number): Promise<boolean> {
    while (this.buffer.length < min && !this.done) {
      const next = await this.source.next();
      if (next.done) this.done = true;
      else {
        const chunk = typeof next.value === "string" ? Buffer.from(next.value) : Buffer.from(next.value);
        this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
      }
    }
    return this.buffer.length >= min;
  }

  async read(size: number): Promise<Buffer> {
    if (!(await this.fill(size))) throw new BackupArchiveError("The backup archive is cut short.");
    const out = this.buffer.subarray(0, size);
    this.buffer = this.buffer.subarray(size);
    return out;
  }

  /** Up to `max` bytes (at least one), for copying file bodies. */
  async readSome(max: number): Promise<Buffer> {
    if (!(await this.fill(1))) throw new BackupArchiveError("The backup archive is cut short.");
    const out = this.buffer.subarray(0, Math.min(max, this.buffer.length));
    this.buffer = this.buffer.subarray(out.length);
    return out;
  }

  async atEnd(): Promise<boolean> {
    return !(await this.fill(1));
  }
}

/**
 * Unpacks an archive stream into `dir` (created, readable by this user only). Returns the file
 * names written. Refuses names a backup folder does not have, duplicates, and anything after the end.
 */
export async function unpackBackupArchive(source: AsyncIterable<Buffer | Uint8Array | string>, dir: string): Promise<string[]> {
  const reader = new ByteReader(source[Symbol.asyncIterator]());
  const start = await reader.read(ARCHIVE_MAGIC.length + 1);
  if (start.subarray(0, ARCHIVE_MAGIC.length).toString("latin1") !== ARCHIVE_MAGIC) {
    throw new BackupArchiveError("This is not a Bayit backup archive.");
  }
  if (start.readUInt8(ARCHIVE_MAGIC.length) !== ARCHIVE_VERSION) throw new BackupArchiveError("Unsupported backup archive version.");
  await fs.mkdir(path.join(dir, "tables"), { recursive: true, mode: 0o700 });
  const written: string[] = [];
  for (;;) {
    const type = (await reader.read(1)).readUInt8(0);
    if (type === TYPE_END) break;
    if (type !== TYPE_FILE) throw new BackupArchiveError("The backup archive is damaged (unknown entry).");
    const nameLength = (await reader.read(2)).readUInt16BE(0);
    const name = (await reader.read(nameLength)).toString("utf8");
    if (!isArchiveEntryName(name)) throw new BackupArchiveError(`The backup archive holds an unexpected file name: ${JSON.stringify(name.slice(0, 80))}`);
    if (written.includes(name)) throw new BackupArchiveError(`The backup archive holds ${name} twice.`);
    const size = Number((await reader.read(8)).readBigUInt64BE(0));
    if (!Number.isSafeInteger(size) || size > MAX_FILE_BYTES) throw new BackupArchiveError("The backup archive is damaged (file size).");
    const target = path.join(dir, ...name.split("/"));
    let left = size;
    async function* body() {
      while (left > 0) {
        const piece = await reader.readSome(Math.min(left, 1024 * 1024));
        left -= piece.length;
        yield piece;
      }
    }
    await pipeline(body(), createWriteStream(target, { flags: "wx", mode: 0o600 }));
    written.push(name);
  }
  if (!(await reader.atEnd())) throw new BackupArchiveError("The backup archive has extra bytes after its end.");
  if (!written.includes("metadata.json")) throw new BackupArchiveError("The backup archive has no metadata.json.");
  return written;
}
