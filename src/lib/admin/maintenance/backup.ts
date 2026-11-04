import "server-only";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, type WriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import pg from "pg";
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  backupId,
  isBackupId,
  isSafeTableName,
  parseBackupMeta,
  pgEnvFromUrl,
  quoteIdent,
  redact,
  summarize,
  type BackupMeta,
  type BackupSummary,
  type BackupTable,
} from "./backup-format";

/**
 * Full database backups (founder's answer 8, round 3: "back up the database first"). Used by
 * Admin → Maintenance (src/lib/admin/maintenance/actions.ts), `npm run db:backup` and
 * `npm run db:restore` (scripts/). Format: ./backup-format.ts.
 *
 * Every table is read in ONE read-only REPEATABLE READ transaction, so the files are a
 * consistent snapshot, and written as JSON lines by Postgres itself (row_to_json), which keeps
 * dates, JSON, arrays and bytes exact. The restore puts them back with json_populate_recordset.
 * pg_dump runs too when the program is installed (an extra copy for `pg_restore`).
 *
 * Backups are kept on this server's disk (BACKUP_DIR, default ./backups, git-ignored). A host
 * without a writable disk (Vercel) cannot keep them: use the database host's own backups there.
 */

const FETCH_ROWS = 2000;
const INSERT_ROWS = 500;
const PG_DUMP_TIMEOUT_MS = 10 * 60 * 1000;

export function backupRoot(): string {
  return path.resolve(
    /* turbopackIgnore: true */ process.env.BACKUP_DIR?.trim() || path.join(/* turbopackIgnore: true */ process.cwd(), "backups"),
  );
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

/** The tables of the current schema with their (non-generated) columns, in a stable order. */
async function listTables(client: pg.ClientBase): Promise<{ name: string; columns: string[] }[]> {
  const { rows } = await client.query<{ table_name: string; columns: string[] }>(`
    SELECT c.table_name, array_agg(c.column_name::text ORDER BY c.ordinal_position) AS columns
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = current_schema() AND t.table_type = 'BASE TABLE' AND c.is_generated = 'NEVER'
    GROUP BY c.table_name
    ORDER BY c.table_name`);
  return rows.map((row) => ({ name: row.table_name, columns: row.columns }));
}

function writeLine(stream: WriteStream, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (stream.write(line)) resolve();
    else {
      stream.once("drain", resolve);
      stream.once("error", reject);
    }
  });
}

function closeStream(stream: WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.end((error?: Error | null) => (error ? reject(error) : resolve()));
  });
}

async function dumpTable(client: pg.ClientBase, table: { name: string; columns: string[] }, file: string): Promise<BackupTable> {
  const hash = createHash("sha256");
  const stream = createWriteStream(file, { flags: "wx", mode: 0o600 });
  let rows = 0;
  let bytes = 0;
  const cursor = `bayit_backup_${randomBytes(4).toString("hex")}`;
  await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS j FROM ${quoteIdent(table.name)} t`);
  try {
    for (;;) {
      const batch = await client.query<{ j: string }>(`FETCH ${FETCH_ROWS} FROM ${cursor}`);
      if (batch.rows.length === 0) break;
      for (const row of batch.rows) {
        const line = `${row.j}\n`;
        hash.update(line);
        bytes += Buffer.byteLength(line);
        rows += 1;
        await writeLine(stream, line);
      }
    }
  } finally {
    await client.query(`CLOSE ${cursor}`).catch(() => undefined);
    await closeStream(stream);
  }
  return { name: table.name, rows, bytes, sha256: hash.digest("hex"), columns: table.columns };
}

/** pg_dump into the folder, when installed. Never throws; the password goes through PGPASSWORD. */
async function runPgDump(dir: string): Promise<BackupMeta["pgDump"]> {
  const file = "database.dump";
  let env: Record<string, string>;
  try {
    env = pgEnvFromUrl(databaseUrl());
  } catch {
    return { error: "DATABASE_URL is not a URL" };
  }
  return new Promise((resolve) => {
    let stderr = "";
    let settled = false;
    const done = (value: BackupMeta["pgDump"]) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${path.join(dir, file)}`], {
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env } as unknown as NodeJS.ProcessEnv,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done({ error: "pg_dump took too long" });
    }, PG_DUMP_TIMEOUT_MS);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      done(error.code === "ENOENT" ? null : { error: redact(error.message) });
    });
    child.on("close", async (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        await fs.rm(path.join(dir, file), { force: true }).catch(() => undefined);
        return done({ error: redact(stderr.trim().split("\n")[0] || `pg_dump exited with ${code}`) });
      }
      const stat = await fs.stat(path.join(dir, file)).catch(() => null);
      done(stat ? { file, bytes: stat.size } : { error: "pg_dump wrote no file" });
    });
  });
}

