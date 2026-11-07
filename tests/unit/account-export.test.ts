/**
 * "Download my data" (src/lib/account/export.ts) against the local database (DATABASE_URL in
 * .env): a host's export carries their listing, including the public "ביקרנו במקום" date, but
 * never the staff-only visit note, the staff member who entered it, or the internal report
 * counter (brief 8.3: "the note and who entered it stay in the admin panel"). Rows use fake
 * addresses (@example.com) and are removed afterwards.
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
const NOTE = `internal-note-${prefix}`;

beforeAll(async () => {
  await db.user.createMany({
    data: [
      { id: ownerId, name: "Export Host", email: `${ownerId}@example.com` },
      { id: staffId, name: "Export Admin", email: `${staffId}@example.com`, role: "ADMIN" },
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
});

afterAll(async () => {
  await db.booking.deleteMany({ where: { hostUserId: ownerId } });
  await db.listing.deleteMany({ where: { ownerId } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, staffId] } } });
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
