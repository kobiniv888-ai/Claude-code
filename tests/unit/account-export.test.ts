/**
 * "Download my data" (src/lib/account/export.ts) against the local database (DATABASE_URL in
 * .env): a host's export carries their listing, including the public "ביקרנו במקום" date, but
 * never the staff-only visit note, the staff member who entered it, or the internal report
 * counter (brief 8.3: "the note and who entered it stay in the admin panel"). Round 3, phase 5
 * (privacy-2, reviews-6/11, lists-alerts-2/13): a guest's export carries the reviews they wrote
 * (a hidden one with the reason's code, never the staff note or who hid it), their saved lists
 * (shared or not, never the share token), each saved place's list and alert price, and their
 * saved searches; a host's export carries their own public replies, never the guest's review or
 * name. Rows use fake addresses (@example.com) and are removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { buildAccountExport, LISTING_EXPORT_COLUMNS } = await import("@/lib/account/export");

const prefix = `axp${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ownerId = `${prefix}-owner`;
const staffId = `${prefix}-staff`;
const guestId = `${prefix}-guest`;
const NOTE = `internal-note-${prefix}`;
const HIDE_NOTE = `hide-note-${prefix}`;
const SHARE_TOKEN = `${prefix}-share-token`;
const REVIEW_TEXT = `Quiet flat, kind host, close to the sea ${prefix}`;
const HIDDEN_TEXT = `A second stay, the review was hidden ${prefix}`;
const REPLY_TEXT = `Thank you, come again ${prefix}`;
const GUEST_NAME = `Ruthie${prefix}`;

beforeAll(async () => {
  await db.user.createMany({
    data: [
      { id: ownerId, name: "Export Host", email: `${ownerId}@example.com` },
      { id: staffId, name: "Export Admin", email: `${staffId}@example.com`, role: "ADMIN" },
      { id: guestId, name: `${GUEST_NAME} Levi`, firstName: GUEST_NAME, email: `${guestId}@example.com` },
    ],
  });
  const listing = await db.listing.create({
    data: {
      ownerId,
      status: "LIVE",
      title: `${prefix} flat`,
      visitedAt: new Date("2026-11-03T00:00:00Z"),
      visitedNote: NOTE,
      visitedById: staffId,
      reportCount: 3,
      riskScore: 42,
      moderationNote: "Please add a photo of the kitchen.",
    },
  });
  // A room type with its own calendar feed (a secret token), a holiday price and a booking with a
  // discount, two rooms and its price lines (round 3, phase 4).
  const room = await db.roomType.create({
    data: { listingId: listing.id, names: { he: "חדר", en: "Room", ru: "Номер", ar: "غرفة", ka: "ოთახი" }, price: 90, currency: "GEL", pricePeriod: "NIGHT", maxGuests: 2, quantity: 3, icalToken: `${prefix}-room-token` },
  });
  await db.datePrice.create({ data: { listingId: listing.id, roomTypeId: room.id, startDate: new Date("2027-04-12T00:00:00Z"), endDate: new Date("2027-04-20T00:00:00Z"), price: 120 } });
  await db.booking.create({
    data: {
      code: `${prefix}-B`,
      listingId: listing.id,
      hostUserId: ownerId,
      guestUserId: staffId,
      roomTypeId: room.id,
      rooms: 2,
      checkIn: new Date("2027-03-01T00:00:00Z"),
      checkOut: new Date("2027-03-08T00:00:00Z"),
      nights: 7,
      adults: 4,
      nightlyPrice: 90,
      subtotal: 1260,
      discount: -126,
      total: 1134,
      currency: "GEL",
      priceLines: [
        { kind: "weekday", nights: 7, price: 90, amount: 1260, rooms: 2 },
        { kind: "discount", pct: 10, period: "weekly", amount: -126 },
      ],
      cancellationPolicy: "FLEXIBLE",
      guestName: "Guest",
      guestPhone: "+995555989002",
      locale: "en",
      rulesAcceptedAt: new Date(),
    },
  });

  // Phase 5: two finished stays of the guest, each reviewed (one replied to, one hidden by staff).
  const stay = (code: string, checkIn: string, checkOut: string) =>
    db.booking.create({
      data: {
        code,
        listingId: listing.id,
        hostUserId: ownerId,
        guestUserId: guestId,
        status: "COMPLETED",
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        nights: 2,
        adults: 2,
        nightlyPrice: 100,
        subtotal: 200,
        total: 200,
        currency: "GEL",
        cancellationPolicy: "FLEXIBLE",
        guestName: GUEST_NAME,
        guestPhone: "+995555989003",
        locale: "en",
        rulesAcceptedAt: new Date(),
      },
    });
  const first = await stay(`${prefix}-R1`, "2026-09-01T00:00:00Z", "2026-09-03T00:00:00Z");
  const second = await stay(`${prefix}-R2`, "2026-10-01T00:00:00Z", "2026-10-03T00:00:00Z");
  await db.review.create({
    data: {
      bookingId: first.id,
      listingId: listing.id,
      guestUserId: guestId,
      hostUserId: ownerId,
      rating: 5,
      cleanliness: 4,
      text: REVIEW_TEXT,
      language: "en",
      translations: { he: `תרגום ${prefix}` },
      hostReply: REPLY_TEXT,
      hostReplyLanguage: "en",
      hostReplyAt: new Date("2026-09-06T10:00:00Z"),
    },
  });
  await db.review.create({
    data: {
      bookingId: second.id,
      listingId: listing.id,
      guestUserId: guestId,
      hostUserId: ownerId,
      rating: 2,
      text: HIDDEN_TEXT,
      language: "en",
      hidden: true,
      hiddenReason: `personal_info\n${HIDE_NOTE}`,
      hiddenAt: new Date(),
      hiddenById: staffId,
    },
  });

  // Phase 5 lists and alerts: the default list, a shared named list holding a place with an alert
  // price, and a saved search.
  await db.savedList.create({ data: { userId: guestId, name: "שמורים", isDefault: true } });
  const named = await db.savedList.create({
    data: { userId: guestId, name: "Batumi with Dana, August", shareToken: SHARE_TOKEN, sharedAt: new Date() },
  });
  await db.favorite.create({
    data: { userId: guestId, listingId: listing.id, listId: named.id, alertPrice: 120, alertCurrency: "GEL" },
  });
  await db.savedSearch.create({
    data: {
      userId: guestId,
      name: "Batumi Aug",
      filters: { v: 1, query: "city=batumi&checkIn=2027-08-01&checkOut=2027-08-08&guests=4" },
      lastMatchIds: [`${prefix}-internal-match`],
    },
  });
});

afterAll(async () => {
  await db.review.deleteMany({ where: { hostUserId: ownerId } });
  await db.booking.deleteMany({ where: { hostUserId: ownerId } });
  await db.favorite.deleteMany({ where: { userId: guestId } });
  await db.savedSearch.deleteMany({ where: { userId: guestId } });
  await db.savedList.deleteMany({ where: { userId: guestId } });
  await db.listing.deleteMany({ where: { ownerId } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, staffId, guestId] } } });
});

describe("a host's data export", () => {
  it("never carries the staff-only visit note, who entered it, or internal counters", async () => {
    const result = await buildAccountExport(ownerId);
    expect(result.listings).toHaveLength(1);
    const [listing] = result.listings as unknown as Record<string, unknown>[];
    for (const key of ["visitedNote", "visitedById", "reportCount", "riskScore", "riskReasons", "reviewedById", "icalToken", "searchText"]) {
      expect(listing, key).not.toHaveProperty(key);
    }
    const json = JSON.stringify(result);
    expect(json).not.toContain(NOTE);
    expect(json).not.toContain(staffId);
    // The host's own data stays: the public badge date and the moderator's message to them.
    expect(listing.visitedAt).toEqual(new Date("2026-11-03T00:00:00Z"));
    expect(listing.moderationNote).toBe("Please add a photo of the kitchen.");
    expect(listing.title).toBe(`${prefix} flat`);
  });

  it("never carries a room type's calendar feed token (ical-1)", async () => {
    const result = await buildAccountExport(ownerId);
    const [listing] = result.listings as unknown as { roomTypes: Record<string, unknown>[] }[];
    expect(listing.roomTypes).toHaveLength(1);
    expect(listing.roomTypes[0]).not.toHaveProperty("icalToken");
    expect(JSON.stringify(result)).not.toContain(`${prefix}-room-token`);
  });

  it("carries the booking's discount, rooms and price lines, and the holiday prices (export-1)", async () => {
    const result = await buildAccountExport(ownerId);
    const [booking] = result.bookingsOfMyPlaces;
    expect(booking).toMatchObject({ discount: -126, rooms: 2, total: 1134 });
    expect(booking.priceLines.map((line) => line.kind)).toEqual(["weekday", "discount"]);
    const [listing] = result.listings as unknown as { datePrices: { price: unknown }[] }[];
    expect(listing.datePrices).toHaveLength(1);
    expect(Number(listing.datePrices[0].price)).toBe(120);
  });

  it("reads Listing through an allowlist that leaves the staff-only columns out", () => {
    const columns = LISTING_EXPORT_COLUMNS as Record<string, boolean>;
    expect(columns.visitedNote).toBe(false);
    expect(columns.visitedById).toBe(false);
    expect(columns.reportCount).toBe(false);
    expect(columns.visitedAt).toBe(true);
  });
});

describe("phase 5 data in the export", () => {
  it("a guest's export carries the reviews they wrote, a hidden one with the reason's code only", async () => {
    const result = await buildAccountExport(guestId);
    expect(result.format).toBe(2);
    expect(result.reviewsWritten).toHaveLength(2);
    const [shown, hidden] = result.reviewsWritten;
    expect(shown).toMatchObject({ rating: 5, cleanliness: 4, text: REVIEW_TEXT, language: "en", hidden: false, hiddenReasonCode: null, hostReply: REPLY_TEXT, bookingCode: `${prefix}-R1` });
    expect(hidden).toMatchObject({ rating: 2, text: HIDDEN_TEXT, hidden: true, hiddenReasonCode: "personal_info", bookingCode: `${prefix}-R2` });
    for (const key of ["hiddenReason", "hiddenById", "translations", "hostReplyTranslations"]) expect(hidden, key).not.toHaveProperty(key);
    const json = JSON.stringify(result);
    expect(json).not.toContain(HIDE_NOTE);
    expect(json).not.toContain(staffId);
    expect(json).not.toContain(`תרגום ${prefix}`);
  });

  it("a host's export carries their own replies, never the guest's review, name or id", async () => {
    const result = await buildAccountExport(ownerId);
    expect(result.reviewRepliesWritten).toEqual([
      { listingId: expect.any(Number), bookingCode: `${prefix}-R1`, reply: REPLY_TEXT, language: "en", repliedAt: new Date("2026-09-06T10:00:00Z") },
    ]);
    expect(result.reviewsWritten).toEqual([]);
    const json = JSON.stringify(result);
    for (const value of [REVIEW_TEXT, HIDDEN_TEXT, GUEST_NAME, guestId, HIDE_NOTE, staffId]) expect(json, value).not.toContain(value);
  });

  it("carries the saved lists (shared or not), each place's list and alert price, and the saved searches, never the share token", async () => {
    const result = await buildAccountExport(guestId);
    expect(result.savedLists).toHaveLength(2);
    expect(result.savedLists.map((l) => [l.name, l.isDefault, l.shared])).toEqual([
      ["שמורים", true, false],
      ["Batumi with Dana, August", false, true],
    ]);
    expect(result.favorites).toEqual([
      expect.objectContaining({ list: "Batumi with Dana, August", alertPrice: 120, alertCurrency: "GEL" }),
    ]);
    expect(result.savedSearches).toEqual([
      expect.objectContaining({ name: "Batumi Aug", active: true, filters: { v: 1, query: "city=batumi&checkIn=2027-08-01&checkOut=2027-08-08&guests=4" } }),
    ]);
    const json = JSON.stringify(result);
    expect(json).not.toContain(SHARE_TOKEN);
    expect(json).not.toContain("shareToken");
    expect(json).not.toContain(`${prefix}-internal-match`);
  });
});
