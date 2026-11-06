/**
 * Round 3, brief 6.3 against the local database (DATABASE_URL in .env): the host's holiday prices
 * ("מחיר לתאריכים") through the real server actions.
 *
 * - Only the listing's owner can add or delete one; a monthly rental cannot have any.
 * - Two date prices of the same listing never share a night (also when two saves race).
 * - The host's calendar lists them (and the holidays it marks), and the booking quote prices the
 *   nights with them.
 *
 * The session is a stand-in; everything else is the real code. Rows use fake @example.com
 * addresses and test-range phone numbers, and are removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-intl/server")>()),
  getLocale: async () => "he",
}));
vi.mock("@/lib/auth/session", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    requireUserForAction: async () => {
      if (!state.user) throw new AppError("auth_required", "Sign-in required", { status: 401 });
      return state.user;
    },
  };
});

const { db } = await import("@/lib/db");
const { deleteDatePriceAction, saveDatePriceAction } = await import("@/lib/booking/date-price-actions");
const { getBookingQuote } = await import("@/lib/booking/service");
const { addDays, tbilisiToday } = await import("@/lib/booking/dates");

const prefix = `p4dp${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const id = (name: string) => `${prefix}-${name}`;
const users = { host: id("host"), other: id("other") };
const listings = { stay: "", monthly: "" };
let cityId = "";
const today = tbilisiToday();
const day = (n: number) => addDays(today, n);

function as(userId: string | null) {
  state.user = userId ? { id: userId, role: "USER", phoneNumberVerified: true } : null;
}

beforeAll(async () => {
  const digits = `${Date.now() % 1_000_000}`.padStart(6, "0");
  for (const [n, userId] of Object.values(users).entries()) {
    await db.user.create({
      data: { id: userId, name: "Host", firstName: "Host", email: `${userId}@example.com`, phoneNumber: `+99559${digits}${n}`, phoneNumberVerified: true, locale: "he" },
    });
  }
  const city = await db.city.create({
    data: { slug: id("city"), names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.7, lng: 44.8 },
  });
  cityId = city.id;
  const base = {
    ownerId: users.host,
    status: "LIVE" as const,
    propertyType: "APARTMENT" as const,
    currency: "GEL" as const,
    cityId,
    lat: 41.71,
    lng: 44.77,
    originalLocale: "he" as const,
    description: "A test listing.",
  };
  listings.stay = (
    await db.listing.create({
      data: {
        ...base,
        dealType: "SHORT_STAY",
        pricePeriod: "NIGHT",
        price: 55,
        weekendPrice: 70,
        cleaningFee: 20,
        bookingMode: "INSTANT",
        cancellationPolicy: "FLEXIBLE",
        paymentMethodsAtCheckIn: ["cash"],
        title: "Holiday price test flat",
      },
    })
  ).id;
  listings.monthly = (await db.listing.create({ data: { ...base, dealType: "MONTHLY_RENT", pricePeriod: "MONTH", price: 900, title: "Monthly test flat" } })).id;
});

afterAll(async () => {
  await db.listing.deleteMany({ where: { id: { in: Object.values(listings).filter(Boolean) } } });
  await db.rateLimit.deleteMany({ where: { key: { in: Object.values(users).map((u) => `host-calendar:price:${u}`) } } });
  await db.user.deleteMany({ where: { id: { in: Object.values(users) } } });
  await db.city.deleteMany({ where: { id: cityId } });
});

describe("holiday prices (server actions)", () => {
  it("lets the owner add one, and lists it with the note in the host's language", async () => {
    as(users.host);
    const result = await saveDatePriceAction({ listingId: listings.stay, start: day(30), last: day(32), price: 80, minNights: 3, label: "חנוכה" });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.data.datePrices).toEqual([
      expect.objectContaining({ roomTypeId: null, start: day(30), end: day(33), price: 80, currency: "GEL", minNights: 3, label: "חנוכה" }),
    ]);
    const row = await db.datePrice.findFirstOrThrow({ where: { listingId: listings.stay } });
    expect(row.label).toEqual({ he: "חנוכה" });
  });

  it("prices those nights first in the booking quote, and needs their minimum stay", async () => {
    const quote = await getBookingQuote({ listingId: listings.stay, checkIn: day(29), checkOut: day(33), adults: 2 });
    expect(quote.ok && quote.quote.lines.find((l) => l.kind === "date_price")).toMatchObject({ nights: 3, price: 80, amount: 240, label: { he: "חנוכה" } });
    expect(await getBookingQuote({ listingId: listings.stay, checkIn: day(31), checkOut: day(33), adults: 2 })).toMatchObject({ ok: false, error: "min_stay", minNights: 3 });
  });

  it("refuses a price that shares a night with another one, even when two saves race", async () => {
    as(users.host);
    expect(await saveDatePriceAction({ listingId: listings.stay, start: day(32), last: day(35), price: 90 })).toEqual({ ok: false, error: "overlap" });
    // Starting on the first night after it is fine.
    expect((await saveDatePriceAction({ listingId: listings.stay, start: day(33), last: day(33), price: 90 })).ok).toBe(true);
    const [a, b] = await Promise.all([
      saveDatePriceAction({ listingId: listings.stay, start: day(50), last: day(55), price: 100 }),
      saveDatePriceAction({ listingId: listings.stay, start: day(54), last: day(58), price: 120 }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect([a, b].find((r) => !r.ok)).toEqual({ ok: false, error: "overlap" });
  });

  it("refuses other users, past dates, monthly rentals and bad input", async () => {
    as(users.other);
    expect(await saveDatePriceAction({ listingId: listings.stay, start: day(70), last: day(71), price: 80 })).toEqual({ ok: false, error: "not_found" });
    as(null);
    expect(await saveDatePriceAction({ listingId: listings.stay, start: day(70), last: day(71), price: 80 })).toEqual({ ok: false, error: "auth_required" });
    as(users.host);
    expect(await saveDatePriceAction({ listingId: listings.stay, start: day(-2), last: day(1), price: 80 })).toEqual({ ok: false, error: "dates_past" });
    expect(await saveDatePriceAction({ listingId: listings.monthly, start: day(70), last: day(71), price: 80 })).toEqual({ ok: false, error: "not_bookable" });
    expect(await saveDatePriceAction({ listingId: listings.stay, start: day(70), last: day(71), price: 0 })).toEqual({ ok: false, error: "price_required" });
    expect(await saveDatePriceAction({ listingId: listings.stay, start: day(70), last: day(71), price: 80, roomTypeId: "not-a-room" })).toEqual({
      ok: false,
      error: "room_type_not_found",
    });
  });

  it("deletes only the owner's own date price", async () => {
    const row = await db.datePrice.findFirstOrThrow({ where: { listingId: listings.stay, startDate: new Date(`${day(30)}T00:00:00Z`) } });
    as(users.other);
    expect(await deleteDatePriceAction({ listingId: listings.stay, id: row.id })).toEqual({ ok: false, error: "not_found" });
    as(users.host);
    const result = await deleteDatePriceAction({ listingId: listings.stay, id: row.id });
    expect(result.ok && result.data.datePrices.some((p) => p.id === row.id)).toBe(false);
    expect(await db.datePrice.count({ where: { id: row.id } })).toBe(0);
  });
});
