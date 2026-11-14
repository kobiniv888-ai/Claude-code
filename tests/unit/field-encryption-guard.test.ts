/**
 * Field encryption (SECURITY_REPORT 12.3.c, D7 (a)): the old PLAIN columns of the exact address,
 * the exact pin and the guest's phone (Listing.address / lat / lng, Booking.guestPhone; Prisma
 * fields legacyAddress / legacyLat / legacyLng / legacyGuestPhone) are NEVER read or written again.
 *
 * 1. Source tripwire: no site, script, seed or end-to-end code names the legacy Prisma fields (except the export
 *    selecting them `false` and the seed's type that leaves them out), and no raw SQL reads or
 *    writes the plain columns (only the migration that empties them, src/lib/field-crypto-migrate.ts).
 * 2. The database itself refuses them (CHECK constraints added by scripts/encrypt-fields.ts once no
 *    plain value is left): a plain write fails through Prisma and through raw SQL, inside a
 *    transaction that is always rolled back (the shared development database is never changed), and
 *    no row holds a plain value.
 * The encrypted write paths themselves are tested where they live: the post form
 * (src/lib/wizard/step-update.test.ts), booking create (src/lib/booking/service.test.ts), the
 * migration (tests/unit/field-encryption-migrate-db.test.ts).
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = path.resolve(__dirname, "../..");
const SCANNED = ["src", "scripts", "prisma/seed", "prisma/sql", "tests/e2e"];
const EXTENSIONS = /\.(?:ts|tsx|mts|mjs|cjs|js|sql)$/;
/** Tests may name the legacy fields (to assert they stay empty); generated code mirrors the schema. */
const SKIPPED = /(?:^|\/)(?:generated|node_modules)\/|\.test\.[cm]?[jt]sx?$/;
/** The one module allowed to read and empty the plain columns. */
const MIGRATION = "src/lib/field-crypto-migrate.ts";

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (SKIPPED.test(`${rel}${entry.isDirectory() ? "/" : ""}`)) continue;
      if (entry.isDirectory()) walk(rel);
      else if (EXTENSIONS.test(entry.name)) out.push(rel);
    }
  };
  for (const dir of SCANNED) if (fs.existsSync(path.join(ROOT, dir))) walk(dir);
  return out;
}

const LEGACY_FIELD = /\blegacy(?:Address|Lat|Lng|GuestPhone)\b/g;
/** Where a legacy field may be named, and how: never selected, never written. */
const LEGACY_ALLOWED: Record<string, RegExp> = {
  "src/lib/account/export.ts": /^\s*legacy(?:Address|Lat|Lng):\s*false,?\s*$/,
  "prisma/seed/listings/types.ts": /^\s*\|\s*"legacy(?:Address|Lat|Lng)"\s*$/,
};

