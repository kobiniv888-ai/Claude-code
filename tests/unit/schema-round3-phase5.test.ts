/**
 * Round 3, phase 5 database changes against the local database (DATABASE_URL in .env, pushed with
 * prisma/sql/before-push.sql + prisma db push): the new Review, SavedList and SavedSearch tables,
 * the Report → Review relation, the new Listing and Favorite columns, their defaults, the unique
 * booking (one review per booking) and share token, what is removed or kept when a booking,
 * listing, user, list or review goes, the timestamp columns and the new indexes. Creates its own
 * users, city, listings and bookings (fake @example.com addresses, phones in the e2e test range)
 * and removes them afterwards.
 *
 * The before-push.sql step (a report whose reviewId points to no review gets NULL, before the
 * push adds the foreign key) runs on a throwaway database of its own, never on the shared tables.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Prisma as PrismaTypes } from "@/generated/prisma/client";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { Prisma } = await import("@/generated/prisma/client");

const prefix = `p5s${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { host: `${prefix}-host`, guest: `${prefix}-guest`, other: `${prefix}-other`, city: "", listing: "", hotel: "" };
const names = { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" };
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** Reports outlive their reviews (SetNull), so they are removed by id. */
const reportIds: string[] = [];
let seq = 0;

async function createUser(id: string) {
  return db.user.create({ data: { id, name: "Test", email: `${id}@example.com` } });
}

function createBooking(data: Partial<PrismaTypes.BookingUncheckedCreateInput> = {}) {
  seq += 1;
  return db.booking.create({
    data: {
      code: `${prefix}-${seq}`.toUpperCase(),
      listingId: ids.listing,
      guestUserId: ids.guest,
      hostUserId: ids.host,
      checkIn: day("2026-10-01"),
      checkOut: day("2026-10-04"),
      nights: 3,
      adults: 2,
      nightlyPrice: new Prisma.Decimal(55),
      subtotal: new Prisma.Decimal(165),
      total: new Prisma.Decimal(165),
      currency: "GEL",
      cancellationPolicy: "MODERATE",
      status: "COMPLETED",
      guestName: "Guest",
      guestPhone: "+995555990501",
      locale: "he",
      rulesAcceptedAt: new Date(),
      ...data,
    },
  });
}

function reviewData(booking: { id: string; listingId: string; guestUserId: string; hostUserId: string }, data: Partial<PrismaTypes.ReviewUncheckedCreateInput> = {}) {
  return {
    bookingId: booking.id,
    listingId: booking.listingId,
    guestUserId: booking.guestUserId,
    hostUserId: booking.hostUserId,
    rating: 5,
    text: "דירה נקייה, מארח נחמד",
    language: "he",
    ...data,
  } satisfies PrismaTypes.ReviewUncheckedCreateInput;
}

async function createReview(data: Partial<PrismaTypes.ReviewUncheckedCreateInput> = {}) {
  const booking = await createBooking();
  return db.review.create({ data: reviewData(booking, data) });
}

async function createReport(data: PrismaTypes.ReportUncheckedCreateInput) {
  const report = await db.report.create({ data });
  reportIds.push(report.id);
  return report;
}

beforeAll(async () => {
  await createUser(ids.host);
  await createUser(ids.guest);
  await createUser(ids.other);
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names, searchText: "city", lat: 41.64, lng: 41.63 } });
  ids.city = city.id;
  const listing = await db.listing.create({
    data: { ownerId: ids.host, status: "DRAFT", dealType: "SHORT_STAY", cityId: city.id, title: "Test flat", currency: "GEL", price: new Prisma.Decimal(55) },
  });
  ids.listing = listing.id;
  const hotel = await db.listing.create({
    data: { ownerId: ids.host, status: "DRAFT", dealType: "SHORT_STAY", propertyType: "HOTEL", cityId: city.id, title: "Test hotel" },
  });
  ids.hotel = hotel.id;
});

