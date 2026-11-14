/**
 * Encryption of the off-site backup file (SECURITY_REPORT 12.4.b; founder's choice: Backblaze B2).
 * node:crypto only, streaming, so a backup of any size passes through in small pieces.
 *
 * The key: BACKUP_ENCRYPTION_KEY, 32 random bytes as base64 (`openssl rand -base64 32`). It is NOT
 * any other key of the site: the founder keeps a copy offline (a password manager and a printed
 * copy in a safe place), because without it no off-site backup can ever be read again.
 *
 * File layout ("BAYITENC" version 1), all integers big-endian:
 *
 *   magic        8 bytes   "BAYITENC"
 *   version      1 byte    1
 *   keyIdLength  1 byte    16
 *   keyId        16 bytes  ASCII hex: which key made the file (backupKeyId; not secret)
 *   chunkSize    4 bytes   plaintext bytes per chunk (64 KiB)
 *   salt         32 bytes  random: the file's own key = HKDF-SHA256(key, salt, "bayit-backup v1 file key")
 *   noncePrefix  7 bytes   random
 *   then chunks: AES-256-GCM(chunk) ‖ 16-byte tag, every chunk chunkSize bytes except the last
 *
 * Every chunk's nonce is noncePrefix ‖ chunk number (4 bytes) ‖ last-chunk flag (1 byte), and the
 * whole header is the additional data of every chunk (the "STREAM" construction): a changed header,
 * a reordered, dropped or changed chunk, a file cut short or with bytes added all fail to decrypt,
 * and nothing of a chunk is released before its tag checks out.
 *
 * Pure (no server or "@/" imports): scripts and tests import it.
 */
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes as cryptoRandomBytes } from "node:crypto";
import { Transform, type TransformCallback } from "node:stream";

export const BACKUP_FILE_MAGIC = "BAYITENC";
export const BACKUP_FILE_VERSION = 1;
export const BACKUP_CHUNK_SIZE = 64 * 1024;
const TAG_BYTES = 16;
const SALT_BYTES = 32;
const NONCE_PREFIX_BYTES = 7;
const KEY_ID_HEX = 16;
const MAX_CHUNK_SIZE = 16 * 1024 * 1024;
const FILE_KEY_INFO = "bayit-backup v1 file key";

/** Why a backup file could not be read. */
export type BackupCryptoErrorCode = "bad_key" | "not_a_backup" | "unsupported_version" | "wrong_key" | "damaged" | "truncated";

export class BackupCryptoError extends Error {
  constructor(
    readonly code: BackupCryptoErrorCode,
    message: string,
    readonly details: { fileKeyId?: string; keyId?: string } = {},
  ) {
    super(message);
    this.name = "BackupCryptoError";
  }
}

/** BACKUP_ENCRYPTION_KEY → the 32-byte key. Throws BackupCryptoError("bad_key") with a plain message. */
export function parseBackupKey(raw: string | undefined | null): Buffer {
  const text = raw?.trim() ?? "";
  if (!text) throw new BackupCryptoError("bad_key", "BACKUP_ENCRYPTION_KEY is not set (generate it with: openssl rand -base64 32).");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    throw new BackupCryptoError("bad_key", "BACKUP_ENCRYPTION_KEY must be base64 (generate it with: openssl rand -base64 32).");
  }
  const key = Buffer.from(text, "base64");
  if (key.length !== 32) throw new BackupCryptoError("bad_key", `BACKUP_ENCRYPTION_KEY must be 32 bytes, not ${key.length} (openssl rand -base64 32).`);
  return key;
}

/** A short, non-secret name for a key ("3f9c0a…", 16 hex characters): written into every file it makes. */
export function backupKeyId(key: Buffer): string {
  return createHash("sha256").update("bayit-backup-key-id:v1:").update(key).digest("hex").slice(0, KEY_ID_HEX);
}

export type BackupFileHeader = { version: number; keyId: string; chunkSize: number; salt: Buffer; noncePrefix: Buffer; bytes: Buffer };

