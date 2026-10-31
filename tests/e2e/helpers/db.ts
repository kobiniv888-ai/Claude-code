/**
 * Direct database access for the end-to-end tests: set up test rows and clean them up again.
 *
 * Everything the tests create belongs to a test user (phone +995 555 99x xxx, e-mail
 * …@e2e.bayit.invalid) or is named "E2E …", so cleanupTestData() can find and delete it.
 * Uses `pg` directly (no Prisma client), with DATABASE_URL from .env.
 */
import "dotenv/config";
import { randomBytes, randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { E2E_USER_AGENT_TAG } from "./env";

export const TEST_PHONE_PREFIX = "+99555599";
export const TEST_EMAIL_DOMAIN = "e2e.bayit.invalid";
export { E2E_USER_AGENT_TAG };

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set (.env)");
    const host = new URL(connectionString).hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.E2E_ALLOW_REMOTE_DB !== "true") {
      throw new Error(`Refusing to run end-to-end tests against a non-local database (${host})`);
    }
    pool = new pg.Pool({ connectionString, max: 3 });
  }
  return pool;
}

export async function sql<T extends pg.QueryResultRow = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function closeDb() {
  await pool?.end();
  pool = null;
}

/** A cuid-like id (lowercase letters and digits). */
export function newId(): string {
  return `e2e${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

/** A phone number no user has yet: +995 555 99x xxx. */
export async function freshPhone(): Promise<string> {
  for (;;) {
    const phone = `${TEST_PHONE_PREFIX}${String(randomInt(0, 10_000)).padStart(4, "0")}`;
    const rows = await sql(`SELECT 1 FROM "User" WHERE "phoneNumber" = $1`, [phone]);
    if (rows.length === 0) return phone;
  }
}

export async function userIdByPhone(phone: string): Promise<string> {
  const rows = await sql<{ id: string }>(`SELECT id FROM "User" WHERE "phoneNumber" = $1`, [phone]);
  if (!rows[0]) throw new Error(`No user with phone ${phone}`);
  return rows[0].id;
}

/** A verified test user created directly in the database (log in with loginByPhone). */
export async function createTestUser(opts: { name?: string; role?: string } = {}): Promise<{ id: string; phone: string; name: string }> {
  const id = newId();
  const phone = await freshPhone();
  const name = opts.name ?? `E2E User ${phone.slice(-4)}`;
  await sql(
    `INSERT INTO "User" (id, name, email, "emailVerified", "phoneNumber", "phoneNumberVerified", role, locale, "updatedAt")
     VALUES ($1, $2, $3, false, $4, true, $5::"UserRole", 'en', now())`,
    [id, name, `${phone.slice(1)}@${TEST_EMAIL_DOMAIN}`, phone, opts.role ?? "USER"],
  );
  return { id, phone, name };
}

export type TestListingOptions = {
  ownerId: string;
  title: string;
  description?: string;
  status?: "DRAFT" | "IN_REVIEW" | "LIVE";
  citySlug?: string;
  /** Number of photo rows (local placeholder images). */
  photos?: number;
};

/**
 * A complete listing copied from a demo short stay (publicId 113), owned by a test user,
 * in Mestia (no demo listings there, so search tests are not affected).
 */
export async function createTestListing(opts: TestListingOptions): Promise<{ id: string; publicId: number }> {
  const { ownerId, title, status = "LIVE", citySlug = "mestia", photos = 5 } = opts;
  const description =
    opts.description ??
    "E2E test listing: a quiet studio with a mountain view, a full kitchen and a small balcony. Created by the end-to-end tests.";
  const [city] = await sql<{ id: string; lat: number; lng: number }>(`SELECT id, lat, lng FROM "City" WHERE slug = $1`, [citySlug]);
  if (!city) throw new Error(`No city ${citySlug}`);
  const [source] = await sql<{ id: string }>(`SELECT id FROM "Listing" WHERE "publicId" = 113`);
  if (!source) throw new Error("Demo listing 113 is missing — run npm run db:seed");

  const overrides: Record<string, string> = {
    id: "$1",
    ownerId: "$2",
    status: `$3::"ListingStatus"`,
    title: "$4",
    description: "$5",
    searchText: "lower($4)",
    cityId: "$6",
    neighborhoodId: "NULL",
    lat: "$7",
    lng: "$8",
    approxLat: "$7",
    approxLng: "$8",
    originalLocale: `'en'`,
    icalToken: "$9",
    isDemo: "false",
    viewCount: "0",
    contactCount: "0",
    saveCount: "0",
    reportCount: "0",
    riskScore: "NULL",
    riskReasons: "NULL",
    featuredUntil: "NULL",
    bumpedAt: "NULL",
    previousPrice: "NULL",
    priceDroppedAt: "NULL",
    reviewedAt: "NULL",
    reviewedById: "NULL",
    moderationReason: "NULL",
    moderationNote: "NULL",
    rulesAcceptedAt: status === "DRAFT" ? "NULL" : "now()",
    publishedAt: status === "LIVE" ? "now()" : "NULL",
    expiresAt: status === "LIVE" ? "now() + interval '60 days'" : "NULL",
    wizardStep: status === "DRAFT" ? "10" : `"wizardStep"`,
    createdAt: "now()",
    updatedAt: "now()",
    contentUpdatedAt: "now()",
    deletedAt: "NULL",
  };
  const columns = await sql<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'Listing' AND column_name <> 'publicId'`,
  );
  const names = columns.map((c) => c.column_name);
  const select = names.map((name) => overrides[name] ?? `"${name}"`);
  const id = newId();
  await sql(
    `INSERT INTO "Listing" (${names.map((n) => `"${n}"`).join(", ")})
     SELECT ${select.join(", ")} FROM "Listing" WHERE id = $10`,
    [id, ownerId, status, title, description, city.id, city.lat, city.lng, newId(), source.id],
  );
  for (let i = 0; i < photos; i += 1) {
    await sql(
      `INSERT INTO "ListingPhoto" (id, "listingId", url, width, height, "sortOrder", "isCover", alt)
       VALUES ($1, $2, $3, 1200, 800, $4, $5, $6)`,
      [newId(), id, `/images/cities/${citySlug}.webp`, i, i === 0, `E2E photo ${i + 1}`],
    );
  }
  const [row] = await sql<{ publicId: number }>(`SELECT "publicId" FROM "Listing" WHERE id = $1`, [id]);
  return { id, publicId: row.publicId };
}

