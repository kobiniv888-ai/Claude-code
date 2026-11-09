import "server-only";
import { fieldKeyring } from "./field-crypto";
import {
  decodePin,
  encodePin,
  fieldLookup,
  isFieldCryptoError,
  openField,
  sealField,
  sealedWithOldKey,
  type FieldKeyring,
} from "./field-crypto-core";

/**
 * Moves the plain exact address/pin and guest phones into the encrypted columns, and re-seals
 * values written with an old key (SECURITY_REPORT 12.3.c, D7 (a); the procedure is in
 * docs/security/field-encryption.md). Run by scripts/encrypt-fields.ts (`npm run db:encrypt-fields`).
 *
 * - IDEMPOTENT and BATCHED: rows are read in id order, `batchSize` at a time; a row is written only
 *   when something about it is left to do, and only while it still holds what was read (a host who
 *   saves a new address meanwhile is never overwritten: that row is picked up by the next run).
 *   A second run finds nothing left.
 * - The plain columns (Listing.address/lat/lng, Booking.guestPhone) are emptied in the same UPDATE
 *   that writes the encrypted value. An encrypted value already there (written by the site since
 *   encryption) wins over a plain copy.
 * - A stored encrypted value that cannot be opened (another key, changed) is LEFT AS IT IS and
 *   counted as `unreadable`: nothing is lost, and the report says so.
 * - Once no plain value is left, the database refuses new ones: CHECK constraints
 *   "Listing_no_plain_location" and "Booking_no_plain_guest_phone" (`installGuard`).
 *
 * Raw SQL on the column names on purpose: it runs on any database that has the new columns (pushed
 * schema), whatever the Prisma field names are, and the site's code never touches the plain columns.
 */

/** The raw-query part of a Prisma client (the app's `db`, or a client for another database). */
export type RawSqlClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
};

export type EncryptFieldsOptions = {
  /** Count only, write nothing (and add no guard). */
  dryRun?: boolean;
  batchSize?: number;
  /** Tests: only these rows. */
  listingIds?: readonly string[];
  bookingIds?: readonly string[];
  /** Add the CHECK constraints once no plain value is left (default true; never in a dry run). */
  installGuard?: boolean;
  /** Tests: another keyring (rotation); default: the server's (FIELD_ENCRYPTION_KEY…). */
  keyring?: FieldKeyring;
};

export type TableReport = {
  /** Rows written (or, in a dry run, that would be). */
  changed: number;
  /** Plain values moved into an encrypted column. */
  sealed: number;
  /** Encrypted values re-sealed with the current key (rotation) or given a lookup value. */
  resealed: number;
  /** Plain copies emptied because an encrypted value was already there, or the copy was empty or half a pin. */
  cleared: number;
  /** Encrypted values that could not be opened: left untouched (see the report). */
  unreadable: number;
  /** Rows skipped because they changed while the script ran (the next run picks them up). */
  skipped: number;
};

export type EncryptFieldsReport = {
  dryRun: boolean;
  keyId: string;
  listings: TableReport;
  bookings: TableReport;
  /** Plain values still in the database after this run. */
  remainingPlain: { listings: number; bookings: number };
  /** Encrypted values under another key after this run. */
  remainingOldKey: { listings: number; bookings: number };
  guard: { listing: boolean; booking: boolean };
};

export const LISTING_GUARD = "Listing_no_plain_location";
export const BOOKING_GUARD = "Booking_no_plain_guest_phone";
const DEFAULT_BATCH = 200;

const emptyReport = (): TableReport => ({ changed: 0, sealed: 0, resealed: 0, cleared: 0, unreadable: 0, skipped: 0 });

type ListingRow = { id: string; address: string | null; lat: number | null; lng: number | null; addressEnc: string | null; pinEnc: string | null };
type BookingRow = { id: string; guestPhone: string | null; guestPhoneEnc: string | null; guestPhoneLookup: string | null };

