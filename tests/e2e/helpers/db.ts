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

/** Runs `fn` while holding a Postgres advisory lock: one worker at a time (e.g. the admin's 2-step login). */
export async function withAdvisoryLock<T>(key: number, fn: () => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [key]);
    return await fn();
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [key]).catch(() => undefined);
    client.release();
  }
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
      [newId(), id, `/photos/cities/${citySlug}.webp`, i, i === 0, `E2E photo ${i + 1}`],
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
type ViewRow = { userId: string; listingId: string; viewedAt: Date };
export type CounterSnapshot = { listings: CounterRow[]; stats: StatRow[]; contactTaps: string[]; demoViews: ViewRow[]; startedAt: Date };

export async function snapshotCounters(): Promise<CounterSnapshot> {
  const listings = await sql<CounterRow>(`SELECT id, "viewCount", "contactCount", "saveCount", "reportCount" FROM "Listing"`);
  const stats = await sql<StatRow>(
    `SELECT "listingId", to_char(date, 'YYYY-MM-DD') AS date, views, contacts, saves, "contactsByChannel" FROM "ListingStatDaily"
     WHERE date >= current_date - 2`,
  );
  // Contact taps no longer name who tapped (round 3), so the run's taps on demo listings are found
  // as the anonymous rows that were not there before it.
  const taps = await sql<{ id: string }>(`SELECT id FROM "ContactClick" WHERE "userId" IS NULL`);
  // The demo users' "Recently viewed" in their accounts (round 3): a test that signs in as the demo
  // guest and opens a listing writes a row there; the teardown puts the list back as it was.
  const demoViews = await sql<ViewRow>(
    `SELECT "userId", "listingId", "viewedAt" FROM "RecentlyViewed" WHERE "userId" IN (SELECT id FROM "User" WHERE "isDemo")`,
  );
  return { listings, stats, contactTaps: taps.map((t) => t.id), demoViews, startedAt: new Date() };
}

