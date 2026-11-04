/**
 * The backup folder format (pure, unit-tested). One folder per backup under backups/ (or
 * BACKUP_DIR):
 *
 *   backups/2026-11-03T21-17-22Z-a1b2/
 *     metadata.json          what is inside (this type), written last
 *     tables/<Table>.jsonl   every row of every table, one JSON object per line (row_to_json)
 *     schema.prisma          the Prisma schema at the time of the backup
 *     database.dump          pg_dump --format=custom, when the pg_dump program exists
 *
 * The rows are a consistent snapshot (one REPEATABLE READ transaction). A folder is complete only
 * when metadata.json says so; while it is being written it is called "<id>.partial".
 */

export const BACKUP_FORMAT = "bayit-backup";
export const BACKUP_FORMAT_VERSION = 1;

export type BackupTable = {
  name: string;
  rows: number;
  bytes: number;
  sha256: string;
  /** Column names in table order (generated columns left out). */
  columns: string[];
};

export type BackupMeta = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_FORMAT_VERSION;
  id: string;
  createdAt: string;
  /** Who made it: a staff account from the admin panel, or the command line. */
  createdBy: { userId: string | null; via: "admin" | "cli" };
  database: { name: string; server: string };
  schemaSha256: string | null;
  tables: BackupTable[];
  totalRows: number;
  /** Every file of the backup, in bytes. */
  totalBytes: number;
  /** pg_dump's file, its error, or null when the program is not installed. */
  pgDump: { file: string; bytes: number } | { error: string } | null;
  complete: true;
};

/** A short summary for the admin page and the clean-up gate. */
export type BackupSummary = {
  id: string;
  createdAt: string;
  totalBytes: number;
  totalRows: number;
  tables: number;
  pgDump: boolean;
  via: "admin" | "cli";
  /** The database it was made from (current_database()); a run only counts a backup of its own database. */
  database: string;
};

const ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-[a-z0-9]{4}$/;

/** "2026-11-03T21:17:22.123Z" + "a1b2" → "2026-11-03T21-17-22Z-a1b2" (sortable, safe as a folder name). */
export function backupId(at: Date, suffix: string): string {
  const stamp = at.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
  return `${stamp}-${suffix.toLowerCase().replace(/[^a-z0-9]/g, "").padEnd(4, "0").slice(0, 4)}`;
}

/** Only real backup ids may be read: no "..", no slashes, no other folders. */
export function isBackupId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/** A table name that is safe as a file name ("User", "ListingStatDaily", "_prisma_migrations"). */
export function isSafeTableName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name);
}

/** "User" → "\"User\"" (the names are checked with isSafeTableName first; quotes doubled anyway). */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function summarize(meta: BackupMeta): BackupSummary {
  return {
    id: meta.id,
    createdAt: meta.createdAt,
    totalBytes: meta.totalBytes,
    totalRows: meta.totalRows,
    tables: meta.tables.length,
    pgDump: !!meta.pgDump && "file" in meta.pgDump,
    via: meta.createdBy.via,
    database: meta.database?.name ?? "",
  };
}

/** Reads metadata.json; null when it is not a complete backup of this format. */
export function parseBackupMeta(json: unknown): BackupMeta | null {
  if (!json || typeof json !== "object") return null;
  const meta = json as Partial<BackupMeta>;
  if (meta.format !== BACKUP_FORMAT || meta.version !== BACKUP_FORMAT_VERSION || meta.complete !== true) return null;
  if (!isBackupId(meta.id) || typeof meta.createdAt !== "string" || !Array.isArray(meta.tables)) return null;
  if (!meta.tables.every((t) => t && typeof t.name === "string" && isSafeTableName(t.name) && Array.isArray(t.columns))) return null;
  return meta as BackupMeta;
}

/**
 * The connection settings pg_dump reads from the environment, from a DATABASE_URL (so the
 * password never appears on a command line or in a log).
 */
export function pgEnvFromUrl(url: string): Record<string, string> {
  const parsed = new URL(url);
  const env: Record<string, string> = {};
  if (parsed.hostname) env.PGHOST = decodeURIComponent(parsed.hostname);
  if (parsed.port) env.PGPORT = parsed.port;
  if (parsed.username) env.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (database) env.PGDATABASE = database;
  const sslmode = parsed.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

/** Removes anything that looks like a connection string or password from an error text. */
export function redact(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "postgresql://***").replace(/password[=:]\s*\S+/gi, "password=***").slice(0, 300);
}