/** Opens and re-seals `stored` when an old key sealed it; "unreadable" when it cannot be opened. */
function resealIfOld(ring: FieldKeyring, purpose: "listing.address" | "listing.pin" | "booking.guestPhone", stored: string): { value: string; plain: string; changed: boolean } | "unreadable" {
  try {
    const plain = openField(ring, purpose, stored);
    if (purpose === "listing.pin") decodePin(plain);
    if (!sealedWithOldKey(ring, stored)) return { value: stored, plain, changed: false };
    return { value: sealField(ring, purpose, plain), plain, changed: true };
  } catch (error) {
    if (isFieldCryptoError(error)) return "unreadable";
    throw error;
  }
}

const idFilter = (ids: readonly string[] | undefined, index: number) => (ids ? ` AND "id" = ANY($${index}::text[])` : "");

async function migrateListings(client: RawSqlClient, ring: FieldKeyring, options: EncryptFieldsOptions, report: TableReport) {
  const batch = options.batchSize ?? DEFAULT_BATCH;
  const current = `fe1:${ring.current.id}:%`;
  let cursor = "";
  for (;;) {
    const rows = await client.$queryRawUnsafe<ListingRow[]>(
      `SELECT "id", "address", "lat", "lng", "addressEnc", "pinEnc" FROM "Listing"
       WHERE "id" > $1
         AND ("address" IS NOT NULL OR "lat" IS NOT NULL OR "lng" IS NOT NULL
              OR ("addressEnc" IS NOT NULL AND "addressEnc" NOT LIKE $2)
              OR ("pinEnc" IS NOT NULL AND "pinEnc" NOT LIKE $2))${idFilter(options.listingIds, 4)}
       ORDER BY "id" LIMIT $3`,
      cursor,
      current,
      batch,
      ...(options.listingIds ? [[...options.listingIds]] : []),
    );
    if (rows.length === 0) return;
    cursor = rows[rows.length - 1]!.id;
    for (const row of rows) {
      let addressEnc = row.addressEnc;
      let pinEnc = row.pinEnc;
      let sealed = 0;
      let resealed = 0;
      let cleared = 0;
      // A stored value that cannot be opened: the whole row stays as it is (its plain copy too, if
      // any), so nothing is lost; fix the key (FIELD_ENCRYPTION_KEY_PREVIOUS) and run again.
      const address = row.addressEnc ? resealIfOld(ring, "listing.address", row.addressEnc) : null;
      const pin = row.pinEnc ? resealIfOld(ring, "listing.pin", row.pinEnc) : null;
      if (address === "unreadable" || pin === "unreadable") {
        report.unreadable++;
        continue;
      }
      // The address: an encrypted value wins; else the plain one is sealed (an empty one is dropped).
      if (address) {
        if (address.changed) {
          addressEnc = address.value;
          resealed++;
        }
        if (row.address !== null) cleared++;
      } else if (row.address !== null) {
        if (row.address.trim()) {
          addressEnc = sealField(ring, "listing.address", row.address.trim());
          sealed++;
        } else cleared++;
      }
      // The pin: the same, as one value ("lat,lng"); half a pin is not a pin.
      if (pin) {
        if (pin.changed) {
          pinEnc = pin.value;
          resealed++;
        }
        if (row.lat !== null || row.lng !== null) cleared++;
      } else if (row.lat !== null && row.lng !== null) {
        pinEnc = sealField(ring, "listing.pin", encodePin({ lat: row.lat, lng: row.lng }));
        sealed++;
      } else if (row.lat !== null || row.lng !== null) {
        cleared++;
      }
      const plainLeft = row.address !== null || row.lat !== null || row.lng !== null;
      const encChanged = addressEnc !== row.addressEnc || pinEnc !== row.pinEnc;
      if (!plainLeft && !encChanged) continue;
      if (!options.dryRun) {
        const count = await client.$executeRawUnsafe(
          `UPDATE "Listing" SET "addressEnc" = $2, "pinEnc" = $3, "address" = NULL, "lat" = NULL, "lng" = NULL
           WHERE "id" = $1
             AND "addressEnc" IS NOT DISTINCT FROM $4 AND "pinEnc" IS NOT DISTINCT FROM $5
             AND "address" IS NOT DISTINCT FROM $6 AND "lat" IS NOT DISTINCT FROM $7::double precision AND "lng" IS NOT DISTINCT FROM $8::double precision`,
          row.id,
          addressEnc,
          pinEnc,
          row.addressEnc,
          row.pinEnc,
          row.address,
          row.lat,
          row.lng,
        );
        if (count === 0) {
          report.skipped++;
          continue;
        }
      }
      report.changed++;
      report.sealed += sealed;
      report.resealed += resealed;
      report.cleared += cleared;
    }
  }
}