function buildHeader(keyId: string, chunkSize: number, salt: Buffer, noncePrefix: Buffer): Buffer {
  const fixed = Buffer.alloc(BACKUP_FILE_MAGIC.length + 2);
  fixed.write(BACKUP_FILE_MAGIC, 0, "ascii");
  fixed.writeUInt8(BACKUP_FILE_VERSION, BACKUP_FILE_MAGIC.length);
  fixed.writeUInt8(keyId.length, BACKUP_FILE_MAGIC.length + 1);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(chunkSize, 0);
  return Buffer.concat([fixed, Buffer.from(keyId, "ascii"), size, salt, noncePrefix]);
}

/** The header length once its first 10 bytes are known (null while fewer are there). */
function headerLength(start: Buffer): number | null {
  if (start.length < BACKUP_FILE_MAGIC.length + 2) return null;
  return BACKUP_FILE_MAGIC.length + 2 + start.readUInt8(BACKUP_FILE_MAGIC.length + 1) + 4 + SALT_BYTES + NONCE_PREFIX_BYTES;
}

/**
 * Reads the header at the start of a file (at least its first ~70 bytes). Null when more bytes are
 * needed; throws BackupCryptoError for a file that is not a Bayit backup or of a newer version.
 */
export function readBackupHeader(start: Buffer): BackupFileHeader | null {
  const probe = start.subarray(0, Math.min(start.length, BACKUP_FILE_MAGIC.length));
  if (probe.toString("latin1") !== BACKUP_FILE_MAGIC.slice(0, probe.length)) {
    throw new BackupCryptoError("not_a_backup", "This is not an encrypted Bayit backup file.");
  }
  const length = headerLength(start);
  if (length === null || start.length < length) return null;
  const version = start.readUInt8(BACKUP_FILE_MAGIC.length);
  if (version !== BACKUP_FILE_VERSION) {
    throw new BackupCryptoError("unsupported_version", `This backup file is format version ${version}; this program reads version ${BACKUP_FILE_VERSION}.`);
  }
  let offset = BACKUP_FILE_MAGIC.length + 2;
  const keyIdLength = start.readUInt8(BACKUP_FILE_MAGIC.length + 1);
  const keyId = start.subarray(offset, offset + keyIdLength).toString("ascii");
  offset += keyIdLength;
  const chunkSize = start.readUInt32BE(offset);
  offset += 4;
  if (!/^[0-9a-f]{1,64}$/.test(keyId) || chunkSize < 1 || chunkSize > MAX_CHUNK_SIZE) {
    throw new BackupCryptoError("damaged", "The backup file's header is damaged.");
  }
  const salt = Buffer.from(start.subarray(offset, offset + SALT_BYTES));
  offset += SALT_BYTES;
  const noncePrefix = Buffer.from(start.subarray(offset, offset + NONCE_PREFIX_BYTES));
  return { version, keyId, chunkSize, salt, noncePrefix, bytes: Buffer.from(start.subarray(0, length)) };
}

function fileKey(key: Buffer, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", key, salt, FILE_KEY_INFO, 32));
}

function nonceFor(prefix: Buffer, index: number, last: boolean): Buffer {
  const nonce = Buffer.alloc(12);
  prefix.copy(nonce, 0);
  nonce.writeUInt32BE(index, NONCE_PREFIX_BYTES);
  nonce.writeUInt8(last ? 1 : 0, 11);
  return nonce;
}

const MAX_CHUNKS = 0xffffffff;

export type EncryptOptions = {
  /** Plaintext bytes per chunk (default 64 KiB; tests use small ones). */
  chunkSize?: number;
  /** Random bytes (tests pass a fixed source). */
  randomBytes?: (size: number) => Buffer;
};