afterAll(async () => {
  // Bookings cascade their reviews; listings cascade the rest; users cascade lists and searches.
  await db.report.deleteMany({ where: { id: { in: reportIds } } });
  await db.booking.deleteMany({ where: { hostUserId: ids.host } });
  await db.listing.deleteMany({ where: { ownerId: ids.host } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
});

describe("Listing (walking times and review counters)", () => {
  it("has no walking times and zero review counters by default", async () => {
    const listing = await db.listing.findUniqueOrThrow({ where: { id: ids.listing } });
    expect(listing).toMatchObject({ seaWalkMinutes: null, liftWalkMinutes: null, reviewCount: 0, ratingSum: 0 });
  });

  it("keeps the counters NOT NULL with default 0 in the database", async () => {
    const rows = await db.$queryRaw<{ column_name: string; is_nullable: string; column_default: string | null; data_type: string }[]>`
      SELECT column_name, is_nullable, column_default, data_type FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'Listing'
        AND column_name IN ('seaWalkMinutes', 'liftWalkMinutes', 'reviewCount', 'ratingSum')
      ORDER BY column_name`;
    expect(rows).toEqual([
      { column_name: "liftWalkMinutes", is_nullable: "YES", column_default: null, data_type: "integer" },
      { column_name: "ratingSum", is_nullable: "NO", column_default: "0", data_type: "integer" },
      { column_name: "reviewCount", is_nullable: "NO", column_default: "0", data_type: "integer" },
      { column_name: "seaWalkMinutes", is_nullable: "YES", column_default: null, data_type: "integer" },
    ]);
  });

  it("stores walking times and finds listings within 15 minutes of the sea", async () => {
    const near = await db.listing.create({ data: { ownerId: ids.host, status: "DRAFT", cityId: ids.city, title: "Near", seaWalkMinutes: 6 } });
    await db.listing.create({ data: { ownerId: ids.host, status: "DRAFT", cityId: ids.city, title: "Far", seaWalkMinutes: 22 } });
    const ski = await db.listing.create({ data: { ownerId: ids.host, status: "DRAFT", cityId: ids.city, title: "Ski", liftWalkMinutes: 4 } });
    const close = await db.listing.findMany({ where: { cityId: ids.city, seaWalkMinutes: { lte: 15 } }, select: { id: true } });
    expect(close.map((l) => l.id)).toEqual([near.id]);
    expect(await db.listing.findUniqueOrThrow({ where: { id: ski.id } })).toMatchObject({ seaWalkMinutes: null, liftWalkMinutes: 4 });
    // The pin moved out of town: the value goes back to null.
    expect(await db.listing.update({ where: { id: near.id }, data: { seaWalkMinutes: null } })).toMatchObject({ seaWalkMinutes: null });
  });
});

describe("Review", () => {
  it("has the defaults: visible, no quick ratings, no translations, no reply, no room type", async () => {
    const review = await createReview();
    expect(review).toMatchObject({
      rating: 5,
      language: "he",
      roomTypeId: null,
      cleanliness: null,
      accuracy: null,
      checkIn: null,
      communication: null,
      location: null,
      value: null,
      translations: null,
      hostReply: null,
      hostReplyLanguage: null,
      hostReplyTranslations: null,
      hostReplyAt: null,
      hidden: false,
      hiddenReason: null,
      hiddenAt: null,
      hiddenById: null,
    });
    expect(review.createdAt).toBeInstanceOf(Date);
    expect(review.updatedAt).toBeInstanceOf(Date);
  });

  it("stores the quick ratings, translations, the host's reply and the hidden fields", async () => {
    const translations = { en: "Clean flat, nice host", ru: "Чистая квартира" };
    const review = await createReview({ cleanliness: 4, accuracy: 5, checkIn: 3, communication: 5, location: 2, value: 4, translations });
    expect(review).toMatchObject({ cleanliness: 4, accuracy: 5, checkIn: 3, communication: 5, location: 2, value: 4, translations });
    const repliedAt = new Date("2026-10-20T08:15:30.123Z");
    const replied = await db.review.update({
      where: { id: review.id },
      data: { hostReply: "Thank you!", hostReplyLanguage: "en", hostReplyTranslations: { he: "תודה!" }, hostReplyAt: repliedAt },
    });
    expect(replied).toMatchObject({ hostReply: "Thank you!", hostReplyLanguage: "en", hostReplyTranslations: { he: "תודה!" }, hostReplyAt: repliedAt });
    const hiddenAt = new Date("2026-10-21T23:59:59.999Z");
    const hidden = await db.review.update({ where: { id: review.id }, data: { hidden: true, hiddenReason: "contact details", hiddenAt, hiddenById: "staff-x" } });
    expect(hidden).toMatchObject({ hidden: true, hiddenReason: "contact details", hiddenAt, hiddenById: "staff-x" });
  });

  it("is one per booking (bookingId is unique)", async () => {
    const booking = await createBooking();
    await db.review.create({ data: reviewData(booking) });
    await expect(db.review.create({ data: reviewData(booking, { rating: 1 }) })).rejects.toMatchObject({ code: "P2002" });
    expect(await db.review.count({ where: { bookingId: booking.id } })).toBe(1);
  });

  it("changes the listing's counters in the same transaction: a refused second review changes nothing", async () => {
    const booking = await createBooking();
    const post = (rating: number) =>
      db.$transaction(async (tx) => {
        await tx.review.create({ data: reviewData(booking, { rating }) });
        await tx.listing.update({ where: { id: ids.listing }, data: { reviewCount: { increment: 1 }, ratingSum: { increment: rating } } });
      });
    const before = await db.listing.findUniqueOrThrow({ where: { id: ids.listing }, select: { reviewCount: true, ratingSum: true } });
    await post(4);
    await expect(post(2)).rejects.toMatchObject({ code: "P2002" });
    const after = await db.listing.findUniqueOrThrow({ where: { id: ids.listing }, select: { reviewCount: true, ratingSum: true } });
    expect(after).toEqual({ reviewCount: before.reviewCount + 1, ratingSum: before.ratingSum + 4 });
  });

  it("is reachable from the booking, the listing, the guest and the host", async () => {
    const review = await createReview();
    const booking = await db.booking.findUniqueOrThrow({ where: { id: review.bookingId }, select: { review: { select: { id: true } } } });
    expect(booking.review?.id).toBe(review.id);
    const listing = await db.listing.findUniqueOrThrow({ where: { id: ids.listing }, select: { reviews: { select: { id: true } } } });
    expect(listing.reviews.map((r) => r.id)).toContain(review.id);
    const guest = await db.user.findUniqueOrThrow({ where: { id: ids.guest }, select: { reviewsAsGuest: { select: { id: true } }, reviewsAsHost: { select: { id: true } } } });
    expect(guest.reviewsAsGuest.map((r) => r.id)).toContain(review.id);
    expect(guest.reviewsAsHost).toEqual([]);
    const host = await db.user.findUniqueOrThrow({ where: { id: ids.host }, select: { reviewsAsHost: { select: { id: true } } } });
    expect(host.reviewsAsHost.map((r) => r.id)).toContain(review.id);
  });

  it("keeps the room type as a plain id (no relation: it stays when the room type is removed)", async () => {
    const room = await db.roomType.create({ data: { listingId: ids.hotel, names: { en: "Double" }, price: new Prisma.Decimal(80) } });
    const booking = await createBooking({ listingId: ids.hotel, roomTypeId: room.id });
    const review = await db.review.create({ data: reviewData(booking, { roomTypeId: room.id }) });
    await db.roomType.delete({ where: { id: room.id } });
    expect(await db.review.findUniqueOrThrow({ where: { id: review.id } })).toMatchObject({ roomTypeId: room.id });
  });

  it("lists a listing's visible reviews newest first (listingId, hidden, createdAt)", async () => {
    const listing = await db.listing.create({ data: { ownerId: ids.host, status: "DRAFT", cityId: ids.city, title: "Reviewed" } });
    const older = await db.review.create({ data: reviewData(await createBooking({ listingId: listing.id }), { createdAt: new Date("2026-09-01T10:00:00Z") }) });
    const newer = await db.review.create({ data: reviewData(await createBooking({ listingId: listing.id }), { createdAt: new Date("2026-10-01T10:00:00Z") }) });
    await db.review.create({ data: reviewData(await createBooking({ listingId: listing.id }), { hidden: true, hiddenAt: new Date(), hiddenReason: "rules" }) });
    const visible = await db.review.findMany({ where: { listingId: listing.id, hidden: false }, orderBy: { createdAt: "desc" }, select: { id: true } });
    expect(visible.map((r) => r.id)).toEqual([newer.id, older.id]);
  });
});

describe("what goes with a booking, listing or user, and what stays", () => {
  it("a review goes with its booking", async () => {
    const review = await createReview();
    await db.booking.delete({ where: { id: review.bookingId } });
    expect(await db.review.findUnique({ where: { id: review.id } })).toBeNull();
  });

  it("a review goes with its listing", async () => {
    const listing = await db.listing.create({ data: { ownerId: ids.host, status: "DRAFT", cityId: ids.city, title: "Gone" } });
    const booking = await createBooking({ listingId: listing.id });
    const review = await db.review.create({ data: reviewData(booking) });
    await db.listing.delete({ where: { id: listing.id } });
    expect(await db.review.findUnique({ where: { id: review.id } })).toBeNull();
  });

  it("a review goes with its guest's user row (accounts are anonymized, not deleted, in the app)", async () => {
    const guestId = `${prefix}-guest2`;
    await createUser(guestId);
    // The booking belongs to another guest here, so only the review's own relation is tested.
    const review = await db.review.create({ data: reviewData(await createBooking(), { guestUserId: guestId }) });
    await db.user.delete({ where: { id: guestId } });
    expect(await db.review.findUnique({ where: { id: review.id } })).toBeNull();
  });

  it("a report about a review stays when the review goes (reviewId becomes null)", async () => {
    const review = await createReview();
    const report = await createReport({ targetType: "REVIEW", reviewId: review.id, listingId: ids.listing, reporterId: ids.host, reason: "OFFENSIVE" });
    const viaReview = await db.review.findUniqueOrThrow({ where: { id: review.id }, select: { reports: { select: { id: true } } } });
    expect(viaReview.reports.map((r) => r.id)).toEqual([report.id]);
    const withReview = await db.report.findUniqueOrThrow({ where: { id: report.id }, select: { review: { select: { id: true } } } });
    expect(withReview.review?.id).toBe(review.id);
    await db.booking.delete({ where: { id: review.bookingId } });
    expect(await db.report.findUnique({ where: { id: report.id } })).toMatchObject({ id: report.id, targetType: "REVIEW", reviewId: null, reason: "OFFENSIVE" });
  });

  it("a report cannot point to a review that does not exist", async () => {
    await expect(createReport({ targetType: "REVIEW", reviewId: `${prefix}-nowhere`, reporterId: ids.host, reason: "OFFENSIVE" })).rejects.toMatchObject({ code: "P2003" });
  });

  it("lists and saved searches go with their user", async () => {
    const userId = `${prefix}-leaver`;
    await createUser(userId);
    const list = await db.savedList.create({ data: { userId, name: "שמורים", isDefault: true } });
    const search = await db.savedSearch.create({ data: { userId, name: "Batumi", filters: { city: "batumi" } } });
    const favorite = await db.favorite.create({ data: { userId, listingId: ids.listing, listId: list.id } });
    await db.user.delete({ where: { id: userId } });
    expect(await db.savedList.findUnique({ where: { id: list.id } })).toBeNull();
    expect(await db.savedSearch.findUnique({ where: { id: search.id } })).toBeNull();
    expect(await db.favorite.findUnique({ where: { id: favorite.id } })).toBeNull();
  });

  it("uses these delete rules in the database", async () => {
    const rows = await db.$queryRaw<{ conname: string; confdeltype: string }[]>`
      SELECT conname, confdeltype::text AS confdeltype FROM pg_constraint
      WHERE contype = 'f' AND connamespace = current_schema()::regnamespace
        AND conname IN ('Review_bookingId_fkey', 'Review_listingId_fkey', 'Review_guestUserId_fkey', 'Review_hostUserId_fkey',
                        'Report_reviewId_fkey', 'Favorite_listId_fkey', 'SavedList_userId_fkey', 'SavedSearch_userId_fkey')
      ORDER BY conname`;
    // c = cascade, n = set null.
    expect(Object.fromEntries(rows.map((r) => [r.conname, r.confdeltype]))).toEqual({
      Favorite_listId_fkey: "n",
      Report_reviewId_fkey: "n",
      Review_bookingId_fkey: "c",
      Review_guestUserId_fkey: "c",
      Review_hostUserId_fkey: "c",
      Review_listingId_fkey: "c",
      SavedList_userId_fkey: "c",
      SavedSearch_userId_fkey: "c",
    });
  });
});

describe("SavedList and Favorite (one list per place)", () => {
  it("a list is private and not the default by default", async () => {
    const list = await db.savedList.create({ data: { userId: ids.guest, name: "בטומי באוגוסט" } });
    expect(list).toMatchObject({ isDefault: false, shareToken: null, sharedAt: null, lastUsedAt: null });
    expect(list.createdAt).toBeInstanceOf(Date);
    expect(list.updatedAt).toBeInstanceOf(Date);
  });

  it("share tokens are unique, while any number of lists have none", async () => {
    await db.savedList.create({ data: { userId: ids.guest, name: "A", shareToken: `${prefix}-share`, sharedAt: new Date() } });
    await expect(db.savedList.create({ data: { userId: ids.other, name: "B", shareToken: `${prefix}-share` } })).rejects.toMatchObject({ code: "P2002" });
    await db.savedList.create({ data: { userId: ids.other, name: "C" } });
    await db.savedList.create({ data: { userId: ids.other, name: "D" } });
    expect(await db.savedList.count({ where: { userId: ids.other, shareToken: null } })).toBeGreaterThanOrEqual(2);
    const shared = await db.savedList.findUniqueOrThrow({ where: { shareToken: `${prefix}-share` } });
    expect(shared.sharedAt).toBeInstanceOf(Date);
  });

  it("finds the last list used (userId, lastUsedAt)", async () => {
    const userId = `${prefix}-lister`;
    await createUser(userId);
    await db.savedList.create({ data: { userId, name: "Default", isDefault: true } });
    const used = await db.savedList.create({ data: { userId, name: "Used", lastUsedAt: new Date("2026-11-01T12:00:00Z") } });
    await db.savedList.create({ data: { userId, name: "Earlier", lastUsedAt: new Date("2026-10-01T12:00:00Z") } });
    const last = await db.savedList.findFirst({ where: { userId }, orderBy: { lastUsedAt: { sort: "desc", nulls: "last" } } });
    expect(last?.id).toBe(used.id);
  });

  it("a favorite has no list and no alert price by default, and keeps two decimals", async () => {
    const plain = await db.favorite.create({ data: { userId: ids.other, listingId: ids.hotel } });
    expect(plain).toMatchObject({ listId: null, alertPrice: null, alertCurrency: null, note: null });
    const listing = await db.listing.create({ data: { ownerId: ids.host, status: "DRAFT", cityId: ids.city, title: "Priced" } });
    const priced = await db.favorite.create({
      data: { userId: ids.other, listingId: listing.id, alertPrice: new Prisma.Decimal("165.50"), alertCurrency: "GEL" },
    });
    expect(priced.alertPrice?.toString()).toBe("165.5");
    expect(priced.alertCurrency).toBe("GEL");
    // After a price-drop email the alert price moves down to the new price.
    const lowered = await db.favorite.update({ where: { id: priced.id }, data: { alertPrice: new Prisma.Decimal("149.99") } });
    expect(lowered.alertPrice?.toString()).toBe("149.99");
  });

  it("is still one row per place: choosing another list moves it", async () => {
    const userId = `${prefix}-mover`;
    await createUser(userId);
    const first = await db.savedList.create({ data: { userId, name: "First", isDefault: true } });
    const second = await db.savedList.create({ data: { userId, name: "Second" } });
    const favorite = await db.favorite.create({ data: { userId, listingId: ids.listing, listId: first.id } });
    await expect(db.favorite.create({ data: { userId, listingId: ids.listing, listId: second.id } })).rejects.toMatchObject({ code: "P2002" });
    await db.favorite.update({ where: { userId_listingId: { userId, listingId: ids.listing } }, data: { listId: second.id } });
    const lists = await db.savedList.findMany({ where: { userId }, select: { id: true, favorites: { select: { id: true } } }, orderBy: { name: "asc" } });
    expect(lists).toEqual([
      { id: first.id, favorites: [] },
      { id: second.id, favorites: [{ id: favorite.id }] },
    ]);
  });

  it("deleting a list keeps its places (listId becomes null: the default list, in code)", async () => {
    const userId = `${prefix}-deleter`;
    await createUser(userId);
    const list = await db.savedList.create({ data: { userId, name: "Temporary" } });
    const favorite = await db.favorite.create({ data: { userId, listingId: ids.listing, listId: list.id, alertPrice: new Prisma.Decimal(55), alertCurrency: "GEL" } });
    await db.savedList.delete({ where: { id: list.id } });
    const after = await db.favorite.findUniqueOrThrow({ where: { id: favorite.id } });
    expect(after).toMatchObject({ listId: null, alertCurrency: "GEL" });
    expect(after.alertPrice?.toString()).toBe("55");
  });
});

describe("SavedSearch", () => {
  it("is active with nothing sent by default", async () => {
    const search = await db.savedSearch.create({ data: { userId: ids.guest, name: "Batumi, August", filters: { city: "batumi", deal: "short" } } });
    expect(search).toMatchObject({ active: true, lastSentAt: null, lastCheckedAt: null, lastMatchIds: [], filters: { city: "batumi", deal: "short" } });
    expect(search.createdAt).toBeInstanceOf(Date);
    expect(search.updatedAt).toBeInstanceOf(Date);
  });

  it("stores the listings already sent and finds the searches due for a check (active, lastCheckedAt)", async () => {
    const userId = `${prefix}-searcher`;
    await createUser(userId);
    const due = await db.savedSearch.create({ data: { userId, name: "Never checked", filters: {} } });
    const stale = await db.savedSearch.create({ data: { userId, name: "Stale", filters: {}, lastCheckedAt: new Date("2026-11-01T06:00:00Z") } });
    await db.savedSearch.create({ data: { userId, name: "Fresh", filters: {}, lastCheckedAt: new Date("2026-11-07T06:00:00Z") } });
    await db.savedSearch.create({ data: { userId, name: "Paused", filters: {}, active: false } });
    const cutoff = new Date("2026-11-06T06:00:00Z");
    const found = await db.savedSearch.findMany({
      where: { userId, active: true, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }] },
      orderBy: { name: "asc" },
      select: { id: true },
    });
    expect(found.map((s) => s.id)).toEqual([due.id, stale.id]);
    const sent = await db.savedSearch.update({ where: { id: due.id }, data: { lastMatchIds: { push: ["l1", "l2"] }, lastSentAt: new Date(), lastCheckedAt: new Date() } });
    expect(sent.lastMatchIds).toEqual(["l1", "l2"]);
  });
});