async function migrateBookings(client: RawSqlClient, ring: FieldKeyring, options: EncryptFieldsOptions, report: TableReport) {
  const batch = options.batchSize ?? DEFAULT_BATCH;
  const current = `fe1:${ring.current.id}:%`;
  const currentLookup = `fl1:${ring.current.id}:%`;
  let cursor = "";
  for (;;) {
    const rows = await client.$queryRawUnsafe<BookingRow[]>(
      `SELECT "id", "guestPhone", "guestPhoneEnc", "guestPhoneLookup" FROM "Booking"
       WHERE "id" > $1
         AND ("guestPhone" IS NOT NULL
              OR ("guestPhoneEnc" IS NOT NULL AND ("guestPhoneEnc" NOT LIKE $2 OR "guestPhoneLookup" IS NULL OR "guestPhoneLookup" NOT LIKE $3))
              OR ("guestPhoneEnc" IS NULL AND "guestPhoneLookup" IS NOT NULL))${idFilter(options.bookingIds, 5)}
       ORDER BY "id" LIMIT $4`,
      cursor,
      current,
      currentLookup,
      batch,
      ...(options.bookingIds ? [[...options.bookingIds]] : []),
    );
    if (rows.length === 0) return;
    cursor = rows[rows.length - 1]!.id;
    for (const row of rows) {
      let enc = row.guestPhoneEnc;
      let lookup = row.guestPhoneLookup;
      let sealed = 0;
      let resealed = 0;
      let cleared = 0;
      if (row.guestPhoneEnc) {
        const result = resealIfOld(ring, "booking.guestPhone", row.guestPhoneEnc);
        // Cannot be opened: left as it is (with its plain copy, if any), counted in the report.
        if (result === "unreadable") {
          report.unreadable++;
          continue;
        }
        const nextLookup = fieldLookup(ring, "booking.guestPhone", result.plain);
        if (result.changed || nextLookup !== row.guestPhoneLookup) resealed++;
        enc = result.value;
        lookup = nextLookup;
        if (row.guestPhone !== null) cleared++;
      } else if (row.guestPhone !== null && row.guestPhone.trim()) {
        enc = sealField(ring, "booking.guestPhone", row.guestPhone.trim());
        lookup = fieldLookup(ring, "booking.guestPhone", row.guestPhone.trim());
        sealed++;
      } else {
        // Erased ("") or a lookup without a phone: nothing to keep.
        lookup = null;
        cleared++;
      }
      const plainLeft = row.guestPhone !== null;
      const changed = enc !== row.guestPhoneEnc || lookup !== row.guestPhoneLookup;
      if (!plainLeft && !changed) continue;
      if (!options.dryRun) {
        const count = await client.$executeRawUnsafe(
          `UPDATE "Booking" SET "guestPhoneEnc" = $2, "guestPhoneLookup" = $3, "guestPhone" = NULL
           WHERE "id" = $1 AND "guestPhoneEnc" IS NOT DISTINCT FROM $4 AND "guestPhoneLookup" IS NOT DISTINCT FROM $5 AND "guestPhone" IS NOT DISTINCT FROM $6`,
          row.id,
          enc,
          lookup,
          row.guestPhoneEnc,
          row.guestPhoneLookup,
          row.guestPhone,
        );
        if (count === 0) {
          report.skipped++;
          continue;
        }
      }
      report.changed++;
      report.sealed += sealed;
      report.resealed += resealed;
      report.cleared += cleared;
    }
  }
}

