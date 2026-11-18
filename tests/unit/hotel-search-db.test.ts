/**
 * A dated search finds a hotel while it has a free room (search-1, founder's answer 3: one
 * booking never closes the whole hotel), against the local database (DATABASE_URL in .env).
 * Creates its own (inactive) city, a fake @example.com host and a LIVE hotel, and removes them.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { freeHotelIdsForStay, searchWhere } = await import("@/lib/listing/queries");
const { emptyFilters } = await import("@/lib/listing/search-params");
const { FALLBACK_RATES } = await import("@/lib/currency/convert");

const prefix = `hs${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const host = `${prefix}-host`;
const ids = { city: "", hotel: "", double: "", family: "" };
const year = new Date().getUTCFullYear() + 1;
const IN = `${year}-03-10`;
const OUT = `${year}-03-12`;
const day = (value: string) => new Date(`${value}T00:00:00Z`);

async function found(): Promise<boolean> {
  const where = await searchWhere({ ...emptyFilters(), checkIn: IN, checkOut: OUT }, { currency: "USD", rates: FALLBACK_RATES }, { demoVisible: false, now: new Date() });
  return (await db.listing.count({ where: { AND: [where, { id: ids.hotel }] } })) === 1;
}

beforeAll(async () => {
  await db.user.create({ data: { id: host, name: "Hotel Test", email: `${host}@example.com` } });
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.6, lng: 41.6, active: false } });
  ids.city = city.id;
  const hotel = await db.listing.create({
    data: { ownerId: host, status: "LIVE", dealType: "HOTEL_ROOM", propertyType: "HOTEL", cityId: city.id, title: `${prefix} hotel`, currency: "GEL", pricePeriod: "NIGHT", publishedAt: new Date() },
  });
  ids.hotel = hotel.id;
  const names = { he: "חדר", en: "Room", ru: "Номер", ar: "غرفة", ka: "ოთახი" };
  ids.double = (await db.roomType.create({ data: { listingId: hotel.id, names, price: 90, currency: "GEL", pricePeriod: "NIGHT", maxGuests: 2, quantity: 2, active: true } })).id;
  ids.family = (await db.roomType.create({ data: { listingId: hotel.id, names, price: 120, currency: "GEL", pricePeriod: "NIGHT", maxGuests: 4, quantity: 1, active: true } })).id;
});

afterAll(async () => {
  await db.listing.deleteMany({ where: { ownerId: host } });
  await db.city.deleteMany({ where: { id: ids.city } });
  await db.user.deleteMany({ where: { id: host } });
});

beforeEach(async () => {
  await db.availabilityBlock.deleteMany({ where: { listingId: ids.hotel } });
});

const block = (data: { roomTypeId: string | null; rooms: number | null; start?: string; end?: string }) =>
  db.availabilityBlock.create({ data: { listingId: ids.hotel, source: "OWNER", startDate: day(data.start ?? IN), endDate: day(data.end ?? `${year}-03-11`), roomTypeId: data.roomTypeId, rooms: data.rooms } });

describe("a dated search and a hotel's rooms", () => {
  it("still finds the hotel when one room is booked or closed", async () => {
    await block({ roomTypeId: ids.double, rooms: 1 });
    expect(await freeHotelIdsForStay(IN, OUT)).toContain(ids.hotel);
    expect(await found()).toBe(true);
  });

  it("still finds it when one room type is full but another has a room", async () => {
    await block({ roomTypeId: ids.family, rooms: null });
    expect(await found()).toBe(true);
  });

  it("hides it when every room of every type is taken on one of the nights", async () => {
    await block({ roomTypeId: ids.double, rooms: 2, start: `${year}-03-11`, end: OUT });
    await block({ roomTypeId: ids.family, rooms: 1, start: `${year}-03-11`, end: OUT });
    expect(await freeHotelIdsForStay(IN, OUT)).not.toContain(ids.hotel);
    expect(await found()).toBe(false);
  });

  it("hides it when the whole hotel is closed (a block without a room type)", async () => {
    await block({ roomTypeId: null, rooms: null });
    expect(await found()).toBe(false);
  });

  it("a switched-off room type's free rooms don't count", async () => {
    await db.roomType.update({ where: { id: ids.family }, data: { active: false } });
    try {
      await block({ roomTypeId: ids.double, rooms: 2 });
      expect(await found()).toBe(false);
    } finally {
      await db.roomType.update({ where: { id: ids.family }, data: { active: true } });
    }
  });

  it("a hotel without a bookable room type (contact-only) is searched like a whole place", async () => {
    await db.roomType.updateMany({ where: { listingId: ids.hotel }, data: { active: false } });
    try {
      expect(await freeHotelIdsForStay(IN, OUT)).not.toContain(ids.hotel);
      // No block on those nights: it is found, as before room types existed.
      expect(await found()).toBe(true);
      // Any block on those nights hides it (it can't say how many rooms are left).
      await block({ roomTypeId: ids.double, rooms: 1 });
      expect(await found()).toBe(false);
    } finally {
      await db.roomType.updateMany({ where: { listingId: ids.hotel }, data: { active: true } });
    }
  });
});
