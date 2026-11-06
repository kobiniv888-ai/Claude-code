import { describe, expect, it } from "vitest";
import {
  bookHref,
  bookRequestFrom,
  canStep,
  clampGuests,
  guestLimit,
  maxGuestsFor,
  quoteGuestStay,
  stepGuests,
  withBookParams,
} from "./guest";
import type { BookableListing } from "./terms";

const listing: BookableListing = {
  status: "LIVE",
  deletedAt: null,
  dealType: "SHORT_STAY",
  bookingMode: "INSTANT",
  price: 420,
  pricePeriod: "NIGHT",
  currency: "ILS",
  weekendPrice: 480,
  cleaningFee: 80,
  minStayNights: 2,
  maxGuests: 4,
  roomTypes: [],
};

describe("guest counts", () => {
  it("keeps at least one adult and the listing's maximum (infants apart)", () => {
    expect(clampGuests({ adults: 0, children: 9, infants: 9 }, 4)).toEqual({ adults: 1, children: 3, infants: 5 });
    expect(clampGuests({ adults: "3", children: "x" }, 2)).toEqual({ adults: 2, children: 0, infants: 0 });
    expect(guestLimit(null)).toBe(30);
    expect(guestLimit(500)).toBe(30);
  });

  it("steps within the limits", () => {
    const g = { adults: 3, children: 1, infants: 0 };
    expect(canStep(g, "adults", 1, 4)).toBe(false);
    expect(canStep(g, "children", 1, 4)).toBe(false);
    expect(canStep(g, "infants", 1, 4)).toBe(true);
    expect(stepGuests(g, "children", -1, 4)).toEqual({ adults: 3, children: 0, infants: 0 });
    expect(stepGuests({ adults: 1, children: 0, infants: 0 }, "adults", -1, 4).adults).toBe(1);
  });
});

describe("review page address", () => {
  it("reads dates, guests (with the legacy guests count) and the room type", () => {
    expect(bookRequestFrom({ checkIn: "2026-12-01", checkOut: "2026-12-04", guests: "3" }, 4)).toEqual({
      checkIn: "2026-12-01",
      checkOut: "2026-12-04",
      guests: { adults: 3, children: 0, infants: 0 },
      roomTypeId: null,
      rooms: 1,
    });
    const r = bookRequestFrom({ checkIn: "2026-12-04", checkOut: "2026-12-01", adults: "2", children: "1", infants: "1", room: "rt_1" });
    expect(r.checkIn).toBeNull();
    expect(r.guests).toEqual({ adults: 2, children: 1, infants: 1 });
    expect(r.roomTypeId).toBe("rt_1");
    expect(bookRequestFrom({ room: "../x" }).roomTypeId).toBeNull();
  });

  it("reads and writes the hotel's rooms (1–10, only with a room type)", () => {
    expect(bookRequestFrom({ room: "rt_1", rooms: "2" }).rooms).toBe(2);
    expect(bookRequestFrom({ room: "rt_1", rooms: "40" }).rooms).toBe(10);
    expect(bookRequestFrom({ room: "rt_1", rooms: "zero" }).rooms).toBe(1);
    expect(bookRequestFrom({ rooms: "3" }).rooms).toBe(1);
    // A room type's maximum is per room: 5 adults stay in the address for 3 rooms of 2.
    expect(bookRequestFrom({ room: "rt_1", rooms: "3", adults: "5" }, 2).guests.adults).toBe(5);
    expect(withBookParams("", { roomTypeId: "rt_1", rooms: 2 })).toBe("?room=rt_1&rooms=2");
    expect(withBookParams("?room=rt_1&rooms=2", { roomTypeId: "rt_1", rooms: 1 })).toBe("?room=rt_1");
    expect(withBookParams("?room=rt_1&rooms=2", { roomTypeId: null })).toBe("");
  });

  it("writes the parameters and keeps the others", () => {
    expect(withBookParams("?x=1&guests=3", { guests: { adults: 2, children: 0, infants: 1 } })).toBe("?x=1&adults=2&infants=1");
    expect(withBookParams("?checkIn=2026-12-01&checkOut=2026-12-03", { checkIn: null, checkOut: null })).toBe("");
    expect(
      bookHref("/listing/109-x", { checkIn: "2026-12-01", checkOut: "2026-12-03", guests: { adults: 1, children: 2, infants: 0 }, roomTypeId: null }),
    ).toBe("/listing/109-x/book?checkIn=2026-12-01&checkOut=2026-12-03&adults=1&children=2");
  });
});

describe("quoteGuestStay", () => {
  const today = "2026-11-02";
  it("prices weekday and weekend nights plus the cleaning fee", () => {
    // 2026-12-03 is a Thursday: Thu (weekday), Fri + Sat (weekend).
    const result = quoteGuestStay(
      listing,
      { checkIn: "2026-12-03", checkOut: "2026-12-06", guests: { adults: 2, children: 0, infants: 0 }, roomTypeId: null },
      { today },
    );
    expect(result.ok && result.quote.total).toBe(420 + 480 * 2 + 80);
    expect(result.ok && result.quote.lines.map((l) => l.kind)).toEqual(["weekday", "weekend", "cleaning"]);
  });

  it("explains what is missing", () => {
    const none = quoteGuestStay(listing, { checkIn: null, checkOut: null, guests: { adults: 1, children: 0, infants: 0 }, roomTypeId: null }, { today });
    expect(none).toEqual({ ok: false, error: "no_dates" });
    const short = quoteGuestStay(
      listing,
      { checkIn: "2026-12-03", checkOut: "2026-12-04", guests: { adults: 1, children: 0, infants: 0 }, roomTypeId: null },
      { today },
    );
    expect(short).toMatchObject({ ok: false, error: "min_stay", minNights: 2 });
    const hotel = { ...listing, dealType: "HOTEL_ROOM" as const, price: null, roomTypes: [{ id: "r1", names: {}, price: 100, currency: "GEL" as const, pricePeriod: "NIGHT" as const, maxGuests: 2 }] };
    const stay = { checkIn: "2026-12-03", checkOut: "2026-12-05", guests: { adults: 1, children: 0, infants: 0 }, roomTypeId: null };
    expect(quoteGuestStay(hotel, stay, { today })).toEqual({ ok: false, error: "room_type_required" });
    const room = quoteGuestStay(hotel, { ...stay, roomTypeId: "r1" }, { today });
    expect(room.ok && room.quote.currency).toBe("GEL");
    expect(maxGuestsFor(hotel, "r1")).toBe(2);
    expect(maxGuestsFor(hotel, null)).toBe(4);
    // Two rooms of 2: up to 4 guests in one booking.
    expect(maxGuestsFor(hotel, "r1", 2)).toBe(4);
    const twoRooms = quoteGuestStay(hotel, { ...stay, roomTypeId: "r1", rooms: 2, guests: { adults: 3, children: 1, infants: 0 } }, { today });
    expect(twoRooms.ok && [twoRooms.quote.rooms, twoRooms.quote.total]).toEqual([2, 400]);
    const tooMany = quoteGuestStay(hotel, { ...stay, roomTypeId: "r1", rooms: 2, guests: { adults: 5, children: 0, infants: 0 } }, { today });
    expect(tooMany).toMatchObject({ ok: false, error: "too_many_guests", maxGuests: 4 });
  });
});
