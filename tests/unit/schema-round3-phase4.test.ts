/**
 * Round 3, phase 4 database changes against the local database (DATABASE_URL in .env, pushed with
 * prisma/sql/before-push.sql + prisma db push): the new DatePrice table, the PhotoRoom label,
 * booking by room type (RoomType, AvailabilityBlock and Booking columns), their defaults, the
 * date-only columns, what is removed with a room type or a listing, the unique iCal token and the
 * new indexes. Creates its own users, city, listings and bookings (fake @example.com addresses and
 * phones in the e2e test range) and removes them afterwards.
 *
 * The before-push.sql step (room types without a number of rooms become 1, before the push makes
 * the column required) runs here on a throwaway database of its own, never on the shared tables.
 * The post form's room-type save runs for real, with the session, rate limit and Shabbat-mode
 * guard as stand-ins.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sealGuestPhone } from "@/lib/field-crypto";
import type { Prisma as PrismaTypes } from "@/generated/prisma/client";

const state = vi.hoisted(() => ({ user: null as null | { id: string; role: string } }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    requireUserForAction: async () => {
      if (!state.user) throw new AppError("auth_required", "Sign-in required", { status: 401 });
      return state.user;
    },
  };
});
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  assertRateLimit: async () => undefined,
}));
vi.mock("@/lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/settings")>()),
  assertNotShabbatMode: async () => undefined,
}));

const { db } = await import("@/lib/db");
const { Prisma } = await import("@/generated/prisma/client");
const { PhotoRoom } = await import("@/generated/prisma/enums");

const prefix = `p4s${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { host: `${prefix}-host`, guest: `${prefix}-guest`, city: "", hotel: "", flat: "" };
const names = { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" };
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
let bookingSeq = 0;

function createRoomType(data: Partial<PrismaTypes.RoomTypeUncheckedCreateInput> = {}) {
  const row: PrismaTypes.RoomTypeUncheckedCreateInput = {
    listingId: ids.hotel,
    names: { he: "חדר זוגי", en: "Double room" },
    price: new Prisma.Decimal(80),
    ...data,
  };
  return db.roomType.create({ data: row });
}

function createBooking(data: { listingId: string; roomTypeId?: string | null; rooms?: number }) {
  bookingSeq += 1;
  return db.booking.create({
    data: {
      code: `${prefix}-${bookingSeq}`.toUpperCase(),
      guestUserId: ids.guest,
      hostUserId: ids.host,
      checkIn: day("2027-04-22"),
      checkOut: day("2027-04-25"),
      nights: 3,
      adults: 2,
      nightlyPrice: new Prisma.Decimal(55),
      subtotal: new Prisma.Decimal(165),
      total: new Prisma.Decimal(165),
      currency: "GEL",
      cancellationPolicy: "MODERATE",
      guestName: "Guest",
      ...sealGuestPhone("+995555990401"),
      locale: "he",
      rulesAcceptedAt: new Date(),
      ...data,
    },
  });
}

beforeAll(async () => {
  await db.user.createMany({
    data: [
      { id: ids.host, name: "Host", email: `${prefix}-host@example.com` },
      { id: ids.guest, name: "Guest", email: `${prefix}-guest@example.com` },
    ],
  });
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names, searchText: "city", lat: 41.6, lng: 41.6 } });
  ids.city = city.id;
  const hotel = await db.listing.create({
    data: { ownerId: ids.host, status: "DRAFT", dealType: "SHORT_STAY", propertyType: "HOTEL", cityId: city.id, title: "Test hotel" },
  });
  ids.hotel = hotel.id;
  const flat = await db.listing.create({
    data: { ownerId: ids.host, status: "DRAFT", dealType: "SHORT_STAY", cityId: city.id, title: "Test flat", currency: "GEL" },
  });
  ids.flat = flat.id;
});

afterAll(async () => {
  // Bookings first (they cascade their blocks); listings cascade room types, photos, blocks and
  // date prices.
  await db.booking.deleteMany({ where: { hostUserId: ids.host } });
  await db.listing.deleteMany({ where: { ownerId: ids.host } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { in: [ids.host, ids.guest] } } });
});

describe("ListingPhoto.room (PhotoRoom)", () => {
  it("has exactly the seven room labels", () => {
    expect(Object.values(PhotoRoom)).toEqual(["BEDROOM", "KITCHEN", "BATHROOM", "LIVING_ROOM", "VIEW", "BALCONY", "BUILDING"]);
  });

  it("is empty by default and stores a label", async () => {
    const photo = await db.listingPhoto.create({ data: { listingId: ids.flat, url: "/test/a.webp" } });
    expect(photo.room).toBeNull();
    const labelled = await db.listingPhoto.update({ where: { id: photo.id }, data: { room: "KITCHEN" } });
    expect(labelled.room).toBe("KITCHEN");
    const kitchens = await db.listingPhoto.count({ where: { listingId: ids.flat, room: { in: ["KITCHEN", "BEDROOM", "BATHROOM"] } } });
    expect(kitchens).toBe(1);
  });
});

describe("RoomType (booking by room type)", () => {
  it("has the defaults: 1 room, active, no amenities, no iCal yet", async () => {
    const room = await createRoomType();
    expect(room).toMatchObject({
      quantity: 1,
      active: true,
      amenities: [],
      bedsSofa: null,
      weekendPrice: null,
      icalToken: null,
      icalImportUrls: [],
      icalSyncedAt: null,
    });
  });

  it("stores the new fields, keeping the weekend price's decimals", async () => {
    const syncedAt = new Date("2026-11-04T09:15:00.000Z");
    const room = await createRoomType({
      quantity: 6,
      bedsSofa: 1,
      amenities: ["air_conditioning", "balcony"],
      weekendPrice: new Prisma.Decimal("95.50"),
      active: false,
      icalToken: `${prefix}-tok-a`,
      icalImportUrls: ["https://calendar.example.com/a.ics"],
      icalSyncedAt: syncedAt,
    });
    expect(room).toMatchObject({
      quantity: 6,
      bedsSofa: 1,
      amenities: ["air_conditioning", "balcony"],
      active: false,
      icalToken: `${prefix}-tok-a`,
      icalImportUrls: ["https://calendar.example.com/a.ics"],
      icalSyncedAt: syncedAt,
    });
    expect(room.weekendPrice?.toString()).toBe("95.5");
  });

  it("never holds an empty number of rooms (the column is NOT NULL, default 1)", async () => {
    const room = await createRoomType();
    await expect(db.$executeRaw`UPDATE "RoomType" SET "quantity" = NULL WHERE "id" = ${room.id}`).rejects.toThrow();
    const [column] = await db.$queryRaw<{ is_nullable: string; column_default: string | null }[]>`
      SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'RoomType' AND column_name = 'quantity'`;
    expect(column).toEqual({ is_nullable: "NO", column_default: "1" });
  });

  it("keeps iCal tokens unique, while any number of room types have none", async () => {
    await createRoomType({ icalToken: `${prefix}-tok-b` });
    await expect(createRoomType({ icalToken: `${prefix}-tok-b` })).rejects.toMatchObject({ code: "P2002" });
    await createRoomType();
    await createRoomType();
    expect(await db.roomType.count({ where: { listingId: ids.hotel, icalToken: null } })).toBeGreaterThanOrEqual(2);
  });
});

describe("Booking (rooms, price lines, discount)", () => {
  it("defaults to one room, no lines and no discount", async () => {
    const booking = await createBooking({ listingId: ids.flat });
    expect(booking).toMatchObject({ rooms: 1, priceLines: null, discount: null });
  });

  it("stores the itemized lines and the discount as a positive amount", async () => {
    const lines = [
      { kind: "weekday", nights: 4, price: 55, amount: 220 },
      { kind: "date_price", nights: 3, price: 80, amount: 240, label: { he: "פסח", en: "Passover" } },
      { kind: "discount", pct: 10, amount: -46 },
      { kind: "cleaning", amount: 30, rooms: 2 },
    ];
    const room = await createRoomType({ quantity: 3 });
    const booking = await createBooking({ listingId: ids.hotel, roomTypeId: room.id, rooms: 2 });
    const updated = await db.booking.update({
      where: { id: booking.id },
      data: { priceLines: lines, discount: new Prisma.Decimal("46.00") },
    });
    expect(updated.rooms).toBe(2);
    expect(updated.priceLines).toEqual(lines);
    expect(updated.discount?.toString()).toBe("46");
  });
});

describe("AvailabilityBlock per room type", () => {
  it("is for the whole listing by default and keeps calendar days only", async () => {
    const block = await db.availabilityBlock.create({
      data: { listingId: ids.hotel, startDate: new Date("2027-05-01T21:30:00Z"), endDate: new Date("2027-05-03T05:00:00Z") },
    });
    expect(block).toMatchObject({ roomTypeId: null, rooms: null });
    expect(block.startDate.toISOString()).toBe("2027-05-01T00:00:00.000Z");
    expect(block.endDate.toISOString()).toBe("2027-05-03T00:00:00.000Z");
  });

  it("holds a number of rooms of one type, one block per booking", async () => {
    const room = await createRoomType({ quantity: 4 });
    const booking = await createBooking({ listingId: ids.hotel, roomTypeId: room.id, rooms: 2 });
    const block = await db.availabilityBlock.create({
      data: {
        listingId: ids.hotel,
        roomTypeId: room.id,
        rooms: booking.rooms,
        source: "BOOKING",
        bookingId: booking.id,
        sourceRef: booking.id,
        startDate: booking.checkIn,
        endDate: booking.checkOut,
      },
    });
    expect(block).toMatchObject({ roomTypeId: room.id, rooms: 2, bookingId: booking.id });
    await expect(
      db.availabilityBlock.create({
        data: { listingId: ids.hotel, roomTypeId: room.id, rooms: 1, source: "BOOKING", bookingId: booking.id, startDate: booking.checkIn, endDate: booking.checkOut },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    const viaRoom = await db.roomType.findUniqueOrThrow({ where: { id: room.id }, select: { availability: { select: { id: true } } } });
    expect(viaRoom.availability.map((b) => b.id)).toEqual([block.id]);
  });
});

describe("DatePrice", () => {
  it("has the defaults, keeps the decimals and stores calendar days (endDate exclusive)", async () => {
    const row = await db.datePrice.create({
      data: {
        listingId: ids.flat,
        startDate: new Date("2027-04-22T20:00:00Z"),
        endDate: new Date("2027-04-29T03:00:00Z"),
        price: new Prisma.Decimal("120.75"),
      },
    });
    expect(row).toMatchObject({ roomTypeId: null, minNights: null, label: null });
    expect(row.startDate.toISOString()).toBe("2027-04-22T00:00:00.000Z");
    expect(row.endDate.toISOString()).toBe("2027-04-29T00:00:00.000Z");
    expect(row.price.toString()).toBe("120.75");
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
    const listing = await db.listing.findUniqueOrThrow({ where: { id: ids.flat }, select: { datePrices: { select: { id: true } } } });
    expect(listing.datePrices.map((d) => d.id)).toContain(row.id);
  });

  it("stores a minimum stay and a note in some languages", async () => {
    const label = { he: "ראש השנה", en: "Rosh Hashana" };
    const row = await db.datePrice.create({
      data: { listingId: ids.flat, startDate: day("2027-10-01"), endDate: day("2027-10-04"), price: new Prisma.Decimal(150), minNights: 3, label },
    });
    expect(row).toMatchObject({ minNights: 3, label });
    // Finds the prices that touch a stay: start < checkOut AND end > checkIn (both ends exclusive).
    const touching = await db.datePrice.findMany({
      where: { listingId: ids.flat, startDate: { lt: day("2027-10-02") }, endDate: { gt: day("2027-09-28") } },
      select: { id: true },
    });
    expect(touching.map((d) => d.id)).toEqual([row.id]);
    const after = await db.datePrice.findMany({
      where: { listingId: ids.flat, startDate: { lt: day("2027-10-06") }, endDate: { gt: day("2027-10-04") } },
    });
    expect(after).toEqual([]);
  });
});

describe("removing a room type or a listing", () => {
  it("a room type takes its date prices and blocks along; bookings and photos stay", async () => {
    const room = await createRoomType({ quantity: 2 });
    const roomPrice = await db.datePrice.create({
      data: { listingId: ids.hotel, roomTypeId: room.id, startDate: day("2027-06-01"), endDate: day("2027-06-03"), price: new Prisma.Decimal(99) },
    });
    const hotelPrice = await db.datePrice.create({
      data: { listingId: ids.hotel, startDate: day("2027-06-01"), endDate: day("2027-06-03"), price: new Prisma.Decimal(90) },
    });
    const roomBlock = await db.availabilityBlock.create({
      data: { listingId: ids.hotel, roomTypeId: room.id, rooms: 1, startDate: day("2027-06-05"), endDate: day("2027-06-06") },
    });
    const hotelBlock = await db.availabilityBlock.create({
      data: { listingId: ids.hotel, startDate: day("2027-06-05"), endDate: day("2027-06-06") },
    });
    const booking = await createBooking({ listingId: ids.hotel, roomTypeId: room.id });
    const photo = await db.listingPhoto.create({ data: { listingId: ids.hotel, roomTypeId: room.id, url: "/test/room.webp", room: "BEDROOM" } });
    const viaRoom = await db.roomType.findUniqueOrThrow({ where: { id: room.id }, select: { datePrices: { select: { id: true } } } });
    expect(viaRoom.datePrices.map((d) => d.id)).toEqual([roomPrice.id]);

    await db.roomType.delete({ where: { id: room.id } });

    expect(await db.datePrice.findUnique({ where: { id: roomPrice.id } })).toBeNull();
    expect(await db.availabilityBlock.findUnique({ where: { id: roomBlock.id } })).toBeNull();
    expect(await db.datePrice.findUnique({ where: { id: hotelPrice.id } })).not.toBeNull();
    expect(await db.availabilityBlock.findUnique({ where: { id: hotelBlock.id } })).not.toBeNull();
    expect(await db.booking.findUnique({ where: { id: booking.id } })).toMatchObject({ roomTypeId: null });
    expect(await db.listingPhoto.findUnique({ where: { id: photo.id } })).toMatchObject({ roomTypeId: null, room: "BEDROOM" });
  });

  it("a listing takes all its date prices along", async () => {
    const listing = await db.listing.create({ data: { ownerId: ids.host, status: "DRAFT", title: "Gone", cityId: ids.city } });
    const row = await db.datePrice.create({
      data: { listingId: listing.id, startDate: day("2027-07-01"), endDate: day("2027-07-02"), price: new Prisma.Decimal(70) },
    });
    await db.listing.delete({ where: { id: listing.id } });
    expect(await db.datePrice.findUnique({ where: { id: row.id } })).toBeNull();
  });
});

describe("the post form's room-type save (quantity is required now)", () => {
  const input = { name: "Double room", price: 80, currency: "GEL", pricePeriod: "NIGHT", maxGuests: 2, bedsSingle: null, bedsDouble: 1, sizeSqm: null };

  it("saves an empty number of rooms as 1, and keeps a number the host gave", async () => {
    const { saveRoomType } = await import("@/lib/wizard/actions");
    state.user = { id: ids.host, role: "USER" };
    try {
      const empty = await saveRoomType(ids.hotel, { ...input, quantity: null });
      if (!empty.ok) throw new Error(`saveRoomType failed: ${JSON.stringify(empty)}`);
      expect(empty.data.roomType.quantity).toBe(1);
      expect(await db.roomType.findUniqueOrThrow({ where: { id: empty.data.roomType.id } })).toMatchObject({ quantity: 1, active: true });

      const three = await saveRoomType(ids.hotel, { ...input, id: empty.data.roomType.id, quantity: 3 });
      if (!three.ok) throw new Error(`saveRoomType failed: ${JSON.stringify(three)}`);
      expect(three.data.roomType.quantity).toBe(3);

      const cleared = await saveRoomType(ids.hotel, { ...input, id: empty.data.roomType.id, quantity: null });
      if (!cleared.ok) throw new Error(`saveRoomType failed: ${JSON.stringify(cleared)}`);
      expect((await db.roomType.findUniqueOrThrow({ where: { id: empty.data.roomType.id } })).quantity).toBe(1);
    } finally {
      state.user = null;
    }
  });

  it("refuses a name with contact details: it is public text like the title (guide-2)", async () => {
    const { saveRoomType } = await import("@/lib/wizard/actions");
    state.user = { id: ids.host, role: "USER" };
    try {
      const before = await db.roomType.count({ where: { listingId: ids.hotel } });
      for (const name of ["Double WhatsApp +995555123456", "Suite t.me/myhandle"]) {
        expect(await saveRoomType(ids.hotel, { ...input, name, quantity: 1 }), name).toMatchObject({ ok: false, error: "invalid_input", fieldErrors: { name: ["contactInText"] } });
      }
      expect(await db.roomType.count({ where: { listingId: ids.hotel } })).toBe(before);
    } finally {
      state.user = null;
    }
  });

  it("is refused for someone who is not the listing's owner", async () => {
    const { saveRoomType } = await import("@/lib/wizard/actions");
    state.user = { id: ids.guest, role: "USER" };
    try {
      const before = await db.roomType.count({ where: { listingId: ids.hotel } });
      const result = await saveRoomType(ids.hotel, { ...input, quantity: 2 });
      expect(result.ok).toBe(false);
      expect(await db.roomType.count({ where: { listingId: ids.hotel } })).toBe(before);
    } finally {
      state.user = null;
    }
  });
});

describe("indexes", () => {
  it("exist in the database", async () => {
    const rows = await db.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN ('DatePrice_listingId_startDate_idx', 'DatePrice_roomTypeId_startDate_idx',
                          'AvailabilityBlock_roomTypeId_startDate_idx', 'RoomType_icalToken_key')`;
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      "AvailabilityBlock_roomTypeId_startDate_idx",
      "DatePrice_listingId_startDate_idx",
      "DatePrice_roomTypeId_startDate_idx",
      "RoomType_icalToken_key",
    ]);
    expect(rows.find((r) => r.indexname === "RoomType_icalToken_key")?.indexdef).toMatch(/^CREATE UNIQUE INDEX/);
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
  async function onMain<T>(run: (client: pg.Client) => Promise<T>) {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      return await run(client);
    } finally {
      await client.end();
    }
  }
  async function onScratch<T>(run: (client: pg.Client) => Promise<T>) {
    const client = new pg.Client({ connectionString: scratchUrl() });
    await client.connect();
    try {
      return await run(client);
    } finally {
      await client.end();
    }
  }

  beforeAll(async () => {
    await onMain((c) => c.query(`CREATE DATABASE "${scratchName}"`));
  });
  afterAll(async () => {
    await onMain((c) => c.query(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`));
  });

  it("does nothing on an empty database", async () => {
    await onScratch(async (c) => {
      await c.query(script);
      const { rows } = await c.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`);
      expect(rows[0].n).toBe(0);
    });
  });

  it("gives room types without a number of rooms 1, makes it required and adds the iCal token index (twice in a row)", async () => {
    await onScratch(async (c) => {
      // The phase-3 shape of the column: nullable, no default.
      await c.query(`CREATE TABLE "RoomType" ("id" TEXT PRIMARY KEY, "quantity" INTEGER)`);
      await c.query(`INSERT INTO "RoomType" ("id", "quantity") VALUES ('empty', NULL), ('four', 4)`);
      await c.query(script);
      await c.query(script);
      const { rows } = await c.query(`SELECT "id", "quantity", "icalToken" FROM "RoomType" ORDER BY "id"`);
      expect(rows).toEqual([
        { id: "empty", quantity: 1, icalToken: null },
        { id: "four", quantity: 4, icalToken: null },
      ]);
      const column = await c.query(
        `SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name = 'RoomType' AND column_name = 'quantity'`,
      );
      expect(column.rows[0]).toEqual({ is_nullable: "NO", column_default: "1" });
      await c.query(`INSERT INTO "RoomType" ("id") VALUES ('new')`);
      expect((await c.query(`SELECT "quantity" FROM "RoomType" WHERE "id" = 'new'`)).rows[0].quantity).toBe(1);
      const index = await c.query(`SELECT indexdef FROM pg_indexes WHERE indexname = 'RoomType_icalToken_key'`);
      expect(index.rows[0].indexdef).toMatch(/^CREATE UNIQUE INDEX/);
    });
  });
});