/** Makes a full backup and returns its metadata. Throws when the database cannot be read or the disk is not writable. */
export async function createBackup(by: BackupMeta["createdBy"]): Promise<BackupMeta> {
  const root = backupRoot();
  const createdAt = new Date();
  const id = backupId(createdAt, randomBytes(3).toString("hex"));
  const partial = path.join(root, `${id}.partial`);
  const final = path.join(root, id);
  // Personal data: readable by this server's user only.
  await fs.mkdir(path.join(partial, "tables"), { recursive: true, mode: 0o700 });
  await fs.chmod(root, 0o700).catch(() => undefined);
  await fs.chmod(partial, 0o700).catch(() => undefined);

  const client = new pg.Client({ connectionString: databaseUrl() });
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const info = await client.query<{ db: string; server: string }>("SELECT current_database() AS db, current_setting('server_version') AS server");
    const tables: BackupTable[] = [];
    for (const table of await listTables(client)) {
      if (!isSafeTableName(table.name)) throw new Error(`Unexpected table name: ${table.name}`);
      tables.push(await dumpTable(client, table, path.join(partial, "tables", `${table.name}.jsonl`)));
    }
    await client.query("COMMIT");

    let schemaSha256: string | null = null;
    const schema = await fs.readFile(path.join(/* turbopackIgnore: true */ process.cwd(), "prisma", "schema.prisma")).catch(() => null);
    if (schema) {
      await fs.writeFile(path.join(partial, "schema.prisma"), schema, { mode: 0o600 });
      schemaSha256 = createHash("sha256").update(schema).digest("hex");
    }

    const pgDump = await runPgDump(partial);
    const meta: BackupMeta = {
      format: BACKUP_FORMAT,
      version: BACKUP_FORMAT_VERSION,
      id,
      createdAt: createdAt.toISOString(),
      createdBy: by,
      database: { name: info.rows[0]?.db ?? "", server: info.rows[0]?.server ?? "" },
      schemaSha256,
      tables,
      totalRows: tables.reduce((sum, t) => sum + t.rows, 0),
      totalBytes:
        tables.reduce((sum, t) => sum + t.bytes, 0) + (schema?.length ?? 0) + (pgDump && "file" in pgDump ? pgDump.bytes : 0),
      pgDump,
      complete: true,
    };
    if (pgDump && "file" in pgDump) await fs.chmod(path.join(partial, pgDump.file), 0o600).catch(() => undefined);
    await fs.writeFile(path.join(partial, "metadata.json"), `${JSON.stringify(meta, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await fs.rename(partial, final);
    return meta;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    await fs.rm(partial, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Reads a backup folder's metadata (null when it is missing, partial or not this format). */
export async function readBackupMeta(dir: string): Promise<BackupMeta | null> {
  try {
    return parseBackupMeta(JSON.parse(await fs.readFile(path.join(dir, "metadata.json"), "utf8")));
  } catch {
    return null;
  }
}

/** The newest complete backups first; with `database`, only the backups of that database. */
export async function listBackups(limit = 10, database?: string): Promise<BackupSummary[]> {
  const root = backupRoot();
  let names: string[];
  try {
    names = await fs.readdir(root);
  } catch {
    return [];
  }
  const ids = names.filter(isBackupId).sort().reverse();
  const out: BackupSummary[] = [];
  for (const id of ids) {
    const meta = await readBackupMeta(path.join(root, id));
    if (meta && meta.id === id && (database === undefined || meta.database?.name === database)) out.push(summarize(meta));
    if (out.length >= limit) break;
  }
  return out;
}

export async function latestBackup(database?: string): Promise<BackupSummary | null> {
  return (await listBackups(1, database))[0] ?? null;
}

/** Checks every table file against its checksum. Returns the names of the files that do not match. */
export async function verifyBackupFiles(dir: string, meta: BackupMeta): Promise<string[]> {
  const bad: string[] = [];
  for (const table of meta.tables) {
    const hash = createHash("sha256");
    try {
      for await (const chunk of createReadStream(path.join(dir, "tables", `${table.name}.jsonl`))) hash.update(chunk as Buffer);
      if (hash.digest("hex") !== table.sha256) bad.push(table.name);
    } catch {
      bad.push(table.name);
    }
  }
  return bad;
}

export type RestoreReport = { tables: number; rows: number; sequences: number };

/**
 * Restores a backup into an EMPTY database that already has the tables (`prisma db push` with
 * the backup's schema.prisma). Refuses a database that has any rows, so it can never overwrite
 * live data. Foreign keys are checked once at the end (made deferrable for the load, then put back).
 */
export async function restoreBackup(dir: string, targetUrl: string, log: (line: string) => void = () => {}): Promise<RestoreReport> {
  const meta = await readBackupMeta(dir);
  if (!meta) throw new Error(`Not a complete backup: ${dir}`);
  const bad = await verifyBackupFiles(dir, meta);
  if (bad.length) throw new Error(`These files do not match their checksum: ${bad.join(", ")}`);

  const client = new pg.Client({ connectionString: targetUrl });
  await client.connect();
  const changedConstraints: { table: string; name: string }[] = [];
  try {
    const targetTables = new Map((await listTables(client)).map((t) => [t.name, t.columns]));
    const missing = meta.tables.filter((t) => !targetTables.has(t.name)).map((t) => t.name);
    if (missing.length) {
      throw new Error(`The target database has no table ${missing.join(", ")}. Create the tables first (--create-schema).`);
    }
    for (const table of meta.tables) {
      const { rows } = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${quoteIdent(table.name)}`);
      if (Number(rows[0]?.n ?? 0) > 0) throw new Error(`The target database is not empty (table ${table.name} has rows). Restore only into an empty database.`);
    }

    await client.query("BEGIN");
    const fks = await client.query<{ table_name: string; conname: string }>(`
      SELECT cl.relname AS table_name, co.conname
      FROM pg_constraint co
      JOIN pg_class cl ON cl.oid = co.conrelid
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      WHERE co.contype = 'f' AND NOT co.condeferrable AND ns.nspname = current_schema()`);
    for (const fk of fks.rows) {
      await client.query(`ALTER TABLE ${quoteIdent(fk.table_name)} ALTER CONSTRAINT ${quoteIdent(fk.conname)} DEFERRABLE INITIALLY DEFERRED`);
      changedConstraints.push({ table: fk.table_name, name: fk.conname });
    }
    await client.query("SET CONSTRAINTS ALL DEFERRED");

    let total = 0;
    for (const table of meta.tables) {
      const targetColumns = new Set(targetTables.get(table.name));
      const columns = table.columns.filter((c) => targetColumns.has(c));
      const list = columns.map(quoteIdent).join(", ");
      const insert = `INSERT INTO ${quoteIdent(table.name)} (${list}) SELECT ${list} FROM json_populate_recordset(NULL::${quoteIdent(table.name)}, $1::json)`;
      let batch: string[] = [];
      let count = 0;
      const flush = async () => {
        if (!batch.length) return;
        await client.query(insert, [`[${batch.join(",")}]`]);
        count += batch.length;
        batch = [];
      };
      const lines = createInterface({ input: createReadStream(path.join(dir, "tables", `${table.name}.jsonl`)), crlfDelay: Infinity });
      for await (const line of lines) {
        if (!line) continue;
        batch.push(line);
        if (batch.length >= INSERT_ROWS) await flush();
      }
      await flush();
      if (count !== table.rows) throw new Error(`Table ${table.name}: read ${count} rows, the backup lists ${table.rows}`);
      total += count;
      log(`  ${table.name}: ${count}`);
    }
    await client.query("COMMIT");

    // Put the foreign keys back as they were.
    await client.query("BEGIN");
    for (const fk of changedConstraints) {
      await client.query(`ALTER TABLE ${quoteIdent(fk.table)} ALTER CONSTRAINT ${quoteIdent(fk.name)} NOT DEFERRABLE`);
    }
    await client.query("COMMIT");

    // Auto-increment counters (Listing.publicId, Ticket.number…) continue after the restored rows.
    const sequences = await client.query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_default LIKE 'nextval(%'`);
    for (const seq of sequences.rows) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${quoteIdent(seq.column_name)}) FROM ${quoteIdent(seq.table_name)}), 0) + 1, false)`,
        [quoteIdent(seq.table_name), seq.column_name],
      );
    }
    return { tables: meta.tables.length, rows: total, sequences: sequences.rows.length };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}
