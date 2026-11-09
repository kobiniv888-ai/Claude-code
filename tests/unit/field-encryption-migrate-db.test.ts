/**
 * Field encryption, the migration (SECURITY_REPORT 12.3.c, D7 (a); scripts/encrypt-fields.ts →
 * src/lib/field-crypto-migrate.ts), against a THROWAWAY database made for this test (the shared
 * development database is never touched) with the columns the migration reads:
 * - plain addresses, pins and guest phones move into the encrypted columns, the plain columns are
 *   emptied, the values open again to exactly what they were;
 * - IDEMPOTENT (a second run changes nothing) and BATCHED (more rows than one batch);
 * - an encrypted value already there wins over a plain copy; half a pin and an erased ("") phone
 *   are dropped; a value that cannot be opened is left untouched with its plain copy (nothing lost);
 *   `verify` opens every stored value (also those under the current key) and counts the bad ones;
 * - KEY ROTATION: with the old key as FIELD_ENCRYPTION_KEY_PREVIOUS everything is re-sealed with the
 *   new key and given new lookup values; afterwards the old key is not needed;
 * - once no plain value is left the database REFUSES new ones (CHECK constraints): no write path,
 *   not even raw SQL, can store a plain address, pin or guest phone again.
 * Fake values only. The database is dropped afterwards.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildFieldKeyring, decodePin, fieldLookup, fieldLookups, openField, sealField, sealedKeyId } from "../../src/lib/field-crypto-core";

vi.mock("server-only", () => ({}));

const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("@/generated/prisma/client");
const { encryptPlainFields, LISTING_GUARD, BOOKING_GUARD } = await import("@/lib/field-crypto-migrate");

const DB_NAME = `bayit_fieldenc_test_${randomBytes(4).toString("hex")}`;
const key = () => randomBytes(32).toString("base64");
const OLD_KEY = key();
const NEW_KEY = key();
const oldRing = buildFieldKeyring({ FIELD_ENCRYPTION_KEY: OLD_KEY }, { development: false });
const rotationRing = buildFieldKeyring({ FIELD_ENCRYPTION_KEY: NEW_KEY, FIELD_ENCRYPTION_KEY_PREVIOUS: OLD_KEY }, { development: false });
const newOnlyRing = buildFieldKeyring({ FIELD_ENCRYPTION_KEY: NEW_KEY }, { development: false });
const foreignRing = buildFieldKeyring({ FIELD_ENCRYPTION_KEY: key() }, { development: false });

function url(database: string): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set (.env)");
  const parsed = new URL(raw);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

async function admin(query: string) {
  const client = new Client({ connectionString: url(new URL(process.env.DATABASE_URL!).pathname.slice(1)) });
  await client.connect();
  try {
    return await client.query(query);
  } finally {
    await client.end();
  }
}

let pg: Client;
let prisma: InstanceType<typeof PrismaClient>;
const q = (text: string, values: unknown[] = []) => pg.query(text, values);

beforeAll(async () => {
  await admin(`CREATE DATABASE "${DB_NAME}"`);
  pg = new Client({ connectionString: url(DB_NAME) });
  await pg.connect();
  // The columns the migration reads and writes, as prisma db push makes them (after the push).
  await q(`CREATE TABLE "Listing" ("id" text PRIMARY KEY, "address" text, "lat" double precision, "lng" double precision, "addressEnc" text, "pinEnc" text)`);
  await q(`CREATE TABLE "Booking" ("id" text PRIMARY KEY, "guestPhone" text, "guestPhoneEnc" text, "guestPhoneLookup" text)`);
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url(DB_NAME) }) });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.end();
  await admin(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
}, 60_000);

const listing = async (id: string) => (await q(`SELECT * FROM "Listing" WHERE id = $1`, [id])).rows[0];
const booking = async (id: string) => (await q(`SELECT * FROM "Booking" WHERE id = $1`, [id])).rows[0];

describe("encrypt-fields: plain → encrypted", () => {
  it("refuses to run before the schema is pushed (Booking.guestPhone still NOT NULL)", async () => {
    await q(`ALTER TABLE "Booking" ALTER COLUMN "guestPhone" SET NOT NULL`).catch(() => undefined);
    await expect(encryptPlainFields(prisma, { keyring: oldRing })).rejects.toThrow(/prisma db push first/);
    await q(`ALTER TABLE "Booking" ALTER COLUMN "guestPhone" DROP NOT NULL`);
  });

  it("moves every plain value, batched, and opens them again exactly; a second run changes nothing", async () => {
    for (let i = 0; i < 7; i++) {
      await q(`INSERT INTO "Listing" (id, address, lat, lng) VALUES ($1, $2, $3, $4)`, [`l${i}`, `  ${i} Fake Street, apt ${i}  `, 41.7 + i / 1000, 44.8 + i / 1000]);
      await q(`INSERT INTO "Booking" (id, "guestPhone") VALUES ($1, $2)`, [`b${i}`, `+99555500000${i}`]);
    }
    // Edge cases: half a pin, an empty address, an erased phone, and a row the site already wrote.
    await q(`INSERT INTO "Listing" (id, address, lat, lng) VALUES ('half', '', 41.7, NULL)`);
    await q(`INSERT INTO "Booking" (id, "guestPhone") VALUES ('erased', '')`);
    await q(`INSERT INTO "Listing" (id, address, "addressEnc") VALUES ('both', 'Old plain copy', $1)`, [sealField(oldRing, "listing.address", "New street 2")]);

    const first = await encryptPlainFields(prisma, { keyring: oldRing, batchSize: 3 });
    expect(first.remainingPlain).toEqual({ listings: 0, bookings: 0 });
    expect(first.listings.unreadable + first.bookings.unreadable).toBe(0);
    expect(first.listings.changed).toBe(9);
    expect(first.bookings.changed).toBe(8);

    for (let i = 0; i < 7; i++) {
      const l = await listing(`l${i}`);
      expect([l.address, l.lat, l.lng]).toEqual([null, null, null]);
      expect(openField(oldRing, "listing.address", l.addressEnc)).toBe(`${i} Fake Street, apt ${i}`);
      expect(decodePin(openField(oldRing, "listing.pin", l.pinEnc))).toEqual({ lat: Number((41.7 + i / 1000).toFixed(6)), lng: Number((44.8 + i / 1000).toFixed(6)) });
      const b = await booking(`b${i}`);
      expect(b.guestPhone).toBeNull();
      expect(openField(oldRing, "booking.guestPhone", b.guestPhoneEnc)).toBe(`+99555500000${i}`);
      expect(b.guestPhoneLookup).toBe(fieldLookup(oldRing, "booking.guestPhone", `+99555500000${i}`));
      // Nothing in plain text anywhere in the row.
      expect(JSON.stringify(l)).not.toContain("Fake Street");
      expect(JSON.stringify(b)).not.toContain("555500000");
    }
    expect(await listing("half")).toMatchObject({ address: null, lat: null, lng: null, addressEnc: null, pinEnc: null });
    expect(await booking("erased")).toMatchObject({ guestPhone: null, guestPhoneEnc: null, guestPhoneLookup: null });
    const both = await listing("both");
    expect(both.address).toBeNull();
    expect(openField(oldRing, "listing.address", both.addressEnc)).toBe("New street 2");

    const second = await encryptPlainFields(prisma, { keyring: oldRing, batchSize: 3 });
    expect(second.listings).toMatchObject({ changed: 0, sealed: 0, resealed: 0 });
    expect(second.bookings).toMatchObject({ changed: 0, sealed: 0, resealed: 0 });
  });

  it("a dry run changes nothing", async () => {
    await q(`ALTER TABLE "Listing" DROP CONSTRAINT IF EXISTS "${LISTING_GUARD}"`);
    await q(`INSERT INTO "Listing" (id, address) VALUES ('dry', 'Dry run street 1')`);
    const report = await encryptPlainFields(prisma, { keyring: oldRing, dryRun: true });
    expect(report.listings.changed).toBe(1);
    expect(await listing("dry")).toMatchObject({ address: "Dry run street 1", addressEnc: null });
    await encryptPlainFields(prisma, { keyring: oldRing });
    expect((await listing("dry")).address).toBeNull();
  });
});

describe("the database refuses plain values once they are all moved", () => {
  it("adds the CHECK constraints, and a plain write fails even through raw SQL", async () => {
    const report = await encryptPlainFields(prisma, { keyring: oldRing });
    expect(report.guard).toEqual({ listing: true, booking: true });
    await expect(q(`INSERT INTO "Listing" (id, address) VALUES ('p1', '1 Plain Street')`)).rejects.toThrow(new RegExp(LISTING_GUARD));
    await expect(q(`UPDATE "Listing" SET lat = 41.7 WHERE id = 'l0'`)).rejects.toThrow(new RegExp(LISTING_GUARD));
    await expect(q(`INSERT INTO "Booking" (id, "guestPhone") VALUES ('p2', '+995555000999')`)).rejects.toThrow(new RegExp(BOOKING_GUARD));
    // Encrypted values and clearing still work.
    await q(`UPDATE "Listing" SET "addressEnc" = NULL WHERE id = 'l6'`);
  });
});

describe("key rotation", () => {
  it("re-seals everything with the new key and new lookup values; then the old key is not needed", async () => {
    const before = await booking("b1");
    const report = await encryptPlainFields(prisma, { keyring: rotationRing, batchSize: 4 });
    expect(report.remainingOldKey).toEqual({ listings: 0, bookings: 0 });
    expect(report.listings.resealed).toBeGreaterThan(0);
    expect(report.bookings.resealed).toBe(7);
    const l = await listing("l1");
    expect(sealedKeyId(l.addressEnc)).toBe(newOnlyRing.current.id);
    expect(openField(newOnlyRing, "listing.address", l.addressEnc)).toBe("1 Fake Street, apt 1");
    expect(decodePin(openField(newOnlyRing, "listing.pin", l.pinEnc))).toEqual({ lat: 41.701, lng: 44.801 });
    const b = await booking("b1");
    expect(b.guestPhoneEnc).not.toBe(before.guestPhoneEnc);
    expect(openField(newOnlyRing, "booking.guestPhone", b.guestPhoneEnc)).toBe("+995555000001");
    expect(b.guestPhoneLookup).toBe(fieldLookup(newOnlyRing, "booking.guestPhone", "+995555000001"));
    // The per-phone cap finds the booking with the new key alone.
    expect(fieldLookups(newOnlyRing, "booking.guestPhone", "+995555000001")).toContain(b.guestPhoneLookup);
    // Idempotent under the new key too, and --verify with the NEW key alone opens everything: the
    // old key can be removed (docs/security/field-encryption.md, step 5).
    expect((await encryptPlainFields(prisma, { keyring: newOnlyRing })).bookings.changed).toBe(0);
    const check = await encryptPlainFields(prisma, { keyring: newOnlyRing, verify: true });
    expect(check.listings.unreadable + check.bookings.unreadable).toBe(0);
    expect(check.bookings.verified).toBe(7);
  });
});

describe("a value that cannot be opened", () => {
  it("is left exactly as it is, counted, and never replaced or lost", async () => {
    await q(`ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "${BOOKING_GUARD}"`);
    const foreign = sealField(foreignRing, "booking.guestPhone", "+995555000777");
    await q(`INSERT INTO "Booking" (id, "guestPhone", "guestPhoneEnc") VALUES ('foreign', '+995555000777', $1)`, [foreign]);
    const tampered = (await listing("l2")).addressEnc.replace(/.$/, (c: string) => (c === "A" ? "B" : "A"));
    await q(`UPDATE "Listing" SET "addressEnc" = $1 WHERE id = 'l2'`, [tampered]);
    // An ordinary run reads only plain and old-key values: the foreign-key phone is found, the
    // tampered address (under the current key) is not read at all, so nothing touches it.
    const report = await encryptPlainFields(prisma, { keyring: newOnlyRing });
    expect(report.bookings.unreadable).toBe(1);
    expect(report.listings.unreadable).toBe(0);
    expect(report.verify).toBe(false);
    // --verify opens every stored value and finds the tampered one too.
    const verified = await encryptPlainFields(prisma, { keyring: newOnlyRing, verify: true });
    expect(verified.verify).toBe(true);
    expect(verified.listings.unreadable).toBe(1);
    expect(verified.bookings.unreadable).toBe(1);
    expect(verified.listings.verified).toBeGreaterThan(0);
    expect(verified.listings.changed + verified.bookings.changed).toBe(0);
    expect(await booking("foreign")).toMatchObject({ guestPhone: "+995555000777", guestPhoneEnc: foreign });
    expect((await listing("l2")).addressEnc).toBe(tampered);
    // A plain value is still there, so the bookings guard stays off until it is solved.
    expect(report.remainingPlain.bookings).toBe(1);
    expect(report.guard.booking).toBe(false);
  });
});