async function count(client: RawSqlClient, sql: string, ...values: unknown[]): Promise<number> {
  const [row] = await client.$queryRawUnsafe<{ n: bigint | number }[]>(sql, ...values);
  return Number(row?.n ?? 0);
}

async function hasConstraint(client: RawSqlClient, name: string): Promise<boolean> {
  return (await count(client, `SELECT COUNT(*)::bigint AS n FROM pg_constraint WHERE conname = $1`, name)) > 0;
}

/** The plain columns must be nullable (the new schema is pushed) before anything is moved. */
async function assertSchemaPushed(client: RawSqlClient): Promise<void> {
  const rows = await client.$queryRawUnsafe<{ table_name: string; column_name: string; is_nullable: string }[]>(
    `SELECT table_name, column_name, is_nullable FROM information_schema.columns
     WHERE table_schema = current_schema() AND ((table_name = 'Listing' AND column_name IN ('addressEnc', 'pinEnc'))
        OR (table_name = 'Booking' AND column_name IN ('guestPhone', 'guestPhoneEnc', 'guestPhoneLookup')))`,
  );
  const names = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  const missing = ["Listing.addressEnc", "Listing.pinEnc", "Booking.guestPhoneEnc", "Booking.guestPhoneLookup"].filter((n) => !names.has(n));
  const phone = rows.find((r) => r.table_name === "Booking" && r.column_name === "guestPhone");
  if (missing.length || (phone && phone.is_nullable !== "YES")) {
    throw new Error(`The database does not have the encrypted columns yet (${missing.join(", ") || "Booking.guestPhone is NOT NULL"}): run prisma db push first.`);
  }
}

export async function encryptPlainFields(client: RawSqlClient, options: EncryptFieldsOptions = {}): Promise<EncryptFieldsReport> {
  const ring = options.keyring ?? fieldKeyring();
  await assertSchemaPushed(client);
  const listings = emptyReport();
  const bookings = emptyReport();
  await migrateListings(client, ring, options, listings);
  await migrateBookings(client, ring, options, bookings);

  const current = `fe1:${ring.current.id}:%`;
  const remainingPlain = {
    listings: await count(client, `SELECT COUNT(*)::bigint AS n FROM "Listing" WHERE "address" IS NOT NULL OR "lat" IS NOT NULL OR "lng" IS NOT NULL`),
    bookings: await count(client, `SELECT COUNT(*)::bigint AS n FROM "Booking" WHERE "guestPhone" IS NOT NULL`),
  };
  const remainingOldKey = {
    listings: await count(
      client,
      `SELECT COUNT(*)::bigint AS n FROM "Listing" WHERE ("addressEnc" IS NOT NULL AND "addressEnc" NOT LIKE $1) OR ("pinEnc" IS NOT NULL AND "pinEnc" NOT LIKE $1)`,
      current,
    ),
    bookings: await count(client, `SELECT COUNT(*)::bigint AS n FROM "Booking" WHERE "guestPhoneEnc" IS NOT NULL AND "guestPhoneEnc" NOT LIKE $1`, current),
  };

  // The database refuses plain values from now on (only once none is left: else the CHECK fails).
  if (!options.dryRun && options.installGuard !== false) {
    if (remainingPlain.listings === 0 && !(await hasConstraint(client, LISTING_GUARD))) {
      await client.$executeRawUnsafe(
        `ALTER TABLE "Listing" ADD CONSTRAINT "${LISTING_GUARD}" CHECK ("address" IS NULL AND "lat" IS NULL AND "lng" IS NULL)`,
      );
    }
    if (remainingPlain.bookings === 0 && !(await hasConstraint(client, BOOKING_GUARD))) {
      await client.$executeRawUnsafe(`ALTER TABLE "Booking" ADD CONSTRAINT "${BOOKING_GUARD}" CHECK ("guestPhone" IS NULL)`);
    }
  }
  return {
    dryRun: !!options.dryRun,
    keyId: ring.current.id,
    listings,
    bookings,
    remainingPlain,
    remainingOldKey,
    guard: { listing: await hasConstraint(client, LISTING_GUARD), booking: await hasConstraint(client, BOOKING_GUARD) },
  };
}