export async function listingByPublicId(publicId: number) {
  const [row] = await sql<{
    id: string;
    status: string;
    riskScore: number | null;
    riskReasons: { code: string; points: number; detail?: string }[] | null;
    moderationReason: string | null;
    moderationNote: string | null;
    title: string;
  }>(`SELECT id, status, "riskScore", "riskReasons", "moderationReason", "moderationNote", title FROM "Listing" WHERE "publicId" = $1`, [
    publicId,
  ]);
  return row;
}

// ── Snapshot of demo counters (views, contacts, saves) so a test run leaves no trace ──

type CounterRow = { id: string; viewCount: number; contactCount: number; saveCount: number; reportCount: number };
type StatRow = { listingId: string; date: string; views: number; contacts: number; saves: number; contactsByChannel: unknown };
export type CounterSnapshot = { listings: CounterRow[]; stats: StatRow[]; startedAt: Date };

export async function snapshotCounters(): Promise<CounterSnapshot> {
  const listings = await sql<CounterRow>(`SELECT id, "viewCount", "contactCount", "saveCount", "reportCount" FROM "Listing"`);
  const stats = await sql<StatRow>(
    `SELECT "listingId", to_char(date, 'YYYY-MM-DD') AS date, views, contacts, saves, "contactsByChannel" FROM "ListingStatDaily"
     WHERE date >= current_date - 2`,
  );
  return { listings, stats, startedAt: new Date() };
}

export async function restoreCounters(snapshot: CounterSnapshot) {
  for (const row of snapshot.listings) {
    await sql(
      `UPDATE "Listing" SET "viewCount" = $2, "contactCount" = $3, "saveCount" = $4, "reportCount" = $5
       WHERE id = $1 AND ("viewCount", "contactCount", "saveCount", "reportCount") IS DISTINCT FROM ($2, $3, $4, $5)`,
      [row.id, row.viewCount, row.contactCount, row.saveCount, row.reportCount],
    );
  }
  const known = new Set(snapshot.listings.map((l) => l.id));
  const before = new Map(snapshot.stats.map((s) => [`${s.listingId}|${s.date}`, s]));
  const now = await sql<StatRow>(
    `SELECT "listingId", to_char(date, 'YYYY-MM-DD') AS date, views, contacts, saves, "contactsByChannel" FROM "ListingStatDaily"
     WHERE date >= current_date - 2`,
  );
  for (const row of now) {
    if (!known.has(row.listingId)) continue;
    const old = before.get(`${row.listingId}|${row.date}`);
    if (!old) {
      await sql(`DELETE FROM "ListingStatDaily" WHERE "listingId" = $1 AND date = $2::date`, [row.listingId, row.date]);
    } else if (old.views !== row.views || old.contacts !== row.contacts || old.saves !== row.saves) {
      await sql(
        `UPDATE "ListingStatDaily" SET views = $3, contacts = $4, saves = $5, "contactsByChannel" = $6 WHERE "listingId" = $1 AND date = $2::date`,
        [row.listingId, row.date, old.views, old.contacts, old.saves, old.contactsByChannel === null ? null : JSON.stringify(old.contactsByChannel)],
      );
    }
  }
}

// ── Cleanup ──

