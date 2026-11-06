import { describe, expect, it } from "vitest";
import { generateBookingCode, isBookingCode, normalizeBookingCode } from "./code";
import { BOOKING_CODE_ALPHABET, cleanPaymentMethods, MAX_STAY_NIGHTS } from "./constants";
import { addDays, checkInMoment, eachNight, isDay, isWeekendNight, nightsBetween, tbilisiToday } from "./dates";
import { clipRanges, findOverlap, isStayFree, mergeRanges, rangesOverlap } from "./overlap";
import {
  canGuestCancel,
  canHostCancel,
  canReportNoShow,
  canRevealHostContact,
  freeCancellationDeadline,
  isHostCancellationFlagged,
  isLateCancellation,
  shouldComplete,
} from "./policy";
import { quoteStay, type PricingTerms } from "./pricing";
import { directionsFor, hostContactFor } from "./reveal";
import { createBookingSchema, guestCancelSchema, hostCancelSchema } from "./schemas";
import { isInstantBookable, resolveTerms, type BookableListing } from "./terms";

const TODAY = "2026-11-02"; // a Monday

describe("dates (Asia/Tbilisi)", () => {
  it("knows today in Georgia (UTC+4)", () => {
    expect(tbilisiToday(new Date("2026-11-02T19:59:00Z"))).toBe("2026-11-02");
    expect(tbilisiToday(new Date("2026-11-02T20:00:00Z"))).toBe("2026-11-03");
  });

  it("counts nights and lists them", () => {
    expect(nightsBetween("2026-11-06", "2026-11-09")).toBe(3);
    expect(nightsBetween("2026-11-09", "2026-11-06")).toBe(0);
    expect(eachNight("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("treats Friday and Saturday nights as the weekend", () => {
    expect(isWeekendNight("2026-11-06")).toBe(true); // Friday
    expect(isWeekendNight("2026-11-07")).toBe(true); // Saturday
    expect(isWeekendNight("2026-11-08")).toBe(false); // Sunday
    expect(isWeekendNight("2026-11-05")).toBe(false); // Thursday
  });

  it("validates calendar days and check-in times", () => {
    expect(isDay("2026-02-28")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("2026-2-3")).toBe(false);
    expect(checkInMoment("2026-11-12", "15:30").toISOString()).toBe("2026-11-12T11:30:00.000Z");
    expect(checkInMoment("2026-11-12", "nonsense").toISOString()).toBe("2026-11-12T10:00:00.000Z");
  });
});

describe("overlap", () => {
  const blocks = [
    { start: "2026-11-10", end: "2026-11-13" },
    { start: "2026-11-20", end: "2026-11-22" },
  ];

  it("uses half-open ranges: check-out day is free again", () => {
    expect(rangesOverlap({ start: "2026-11-07", end: "2026-11-10" }, blocks[0])).toBe(false);
    expect(rangesOverlap({ start: "2026-11-13", end: "2026-11-15" }, blocks[0])).toBe(false);
    expect(rangesOverlap({ start: "2026-11-12", end: "2026-11-14" }, blocks[0])).toBe(true);
    expect(rangesOverlap({ start: "2026-11-09", end: "2026-11-25" }, blocks[1])).toBe(true);
    expect(rangesOverlap({ start: "2026-11-11", end: "2026-11-11" }, blocks[0])).toBe(false);
  });

  it("finds the first clash and checks whole stays", () => {
    expect(findOverlap(blocks, "2026-11-12", "2026-11-21")).toEqual(blocks[0]);
    expect(isStayFree(blocks, "2026-11-13", "2026-11-20")).toBe(true);
    expect(isStayFree(blocks, "2026-11-13", "2026-11-21")).toBe(false);
    expect(isStayFree(blocks, "2026-11-15", "2026-11-15")).toBe(false);
  });

  it("merges touching and overlapping ranges from every source", () => {
    expect(
      mergeRanges([
        { start: "2026-11-05", end: "2026-11-08" },
        { start: "2026-11-01", end: "2026-11-03" },
        { start: "2026-11-03", end: "2026-11-04" },
        { start: "2026-11-06", end: "2026-11-07" },
        { start: "2026-11-09", end: "2026-11-09" },
      ]),
    ).toEqual([
      { start: "2026-11-01", end: "2026-11-04" },
      { start: "2026-11-05", end: "2026-11-08" },
    ]);
    expect(clipRanges(blocks, "2026-11-11", "2026-11-21")).toEqual([
      { start: "2026-11-11", end: "2026-11-13" },
      { start: "2026-11-20", end: "2026-11-21" },
    ]);
  });
});

describe("quoteStay", () => {
  const terms: PricingTerms = { currency: "USD", nightlyPrice: 85, weekendPrice: 100, cleaningFee: 25, minStayNights: 2, maxGuests: 4 };
  const context = { today: TODAY };

  it("prices weekday and weekend nights, the cleaning fee and the total", () => {
    // Thu 5, Fri 6, Sat 7, Sun 8 → 2 weekday nights, 2 weekend nights.
    const result = quoteStay(terms, { checkIn: "2026-11-05", checkOut: "2026-11-09", adults: 2, children: 1, infants: 1 }, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { quote } = result;
    expect(quote.nights).toBe(4);
    expect(quote.guests).toBe(3);
    expect(quote.lines).toEqual([
      { kind: "weekday", nights: 2, price: 85, amount: 170 },
      { kind: "weekend", nights: 2, price: 100, amount: 200 },
      { kind: "cleaning", price: 25, amount: 25 },
    ]);
    expect(quote.subtotal).toBe(370);
    expect(quote.cleaningFee).toBe(25);
    expect(quote.total).toBe(395);
    expect(quote.display).toBeNull();
  });

  it("uses the nightly price for every night without a weekend price, and avoids float errors", () => {
    const result = quoteStay(
      { currency: "GEL", nightlyPrice: 33.33, cleaningFee: null },
      { checkIn: "2026-11-06", checkOut: "2026-11-09", adults: 1 },
      context,
    );
    expect(result.ok && result.quote.lines).toEqual([{ kind: "weekday", nights: 3, price: 33.33, amount: 99.99 }]);
    expect(result.ok && result.quote.total).toBe(99.99);
  });

  it("adds an estimate in the guest's display currency", () => {
    const result = quoteStay(terms, { checkIn: "2026-11-09", checkOut: "2026-11-11", adults: 1 }, {
      ...context,
      displayCurrency: "ILS",
      rates: { USD: 1, ILS: 3.7 },
    });
    expect(result.ok && result.quote.total).toBe(195);
    expect(result.ok && result.quote.display).toEqual({ currency: "ILS", total: 721.5 });
  });

  it("enforces the host's rules", () => {
    const q = (stay: Partial<Parameters<typeof quoteStay>[1]>, t: Partial<PricingTerms> = {}) =>
      quoteStay({ ...terms, ...t }, { checkIn: "2026-11-09", checkOut: "2026-11-12", adults: 2, ...stay }, context);
    expect(q({ checkIn: "2026-11-01" })).toMatchObject({ ok: false, error: "dates_past" });
    expect(q({ checkIn: TODAY, checkOut: "2026-11-04" }).ok).toBe(true);
    expect(q({ checkOut: "2026-11-09" })).toMatchObject({ ok: false, error: "dates_invalid" });
    expect(q({ checkOut: "2026-11-10" })).toMatchObject({ ok: false, error: "min_stay", minNights: 2 });
    expect(q({ checkOut: addDays("2026-11-09", MAX_STAY_NIGHTS + 1) })).toMatchObject({ ok: false, error: "max_stay" });
    expect(q({ checkIn: "2029-01-01", checkOut: "2029-01-05" })).toMatchObject({ ok: false, error: "too_far_ahead" });
    expect(q({ adults: 0 })).toMatchObject({ ok: false, error: "no_adults" });
    expect(q({ adults: 3, children: 2 })).toMatchObject({ ok: false, error: "too_many_guests", maxGuests: 4 });
    // Infants don't count toward the maximum.
    expect(q({ adults: 2, children: 2, infants: 2 }).ok).toBe(true);
    expect(q({ infants: 6 })).toMatchObject({ ok: false, error: "too_many_infants" });
    expect(q({}, { nightlyPrice: null })).toMatchObject({ ok: false, error: "no_price" });
  });
});

describe("cancellation policy and permissions", () => {
  it("ends free cancellation 24 hours / 5 days / 14 days before the check-in time", () => {
    expect(freeCancellationDeadline("FLEXIBLE", "2026-11-12", "14:00").toISOString()).toBe("2026-11-11T10:00:00.000Z");
    expect(freeCancellationDeadline("MODERATE", "2026-11-12").toISOString()).toBe("2026-11-07T10:00:00.000Z");
    expect(freeCancellationDeadline("STRICT", "2026-11-20").toISOString()).toBe("2026-11-06T10:00:00.000Z");
    expect(isLateCancellation("MODERATE", "2026-11-12", new Date("2026-11-07T09:59:00Z"))).toBe(false);
    expect(isLateCancellation("MODERATE", "2026-11-12", new Date("2026-11-07T10:01:00Z"))).toBe(true);
  });

  const now = new Date("2026-11-12T08:00:00Z"); // Nov 12 in Georgia
  const confirmed = { status: "CONFIRMED" as const, checkIn: "2026-11-12", checkOut: "2026-11-15" };

  it("lets either side cancel until the end of the check-in day", () => {
    expect(canGuestCancel(confirmed, now)).toBe(true);
    expect(canHostCancel(confirmed, now)).toBe(true);
    const nextDay = new Date("2026-11-13T08:00:00Z");
    expect(canGuestCancel(confirmed, nextDay)).toBe(false);
    expect(canHostCancel({ ...confirmed, status: "CANCELLED_BY_GUEST" }, now)).toBe(false);
  });

  it("allows a no-show report from the day after check-in to a week after check-out", () => {
    expect(canReportNoShow(confirmed, now)).toBe(false);
    expect(canReportNoShow(confirmed, new Date("2026-11-13T08:00:00Z"))).toBe(true);
    expect(canReportNoShow({ ...confirmed, status: "COMPLETED" }, new Date("2026-11-22T08:00:00Z"))).toBe(true);
    expect(canReportNoShow({ ...confirmed, status: "COMPLETED" }, new Date("2026-11-23T08:00:00Z"))).toBe(false);
    expect(canReportNoShow({ ...confirmed, status: "CANCELLED_BY_HOST" }, new Date("2026-11-13T08:00:00Z"))).toBe(false);
  });

  it("completes bookings the day after check-out", () => {
    expect(shouldComplete(confirmed, new Date("2026-11-15T08:00:00Z"))).toBe(false);
    expect(shouldComplete(confirmed, new Date("2026-11-16T08:00:00Z"))).toBe(true);
  });

  it("flags host cancellations within 48 hours of the booking", () => {
    const created = new Date("2026-11-01T10:00:00Z");
    expect(isHostCancellationFlagged(created, new Date("2026-11-03T09:59:00Z"))).toBe(true);
    expect(isHostCancellationFlagged(created, new Date("2026-11-03T10:01:00Z"))).toBe(false);
  });

  it("reveals the host's contact only to the guest of a confirmed or completed booking", () => {
    const booking = { status: "CONFIRMED" as const, guestUserId: "guest" };
    expect(canRevealHostContact(booking, "guest")).toBe(true);
    expect(canRevealHostContact({ ...booking, status: "COMPLETED" }, "guest")).toBe(true);
    expect(canRevealHostContact(booking, "someone-else")).toBe(false);
    expect(canRevealHostContact(booking, null)).toBe(false);
    expect(canRevealHostContact({ ...booking, status: "CANCELLED_BY_HOST" }, "guest")).toBe(false);
    expect(canRevealHostContact({ ...booking, status: "NO_SHOW" }, "guest")).toBe(false);
  });
});

describe("booking codes", () => {
  it("are BT- plus 5 unambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateBookingCode();
      expect(code).toMatch(/^BT-[2-9A-HJ-NP-Z]{5}$/);
      expect(code.slice(3)).not.toMatch(/[01OI]/);
      expect(isBookingCode(code)).toBe(true);
    }
    expect(BOOKING_CODE_ALPHABET).toHaveLength(32);
    expect(generateBookingCode(() => new Uint8Array([0, 31, 32, 255, 7]))).toBe("BT-2Z2Z9");
  });

  it("reads codes as people type them", () => {
    expect(normalizeBookingCode(" bt-7k3q9 ")).toBe("BT-7K3Q9");
    expect(normalizeBookingCode("7K3Q9")).toBe("BT-7K3Q9");
    expect(normalizeBookingCode("BT 7K3Q9")).toBe("BT-7K3Q9");
    expect(normalizeBookingCode("BT-7K3Q0")).toBeNull();
    expect(normalizeBookingCode("BT-7K3Q")).toBeNull();
    expect(normalizeBookingCode(42)).toBeNull();
  });
});

describe("listing terms", () => {
  const listing: BookableListing = {
    status: "LIVE",
    deletedAt: null,
    dealType: "SHORT_STAY",
    bookingMode: "INSTANT",
    price: 85,
    pricePeriod: "NIGHT",
    currency: "USD",
    weekendPrice: 100,
    cleaningFee: 25,
    minStayNights: 2,
    maxGuests: 4,
    roomTypes: [],
  };

  it("books only live short stays and hotels with instant booking on (hotels need an active room type)", () => {
    expect(isInstantBookable(listing)).toBe(true);
    expect(isInstantBookable({ ...listing, bookingMode: "CONTACT" })).toBe(false);
    expect(isInstantBookable({ ...listing, status: "PAUSED" })).toBe(false);
    expect(isInstantBookable({ ...listing, dealType: "MONTHLY_RENT" })).toBe(false);
    // Round 3, phase 4 (founder's answer 3): a hotel takes instant bookings only with at least one
    // active room type priced per night; otherwise it stays contact-only, even when saved as INSTANT.
    const double = { id: "double", names: {}, price: 180, currency: "GEL" as const, pricePeriod: "NIGHT" as const, maxGuests: 2 };
    expect(isInstantBookable({ ...listing, dealType: "HOTEL_ROOM" })).toBe(false);
    expect(isInstantBookable({ ...listing, dealType: "HOTEL_ROOM", roomTypes: [double] })).toBe(true);
    expect(isInstantBookable({ ...listing, dealType: "HOTEL_ROOM", roomTypes: [{ ...double, active: false }] })).toBe(false);
    expect(isInstantBookable({ ...listing, dealType: "HOTEL_ROOM", roomTypes: [{ ...double, pricePeriod: "MONTH" }] })).toBe(false);
    expect(isInstantBookable({ ...listing, dealType: "HOTEL_ROOM", roomTypes: [{ ...double, price: 0 }] })).toBe(false);
  });

  it("uses the chosen room type's price for hotels (per room, its own weekend price only)", () => {
    const hotel: BookableListing = {
      ...listing,
      dealType: "HOTEL_ROOM",
      price: null,
      currency: "GEL",
      cleaningFee: 10,
      roomTypes: [
        { id: "double", names: { en: "Double" }, price: 180, currency: "GEL", pricePeriod: "NIGHT", maxGuests: 2 },
        { id: "monthly", names: { en: "Long" }, price: 2000, currency: "GEL", pricePeriod: "MONTH", maxGuests: 2 },
      ],
    };
    expect(resolveTerms(hotel, null)).toEqual({ ok: false, error: "room_type_required" });
    expect(resolveTerms(hotel, "monthly")).toEqual({ ok: false, error: "room_type_required" });
    const resolved = resolveTerms(hotel, "double");
    expect(resolved.ok && resolved.terms).toEqual({
      currency: "GEL",
      nightlyPrice: 180,
      weekendPrice: null,
      cleaningFee: 10,
      minStayNights: 2,
      maxGuests: 2,
      datePrices: [],
      weeklyDiscountPct: null,
      monthlyDiscountPct: null,
      rooms: 1,
    });
    // Two rooms: the room type's maximum guests per room × 2; never more than 10 rooms.
    const two = resolveTerms(hotel, "double", 2);
    expect(two.ok && [two.terms.rooms, two.terms.maxGuests]).toEqual([2, 4]);
    const many = resolveTerms(hotel, "double", 99);
    expect(many.ok && many.terms.rooms).toBe(10);
    // A hotel is always booked by room type, even with its own nightly price; a switched-off room
    // type is not offered.
    expect(resolveTerms({ ...hotel, price: 150 }, null)).toEqual({ ok: false, error: "room_type_required" });
    expect(resolveTerms({ ...hotel, roomTypes: [{ ...hotel.roomTypes[0], active: false }] }, "double")).toEqual({ ok: false, error: "room_type_required" });
    // Listings booked as a whole always book one "room".
    const flat = resolveTerms(listing, null, 3);
    expect(flat.ok && flat.terms.rooms).toBeUndefined();
    expect(resolveTerms({ ...listing, price: null }, null)).toEqual({ ok: false, error: "no_price" });
  });

  it("keeps only known payment methods", () => {
    expect(cleanPaymentMethods(["card", "bitcoin", "cash", "card"])).toEqual(["cash", "card"]);
  });
});

describe("reveal helpers", () => {
  it("finds the host's WhatsApp and phone, falling back to the verified account phone", () => {
    expect(hostContactFor([{ channel: "WHATSAPP", value: "+995 555 00-00-11", order: 0 }], null)).toEqual({
      phone: "+995555000011",
      whatsapp: "+995555000011",
    });
    expect(hostContactFor([{ channel: "TELEGRAM", value: "@yossi", order: 0 }], "+995555000011")).toEqual({
      phone: "+995555000011",
      whatsapp: null,
    });
    expect(directionsFor(41.7, 44.8)?.waze).toBe("https://waze.com/ul?ll=41.700000,44.800000&navigate=yes");
    expect(directionsFor(null, 44.8)).toBeNull();
  });
});

describe("schemas", () => {
  const base = {
    listingId: "l1",
    checkIn: "2026-11-09",
    checkOut: "2026-11-12",
    adults: "2",
    guestName: "  Noa   Levi ",
    rulesAccepted: true,
  };

  it("accepts a booking and tidies the input", () => {
    const parsed = createBookingSchema.parse({ ...base, messageToHost: "  \u0007Hello\n  " });
    expect(parsed).toMatchObject({ adults: 2, children: 0, infants: 0, guestName: "Noa Levi", messageToHost: "Hello" });
  });

  it("refuses missing rules, phone-like names and bad dates", () => {
    expect(createBookingSchema.safeParse({ ...base, rulesAccepted: false }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...base, guestName: "+972501234567" }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...base, checkIn: "2026-02-30" }).success).toBe(false);
  });

  it("needs a reason, and text for OTHER", () => {
    expect(hostCancelSchema.safeParse({ bookingId: "b", reasonCode: "DOUBLE_BOOKING" }).success).toBe(true);
    expect(hostCancelSchema.safeParse({ bookingId: "b", reasonCode: "OTHER" }).success).toBe(false);
    expect(hostCancelSchema.safeParse({ bookingId: "b", reasonCode: "OTHER", reasonText: "Pipe burst" }).success).toBe(true);
    expect(hostCancelSchema.safeParse({ bookingId: "b", reasonCode: "CHANGE_OF_PLANS" }).success).toBe(false);
    expect(guestCancelSchema.safeParse({ bookingId: "b", reasonCode: "HOST_ASKED" }).success).toBe(true);
  });
});