describe("timestamp columns", () => {
  it("are full timestamps with milliseconds (none of the new columns is a date-only column)", async () => {
    const rows = await db.$queryRaw<{ table_name: string; column_name: string; data_type: string; datetime_precision: number }[]>`
      SELECT table_name, column_name, data_type, datetime_precision FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND ((table_name = 'Review' AND column_name IN ('hostReplyAt', 'hiddenAt', 'createdAt', 'updatedAt'))
          OR (table_name = 'SavedList' AND column_name IN ('sharedAt', 'lastUsedAt', 'createdAt', 'updatedAt'))
          OR (table_name = 'SavedSearch' AND column_name IN ('lastSentAt', 'lastCheckedAt', 'createdAt', 'updatedAt')))`;
    expect(rows).toHaveLength(12);
    for (const row of rows) expect(row, `${row.table_name}.${row.column_name}`).toMatchObject({ data_type: "timestamp without time zone", datetime_precision: 3 });
  });

  it("keep the exact moment: a review written late on 31 October UTC is November in Tbilisi (month shown in code)", async () => {
    const at = new Date("2026-10-31T22:30:00.000Z");
    const review = await createReview({ createdAt: at });
    expect((await db.review.findUniqueOrThrow({ where: { id: review.id } })).createdAt.toISOString()).toBe(at.toISOString());
    const list = await db.savedList.create({ data: { userId: ids.guest, name: "Moment", sharedAt: at, lastUsedAt: at } });
    expect(list.sharedAt?.toISOString()).toBe(at.toISOString());
    expect(list.lastUsedAt?.toISOString()).toBe(at.toISOString());
  });
});