export async function restoreCounters(snapshot: CounterSnapshot) {
  await sql(
    `DELETE FROM "ContactClick" WHERE "userId" IS NULL AND id <> ALL($1::text[]) AND "listingId" IN (SELECT id FROM "Listing" WHERE "isDemo")`,
    [snapshot.contactTaps],
  );
  for (const row of snapshot.listings) {
    await sql(
      `UPDATE "Listing" SET "viewCount" = $2, "contactCount" = $3, "saveCount" = $4, "reportCount" = $5
       WHERE id = $1 AND ("viewCount", "contactCount", "saveCount", "reportCount") IS DISTINCT FROM ($2, $3, $4, $5)`,
      [row.id, row.viewCount, row.contactCount, row.saveCount, row.reportCount],
    );
  }
  await sql(`DELETE FROM "RecentlyViewed" WHERE "userId" IN (SELECT id FROM "User" WHERE "isDemo")`);
  for (const row of snapshot.demoViews) {
    await sql(
      `INSERT INTO "RecentlyViewed" (id, "userId", "listingId", "viewedAt") VALUES ($1, $2, $3, $4)
       ON CONFLICT ("userId", "listingId") DO UPDATE SET "viewedAt" = EXCLUDED."viewedAt"`,
      [newId(), row.userId, row.listingId, row.viewedAt],
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
  // Bookings the tests made (the demo guest's included: their message to the host starts with "E2E ").
  const bookings = await sql<{ id: string; code: string }>(
    `SELECT id, code FROM "Booking" WHERE "guestUserId" = ANY($1) OR "listingId" = ANY($2) OR "messageToHost" LIKE 'E2E %'`,
    [userIds, listingIds],
  );
  const bookingIds = bookings.map((b) => b.id);
  // Reviews of test stays (they go with their booking, listing or user; their reports and the
  // staff's hide/show audit rows are removed here too).
  const reviews = await sql<{ id: string; listingId: string }>(
    `SELECT id, "listingId" FROM "Review" WHERE "bookingId" = ANY($1) OR "listingId" = ANY($2) OR "guestUserId" = ANY($3) OR "hostUserId" = ANY($3)`,
    [bookingIds, listingIds, userIds],
  );
  const reviewIds = reviews.map((r) => r.id);
  const reports = await sql<{ id: string }>(`SELECT id FROM "Report" WHERE "reporterId" = ANY($1) OR "listingId" = ANY($2) OR "reviewId" = ANY($3)`, [
    userIds,
    listingIds,
    reviewIds,
  ]);
  const targetIds = [...userIds, ...listingIds, ...ticketIds, ...reports.map((r) => r.id), ...bookingIds, ...reviewIds];

  await sql(`DELETE FROM "AuditLog" WHERE "targetId" = ANY($1) OR "actorId" = ANY($2)`, [targetIds, userIds]);
  if (bookings.length > 0) {
    // Their emails (confirmation, new booking, cancellation) name the booking code.
    await sql(`DELETE FROM "EmailOutbox" WHERE template LIKE 'booking_%' AND EXISTS (SELECT 1 FROM unnest($1::text[]) c WHERE html LIKE '%' || c || '%')`, [
      bookings.map((b) => b.code),
    ]);
    await sql(`DELETE FROM "AvailabilityBlock" WHERE "bookingId" = ANY($1)`, [bookingIds]);
    await sql(`DELETE FROM "Booking" WHERE id = ANY($1)`, [bookingIds]);
  }
  await sql(`DELETE FROM "Ticket" WHERE id = ANY($1)`, [ticketIds]);
  await sql(`DELETE FROM "Report" WHERE id = ANY($1)`, [reports.map((r) => r.id)]);
  await sql(`DELETE FROM "Review" WHERE id = ANY($1)`, [reviewIds]);
  // A test review on a listing that stays (a demo one): its counters again match its visible reviews.
  const kept = [...new Set(reviews.map((r) => r.listingId))].filter((id) => !listingIds.includes(id));
  if (kept.length > 0) {
    await sql(
      `UPDATE "Listing" l SET "reviewCount" = (SELECT count(*) FROM "Review" r WHERE r."listingId" = l.id AND NOT r.hidden),
         "ratingSum" = (SELECT coalesce(sum(r.rating), 0) FROM "Review" r WHERE r."listingId" = l.id AND NOT r.hidden) WHERE l.id = ANY($1)`,
      [kept],
    );
  }
  // Reference prices the test admin added (round 3; the table holds no real data in development).
  await sql(`DELETE FROM "ReferencePrice" WHERE "createdById" = ANY($1) OR "sourceName" LIKE 'E2E %'`, [userIds]);
  // Private uploads of test users (report screenshots, ticket images): the rows and the files.
  await sql(`DELETE FROM "PrivateUpload" WHERE "userId" = ANY($1)`, [userIds]);
  await sql(`DELETE FROM "ContactClick" WHERE "userId" = ANY($1)`, [userIds]);
  await sql(`DELETE FROM "EmailOutbox" WHERE "to" = ANY($1) OR "to" LIKE $2`, [users.map((u) => u.email), `%@${TEST_EMAIL_DOMAIN}`]);
  await sql(`DELETE FROM "Verification" WHERE identifier LIKE $1 OR identifier LIKE $2`, [`${TEST_PHONE_PREFIX}%`, `%@${TEST_EMAIL_DOMAIN}`]);
  // 2-step login rows of test accounts (the test admin's last accepted code, a pending set-up).
  await sql(`DELETE FROM "Verification" WHERE identifier = ANY($1)`, [userIds.flatMap((id) => [`totp-last:${id}`, `totp-enroll:${id}`])]);
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
    `DELETE FROM "RateLimit" WHERE key LIKE 'auth:otp-%' OR key LIKE 'auth:email-otp-%' OR key LIKE 'ticket:contact%' OR key LIKE 'admin:%' OR key LIKE 'booking:%'
       OR key LIKE 'contact-reveal:listing:%' OR key LIKE 'auth:totp:%' OR EXISTS (SELECT 1 FROM unnest($1::text[]) u WHERE key LIKE '%' || u || '%')`,
    // (Test listings' keys too, e.g. the founder's "listing waits for review" email window.)
    [[...userIds, ...listingIds]],
  );
  // Uploaded photos of test listings (local storage driver).
  const root = process.env.STORAGE_LOCAL_DIR ?? path.join(process.cwd(), "storage");
  for (const id of listingIds) {
    for (const visibility of ["public", "private"]) {
      fs.rmSync(path.join(root, visibility, "listings", id), { recursive: true, force: true });
    }
  }
  // Private files of test users: private/<purpose>/<userId>/… (src/app/api/uploads/private).
  for (const id of userIds) {
    for (const purpose of ["report", "ticket", "verification"]) {
      fs.rmSync(path.join(root, "private", "private", purpose, id), { recursive: true, force: true });
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
  // A report from the site links the reporter's device; auto-hide counts one report per device.
  await sql(
    `INSERT INTO "DeviceLink" (id, "deviceHash", "userId") VALUES ($1, $2, $3) ON CONFLICT ("deviceHash", "userId") DO NOTHING`,
    [newId(), `e2e-device-${opts.reporterId}`, opts.reporterId],
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