/** A stream that turns plaintext into an encrypted backup file (header first). */
export function createBackupEncryptStream(key: Buffer, options: EncryptOptions = {}): Transform {
  if (key.length !== 32) throw new BackupCryptoError("bad_key", "The backup key must be 32 bytes.");
  const chunkSize = options.chunkSize ?? BACKUP_CHUNK_SIZE;
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_CHUNK_SIZE) throw new Error("Invalid chunk size");
  const random = options.randomBytes ?? cryptoRandomBytes;
  const salt = random(SALT_BYTES);
  const noncePrefix = random(NONCE_PREFIX_BYTES);
  const header = buildHeader(backupKeyId(key), chunkSize, salt, noncePrefix);
  const k = fileKey(key, salt);
  let index = 0;
  let pending: Buffer[] = [];
  let pendingLength = 0;
  let headerSent = false;

  const seal = (plain: Buffer, last: boolean): Buffer => {
    if (index > MAX_CHUNKS) throw new Error("The backup is too large for one file");
    const cipher = createCipheriv("aes-256-gcm", k, nonceFor(noncePrefix, index, last));
    cipher.setAAD(header);
    const out = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
    index += 1;
    return out;
  };

  return new Transform({
    transform(chunk: Buffer, _encoding, callback: TransformCallback) {
      try {
        if (!headerSent) {
          this.push(header);
          headerSent = true;
        }
        pending.push(chunk);
        pendingLength += chunk.length;
        // Keep at least one byte back: only the end of the input says which chunk is the last.
        if (pendingLength > chunkSize) {
          let all = Buffer.concat(pending, pendingLength);
          while (all.length > chunkSize) {
            this.push(seal(all.subarray(0, chunkSize), false));
            all = all.subarray(chunkSize);
          }
          pending = [all];
          pendingLength = all.length;
        }
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback: TransformCallback) {
      try {
        if (!headerSent) this.push(header);
        this.push(seal(Buffer.concat(pending, pendingLength), true));
        pending = [];
        pendingLength = 0;
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
  });
}

/**
 * A stream that turns an encrypted backup file back into its plaintext. Fails with
 * BackupCryptoError: "wrong_key" (the file names another key), "damaged" (a chunk does not
 * decrypt), "truncated" (the file ends before its last chunk), "not_a_backup", "unsupported_version".
 */
export function createBackupDecryptStream(key: Buffer): Transform {
  if (key.length !== 32) throw new BackupCryptoError("bad_key", "The backup key must be 32 bytes.");
  const ourKeyId = backupKeyId(key);
  let header: BackupFileHeader | null = null;
  let k: Buffer | null = null;
  let buffered: Buffer = Buffer.alloc(0);
  let index = 0;

  const open = (sealed: Buffer, last: boolean): Buffer => {
    if (!header || !k) throw new BackupCryptoError("truncated", "The backup file is cut short.");
    if (sealed.length < TAG_BYTES) throw new BackupCryptoError("truncated", "The backup file is cut short.");
    const decipher = createDecipheriv("aes-256-gcm", k, nonceFor(header.noncePrefix, index, last));
    decipher.setAAD(header.bytes);
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
    try {
      const plain = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - TAG_BYTES)), decipher.final()]);
      index += 1;
      return plain;
    } catch {
      throw new BackupCryptoError(
        last ? "truncated" : "damaged",
        last
          ? "The backup file is cut short or damaged (its last part does not check out)."
          : "The backup file is damaged (a part of it does not check out).",
      );
    }
  };

  const readHeader = (): boolean => {
    const parsed = readBackupHeader(buffered);
    if (!parsed) return false;
    if (parsed.keyId !== ourKeyId) {
      throw new BackupCryptoError(
        "wrong_key",
        `This backup was made with another key (key id ${parsed.keyId}); BACKUP_ENCRYPTION_KEY here is key id ${ourKeyId}.`,
        { fileKeyId: parsed.keyId, keyId: ourKeyId },
      );
    }
    header = parsed;
    k = fileKey(key, parsed.salt);
    buffered = buffered.subarray(parsed.bytes.length);
    return true;
  };

  return new Transform({
    transform(chunk: Buffer, _encoding, callback: TransformCallback) {
      try {
        buffered = buffered.length ? Buffer.concat([buffered, chunk]) : chunk;
        if (!header && !readHeader()) return callback();
        const sealedSize = header!.chunkSize + TAG_BYTES;
        // A full chunk followed by more bytes is not the last one.
        while (buffered.length > sealedSize) {
          this.push(open(buffered.subarray(0, sealedSize), false));
          buffered = buffered.subarray(sealedSize);
        }
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback: TransformCallback) {
      try {
        if (!header && !readHeader()) throw new BackupCryptoError("truncated", "The backup file is cut short (no complete header).");
        // Bytes added after the real end shift the chunks: the real last chunk then fails as "damaged".
        this.push(open(buffered, true));
        buffered = Buffer.alloc(0);
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
  });
}