describe("indexes", () => {
  it("exist in the database", async () => {
    const wanted = [
      "Favorite_listId_idx",
      "Report_reviewId_idx",
      "Review_bookingId_key",
      "Review_hostUserId_createdAt_idx",
      "Review_listingId_hidden_createdAt_idx",
      "SavedList_shareToken_key",
      "SavedList_userId_lastUsedAt_idx",
      "SavedSearch_active_lastCheckedAt_idx",
    ];
    const rows = await db.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = current_schema() AND indexname = ANY(${wanted})`;
    expect(rows.map((r) => r.indexname).sort()).toEqual(wanted);
    const unique = rows.filter((r) => r.indexdef.startsWith("CREATE UNIQUE INDEX")).map((r) => r.indexname).sort();
    expect(unique).toEqual(["Review_bookingId_key", "SavedList_shareToken_key"]);
    // One place per user stays unique.
    const [favorite] = await db.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'Favorite_userId_listingId_key'`;
    expect(favorite.indexdef).toMatch(/^CREATE UNIQUE INDEX .*\("userId", "listingId"\)/);
  });
});

describe("prisma/sql/before-push.sql (on a throwaway database)", () => {
  const scratchName = `${prefix}_bp`;
  const script = readFileSync(path.resolve(__dirname, "../../prisma/sql/before-push.sql"), "utf8");
  const scratchUrl = () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    url.pathname = `/${scratchName}`;
    return url.toString();
  };
  async function connect<T>(connectionString: string | undefined, run: (client: pg.Client) => Promise<T>) {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      return await run(client);
    } finally {
      await client.end();
    }
  }
  const onScratch = <T,>(run: (client: pg.Client) => Promise<T>) => connect(scratchUrl(), run);

  beforeAll(async () => {
    await connect(process.env.DATABASE_URL, (c) => c.query(`CREATE DATABASE "${scratchName}"`));
  });
  afterAll(async () => {
    await connect(process.env.DATABASE_URL, (c) => c.query(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`));
  });

  it("does nothing on an empty database", async () => {
    await onScratch(async (c) => {
      await c.query(script);
      const { rows } = await c.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`);
      expect(rows[0].n).toBe(0);
    });
  });

  it("leaves a Report table without reviewId alone (an older database: the push adds the column)", async () => {
    await onScratch(async (c) => {
      await c.query(`CREATE TABLE "Report" ("id" TEXT PRIMARY KEY, "details" TEXT)`);
      await c.query(`INSERT INTO "Report" VALUES ('a', 'kept')`);
      await c.query(script);
      expect((await c.query(`SELECT "id", "details" FROM "Report"`)).rows).toEqual([{ id: "a", details: "kept" }]);
      await c.query(`DROP TABLE "Report"`);
    });
  });

  it("before the Review table exists: every reviewId points nowhere and becomes NULL; the reports stay (twice in a row)", async () => {
    await onScratch(async (c) => {
      // The phase-3/4 shape: a plain, nullable column.
      await c.query(`CREATE TABLE "Report" ("id" TEXT PRIMARY KEY, "targetType" TEXT, "details" TEXT, "reviewId" TEXT)`);
      await c.query(`INSERT INTO "Report" VALUES ('dangling', 'REVIEW', 'rude', 'review-that-never-existed'), ('plain', 'LISTING', 'price', NULL)`);
      await c.query(script);
      await c.query(script);
      expect((await c.query(`SELECT * FROM "Report" ORDER BY "id"`)).rows).toEqual([
        { id: "dangling", targetType: "REVIEW", details: "rude", reviewId: null },
        { id: "plain", targetType: "LISTING", details: "price", reviewId: null },
      ]);
      await c.query(`DROP TABLE "Report"`);
    });
  });

  it("with a Review table: only ids that point nowhere become NULL, then the foreign key can be added", async () => {
    await onScratch(async (c) => {
      await c.query(`CREATE TABLE "Review" ("id" TEXT PRIMARY KEY)`);
      await c.query(`INSERT INTO "Review" VALUES ('r1')`);
      await c.query(`CREATE TABLE "Report" ("id" TEXT PRIMARY KEY, "reviewId" TEXT)`);
      await c.query(`INSERT INTO "Report" VALUES ('real', 'r1'), ('gone', 'r2'), ('none', NULL)`);
      await c.query(script);
      await c.query(script);
      expect((await c.query(`SELECT * FROM "Report" ORDER BY "id"`)).rows).toEqual([
        { id: "gone", reviewId: null },
        { id: "none", reviewId: null },
        { id: "real", reviewId: "r1" },
      ]);
      await c.query(`ALTER TABLE "Report" ADD CONSTRAINT "Report_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE SET NULL`);
      await c.query(script);
      expect((await c.query(`SELECT "reviewId" FROM "Report" WHERE "id" = 'real'`)).rows).toEqual([{ reviewId: "r1" }]);
    });
  });
});