/** Deletes every row the tests created (test users and everything that belongs to them). */
export async function cleanupTestData(opts: { since?: Date } = {}) {
  const users = await sql<{ id: string; email: string }>(
    `SELECT id, email FROM "User" WHERE "phoneNumber" LIKE $1 OR email LIKE $2`,
    [`${TEST_PHONE_PREFIX}%`, `%@${TEST_EMAIL_DOMAIN}`],
  );
  const userIds = users.map((u) => u.id);
  const listings = await sql<{ id: string }>(`SELECT id FROM "Listing" WHERE "ownerId" = ANY($1) OR title LIKE 'E2E %'`, [userIds]);
  const listingIds = listings.map((l) => l.id);
  const tickets = await sql<{ id: string }>(
    `SELECT id FROM "Ticket" WHERE "userId" = ANY($1) OR "guestEmail" LIKE $2 OR subject LIKE 'E2E %'`,
    [userIds, `%@${TEST_EMAIL_DOMAIN}`],
  );
  const ticketIds = tickets.map((t) => t.id);
  const reports = await sql<{ id: string }>(`SELECT id FROM "Report" WHERE "reporterId" = ANY($1) OR "listingId" = ANY($2)`, [
    userIds,
    listingIds,
  ]);
  const targetIds = [...userIds, ...listingIds, ...ticketIds, ...reports.map((r) => r.id)];

  await sql(`DELETE FROM "AuditLog" WHERE "targetId" = ANY($1) OR "actorId" = ANY($2)`, [targetIds, userIds]);
  await sql(`DELETE FROM "Ticket" WHERE id = ANY($1)`, [ticketIds]);
  await sql(`DELETE FROM "Report" WHERE id = ANY($1)`, [reports.map((r) => r.id)]);
  await sql(`DELETE FROM "ContactClick" WHERE "userId" = ANY($1)`, [userIds]);
  await sql(`DELETE FROM "EmailOutbox" WHERE "to" = ANY($1) OR "to" LIKE $2`, [users.map((u) => u.email), `%@${TEST_EMAIL_DOMAIN}`]);
  await sql(`DELETE FROM "Verification" WHERE identifier LIKE $1`, [`${TEST_PHONE_PREFIX}%`]);
  await sql(`DELETE FROM "Listing" WHERE id = ANY($1)`, [listingIds]);
  await sql(`DELETE FROM "User" WHERE id = ANY($1)`, [userIds]);
  // Sessions the tests opened for demo users (admin, guest…), recognised by the user agent.
  await sql(`DELETE FROM "Session" WHERE "userAgent" LIKE $1`, [`%${E2E_USER_AGENT_TAG}%`]);
  if (opts.since) {
    await sql(
      `DELETE FROM "DeviceLink" WHERE "firstSeenAt" >= $1 AND "userId" IN (SELECT id FROM "User" WHERE "isDemo")`,
      [opts.since],
    );
  }
  // Rate-limit windows the tests filled (login codes, contact form, staff actions, per-user keys).
  await sql(
    `DELETE FROM "RateLimit" WHERE key LIKE 'auth:otp-%' OR key LIKE 'ticket:contact%' OR key LIKE 'admin:%'
       OR key LIKE 'contact-reveal:listing:%' OR key LIKE 'auth:totp:%' OR EXISTS (SELECT 1 FROM unnest($1::text[]) u WHERE key LIKE '%' || u || '%')`,
    [userIds],
  );
  // Uploaded photos of test listings (local storage driver).
  const root = process.env.STORAGE_LOCAL_DIR ?? path.join(process.cwd(), "storage");
  for (const id of listingIds) {
    for (const visibility of ["public", "private"]) {
      fs.rmSync(path.join(root, visibility, "listings", id), { recursive: true, force: true });
    }
  }
  return { users: userIds.length, listings: listingIds.length, tickets: ticketIds.length };
}

/** An OPEN report on a listing, as if `reporterId` had sent it. */
export async function createReport(opts: { listingId: string; reporterId: string; reason?: string; details?: string }) {
  const id = newId();
  await sql(
    `INSERT INTO "Report" (id, "targetType", "listingId", "reporterId", reason, details) VALUES ($1, 'LISTING', $2, $3, $4::"ReportReason", $5)`,
    [id, opts.listingId, opts.reporterId, opts.reason ?? "FAKE_LISTING", opts.details ?? "E2E report"],
  );
  return id;
}

/** A support ticket from a user, with their first message. */
export async function createTicket(opts: { userId: string; subject: string; body: string }) {
  const id = newId();
  await sql(
    `INSERT INTO "Ticket" (id, "userId", category, subject, locale, "updatedAt") VALUES ($1, $2, 'TECHNICAL', $3, 'en', now())`,
    [id, opts.userId, opts.subject],
  );
  await sql(`INSERT INTO "TicketMessage" (id, "ticketId", "authorId", body) VALUES ($1, $2, $3, $4)`, [newId(), id, opts.userId, opts.body]);
  const [row] = await sql<{ number: number }>(`SELECT number FROM "Ticket" WHERE id = $1`, [id]);
  return { id, number: row.number };
}