/** A raw INSERT / UPDATE of Listing or Booking, up to the end of its statement or string. */
const RAW_WRITE = /(?:UPDATE|INSERT\s+INTO)\s+"?(Listing|Booking)"?\b[^;`]*/gi;
/** A backtick SQL string (raw queries here use template literals). */
const SQL_STRING = /`[^`]*`/g;
const SQL_KEYWORD = /\b(?:SELECT|UPDATE|INSERT|DELETE|WHERE|RETURNING)\b/;
/** Other tables with a lat/lng or address of their own (a query joining them names theirs, behind an alias). */
const OTHER_GEO_TABLE = /"(?:City|Neighborhood|JewishPlace)"/;

/**
 * Does this SQL read (or name) a plain column? `"lat"`, `lat`, `l."address"` in a query on Listing;
 * `"guestPhone"` in a query on Booking (never addressEnc, approxLat, guestPhoneEnc…). When the query
 * also joins a table that has a lat/lng or address of its own, an alias-qualified column may be
 * that table's, so only bare names count there.
 */
function readsPlainColumn(sql: string): boolean {
  if (/"Booking"/.test(sql) && /(?<![A-Za-z_])"?guestPhone"?(?![A-Za-z_])/.test(sql)) return true;
  if (!/"Listing"/.test(sql)) return false;
  const bare = /(?<![A-Za-z_."])"?(?:address|lat|lng)"?(?![A-Za-z_"])/;
  const qualified = /\b[A-Za-z_]\w*\."?(?:address|lat|lng)"?(?![A-Za-z_"])/;
  return bare.test(sql) || (!OTHER_GEO_TABLE.test(sql) && qualified.test(sql));
}

/** A plain column being written: `address =`, `"lat",`, `"guestPhone")`… (not addressEnc, approxLat…). */
const PLAIN_COLUMN: Record<string, RegExp> = {
  Listing: /(?<![A-Za-z_."])"?(?:address|lat|lng)"?(?![A-Za-z_])\s*(?:=|,|\))/,
  Booking: /(?<![A-Za-z_."])"?guestPhone"?(?![A-Za-z_])\s*(?:=|,|\))/,
};

describe("no code names the plain columns (source tripwire)", () => {
  const files = sourceFiles();

  // Reading ~1,400 files takes well under a second, but a busy machine (several test runs at once)
  // can stretch it: a generous timeout, so the tripwire never fails for being slow.
  const SCAN_TIMEOUT = 60_000;

  it("scans the site, scripts and seed", () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain("src/lib/field-crypto.ts");
    expect(files).toContain("prisma/seed/bookings.ts");
  }, SCAN_TIMEOUT);

  it("the legacy Prisma fields appear only where they are switched off", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = fs.readFileSync(path.join(ROOT, file), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!LEGACY_FIELD.test(line)) return;
        LEGACY_FIELD.lastIndex = 0;
        if (file === MIGRATION) return;
        const allowed = LEGACY_ALLOWED[file];
        // Comments may explain the fields; code may only switch them off.
        if (/^\s*(?:\/\/|\*|\/\*\*?)/.test(line)) return;
        if (!allowed?.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      });
      LEGACY_FIELD.lastIndex = 0;
    }
    expect(offenders).toEqual([]);
  }, SCAN_TIMEOUT);

  it("no raw SQL writes a plain address, pin or guest phone", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file === MIGRATION) continue;
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      for (const match of text.matchAll(RAW_WRITE)) {
        if (PLAIN_COLUMN[match[1]!.replace(/^./, (c) => c.toUpperCase())]?.test(match[0])) {
          offenders.push(`${file}: ${match[0].replace(/\s+/g, " ").slice(0, 120)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  }, SCAN_TIMEOUT);

  it("no raw SQL reads a plain address, pin or guest phone either", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file === MIGRATION) continue;
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      const blocks = file.endsWith(".sql") ? [text] : [...text.matchAll(SQL_STRING)].map((m) => m[0]);
      for (const sql of blocks) {
        if (SQL_KEYWORD.test(sql) && readsPlainColumn(sql)) offenders.push(`${file}: ${sql.replace(/\s+/g, " ").slice(0, 120)}`);
      }
    }
    expect(offenders).toEqual([]);
  }, SCAN_TIMEOUT);

  it("the tripwire itself catches the patterns it is meant to (self-check)", () => {
    const writes = [
      `UPDATE "Listing" SET lat = $2, lng = $3 WHERE id = $1`,
      `UPDATE "Listing" SET "address" = $1`,
      `INSERT INTO "Booking" (id, "guestPhone", locale) VALUES ($1, $2, $3)`,
    ];
    for (const sql of writes) {
      const match = [...sql.matchAll(RAW_WRITE)][0]!;
      expect(PLAIN_COLUMN[match[1]!]!.test(match[0]), sql).toBe(true);
    }
    const fine = [`UPDATE "Listing" SET "addressEnc" = $2, "pinEnc" = $3, "approxLat" = $4`, `INSERT INTO "Booking" (id, "guestPhoneEnc", "guestPhoneLookup")`];
    for (const sql of fine) {
      const match = [...sql.matchAll(RAW_WRITE)][0]!;
      expect(PLAIN_COLUMN[match[1]!]!.test(match[0]), sql).toBe(false);
    }
    expect("  legacyAddress: false,").toMatch(LEGACY_ALLOWED["src/lib/account/export.ts"]!);
    expect("  legacyAddress: true,").not.toMatch(LEGACY_ALLOWED["src/lib/account/export.ts"]!);
    const reads = [
      `SELECT "id", "lat", "lng" FROM "Listing" WHERE id = $1`,
      `SELECT address FROM "Listing"`,
      `SELECT l."address" FROM "Listing" l WHERE l.id = $1`,
      `SELECT b."guestPhone" FROM "Booking" b`,
      `SELECT l."lat" FROM "Listing" l JOIN "City" c ON c.id = l."cityId" WHERE "lng" > 40`,
    ];
    for (const sql of reads) expect(readsPlainColumn(sql), sql).toBe(true);
    const fineReads = [
      `SELECT "addressEnc", "pinEnc", "approxLat", "approxLng" FROM "Listing" WHERE id = $1`,
      `SELECT "guestPhoneEnc", "guestPhoneLookup" FROM "Booking"`,
      // A join with a table that has its own lat/lng: its alias-qualified columns are its own.
      `SELECT l.id, c."lat", c."lng" FROM "Listing" l JOIN "City" c ON c.id = l."cityId"`,
      `SELECT lat, lng FROM "City" WHERE slug = 'mestia'`,
    ];
    for (const sql of fineReads) expect(readsPlainColumn(sql), sql).toBe(false);
  });
});

describe("the database refuses plain values (local database, always rolled back)", () => {
  let pg: Client;
  let prisma: typeof import("@/lib/db").db;
  const guards = { listing: "", booking: "" };

  beforeAll(async () => {
    const { LISTING_GUARD, BOOKING_GUARD } = await import("@/lib/field-crypto-migrate");
    guards.listing = LISTING_GUARD;
    guards.booking = BOOKING_GUARD;
    pg = new Client({ connectionString: process.env.DATABASE_URL });
    await pg.connect();
    prisma = (await import("@/lib/db")).db;
  });

  afterAll(async () => {
    await pg?.end();
    await prisma?.$disconnect();
  });

  it("both CHECK constraints are installed (npm run db:encrypt-fields)", async () => {
    const { rows } = await pg.query<{ conname: string }>(`SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[])`, [[guards.listing, guards.booking]]);
    expect(rows.map((r) => r.conname).sort()).toEqual([guards.booking, guards.listing].sort());
  });

  it("no row holds a plain address, pin or guest phone", async () => {
    const { rows } = await pg.query<{ listings: string; bookings: string }>(
      `SELECT (SELECT COUNT(*) FROM "Listing" WHERE "address" IS NOT NULL OR "lat" IS NOT NULL OR "lng" IS NOT NULL)::text AS listings,
              (SELECT COUNT(*) FROM "Booking" WHERE "guestPhone" IS NOT NULL)::text AS bookings`,
    );
    expect(rows[0]).toEqual({ listings: "0", bookings: "0" });
  });

  async function refusedInRolledBackTransaction(sql: string): Promise<string> {
    await pg.query("BEGIN");
    try {
      await pg.query(sql);
      return "accepted";
    } catch (error) {
      return (error as Error).message;
    } finally {
      await pg.query("ROLLBACK");
    }
  }

  it("raw SQL cannot write them", async () => {
    const { rows: listings } = await pg.query<{ id: string }>(`SELECT id FROM "Listing" ORDER BY id LIMIT 1`);
    const { rows: bookings } = await pg.query<{ id: string }>(`SELECT id FROM "Booking" ORDER BY id LIMIT 1`);
    expect(listings.length, "the local database needs its demo data (npm run db:seed)").toBe(1);
    for (const set of [`"address" = '1 Plain Street'`, `"lat" = 41.7`, `"lng" = 44.8`]) {
      expect(await refusedInRolledBackTransaction(`UPDATE "Listing" SET ${set} WHERE id = '${listings[0]!.id}'`)).toContain(guards.listing);
    }
    if (bookings[0]) {
      expect(await refusedInRolledBackTransaction(`UPDATE "Booking" SET "guestPhone" = '+995555000999' WHERE id = '${bookings[0].id}'`)).toContain(guards.booking);
    }
  });

  it("Prisma cannot write them either (the legacy fields exist only to be refused)", async () => {
    const listing = await prisma.listing.findFirstOrThrow({ select: { id: true } });
    const refused = async (write: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<unknown>) => {
      try {
        await prisma.$transaction(async (tx) => {
          await write(tx);
          throw new Error("rollback: the write was accepted");
        });
        return "accepted";
      } catch (error) {
        return (error as Error).message;
      }
    };
    expect(await refused((tx) => tx.listing.update({ where: { id: listing.id }, data: { legacyAddress: "1 Plain Street" } }))).toMatch(/Listing_no_plain_location|check constraint/i);
    expect(await refused((tx) => tx.listing.update({ where: { id: listing.id }, data: { legacyLat: 41.7, legacyLng: 44.8 } }))).toMatch(/Listing_no_plain_location|check constraint/i);
    const booking = await prisma.booking.findFirst({ select: { id: true } });
    if (booking) {
      expect(await refused((tx) => tx.booking.update({ where: { id: booking.id }, data: { legacyGuestPhone: "+995555000999" } }))).toMatch(/Booking_no_plain_guest_phone|check constraint/i);
    }
  });
});
