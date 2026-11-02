import { describe, expect, it } from "vitest";
import { hasKosherShabbat, houseRules, listingHighlights, orderedAmenities, otherJewishFeatures, shabbatChecklist } from "./highlights";
import { bookingPath, canCheckOut, lastCheckOut, nightsBetween, pickDay, rangeIsFree, stayTotal, withStayParams } from "./stay";

const blocks = [{ start: "2026-11-10", end: "2026-11-13" }];
const rules = { blocks, today: "2026-11-02", minNights: 2 };

describe("stay dates", () => {
  it("counts nights and checks free ranges (block ends are exclusive)", () => {
    expect(nightsBetween("2026-11-02", "2026-11-05")).toBe(3);
    expect(nightsBetween("2026-11-05", "2026-11-02")).toBe(0);
    expect(rangeIsFree(blocks, "2026-11-05", "2026-11-10")).toBe(true);
    expect(rangeIsFree(blocks, "2026-11-05", "2026-11-11")).toBe(false);
    expect(rangeIsFree(blocks, "2026-11-13", "2026-11-15")).toBe(true);
    expect(lastCheckOut(blocks, "2026-11-04")).toBe("2026-11-10");
    expect(lastCheckOut(blocks, "2026-11-14")).toBeNull();
  });

  it("picks the arrival, then the departure, and starts over when needed", () => {
    let dates = pickDay({ checkIn: null, checkOut: null }, "2026-11-04", rules);
    expect(dates).toEqual({ checkIn: "2026-11-04", checkOut: null });
    // One night is under the two-night minimum: that tap starts a new stay instead.
    expect(canCheckOut("2026-11-05", "2026-11-04", rules)).toBe(false);
    expect(pickDay(dates, "2026-11-05", rules)).toEqual({ checkIn: "2026-11-05", checkOut: null });
    // A stay may end on the day a booking starts, not later.
    dates = pickDay(dates, "2026-11-10", rules);
    expect(dates).toEqual({ checkIn: "2026-11-04", checkOut: "2026-11-10" });
    expect(pickDay({ checkIn: "2026-11-04", checkOut: null }, "2026-11-14", rules)).toEqual({ checkIn: "2026-11-14", checkOut: null });
    // Past and booked days cannot start a stay.
    expect(pickDay({ checkIn: null, checkOut: null }, "2026-11-01", rules)).toEqual({ checkIn: null, checkOut: null });
    expect(pickDay({ checkIn: null, checkOut: null }, "2026-11-11", rules)).toEqual({ checkIn: null, checkOut: null });
  });

  it("adds the cleaning fee to the total and builds the links", () => {
    expect(stayTotal(100, 3, 25)).toBe(325);
    expect(stayTotal(100, 3, null)).toBe(300);
    expect(withStayParams("?guests=2&checkIn=2026-01-01", { checkIn: "2026-11-04", checkOut: "2026-11-07" })).toBe(
      "?guests=2&checkIn=2026-11-04&checkOut=2026-11-07",
    );
    expect(withStayParams("?checkIn=2026-11-04&checkOut=2026-11-07", { checkIn: null, checkOut: null })).toBe("");
    expect(bookingPath("/listing/104-x", { checkIn: "2026-11-04", checkOut: "2026-11-07" }, 2)).toBe(
      "/listing/104-x/book?checkIn=2026-11-04&checkOut=2026-11-07&guests=2",
    );
  });
});

describe("highlights", () => {
  const base = { dealType: "SHORT_STAY" as const, amenities: [] as string[], views: [] as ("SEA" | "MOUNTAIN" | "CITY")[], kitchenKosher: null };

  it("takes three in a fixed priority order, from real data only", () => {
    expect(listingHighlights({ ...base, amenities: ["wifi", "pool", "self_check_in", "near_sea"], views: ["SEA"], kitchenKosher: "KOSHER" })).toEqual([
      "self_check_in",
      "sea_view",
      "kosher_kitchen",
    ]);
    expect(listingHighlights({ ...base, amenities: ["near_sea", "parking"] })).toEqual(["near_sea", "parking"]);
    expect(listingHighlights({ ...base, amenities: ["wifi", "tv"] })).toEqual([]);
    // Buyers do not check in, and a "can be kashered" kitchen is not a kosher kitchen.
    expect(listingHighlights({ ...base, dealType: "SALE", amenities: ["self_check_in"], kitchenKosher: "KOSHER" })).toEqual([]);
    expect(listingHighlights({ ...base, kitchenKosher: "CAN_KASHER" })).toEqual([]);
  });

  it("lists the highlighted amenities last", () => {
    expect(orderedAmenities(["pool", "wifi", "tv", "unknown"], ["pool"])).toEqual(["wifi", "tv", "pool"]);
  });
});

describe("kosher and Shabbat", () => {
  it("writes the checklist plainly, with the floor next to a missing Shabbat elevator", () => {
    const lines = shabbatChecklist({ shabbatFeatures: ["hot_plate", "light_timers"], jewishFeatures: [], floor: 21 });
    expect(lines).toEqual([
      { key: "key", ok: false },
      { key: "elevator", ok: false, floor: 21 },
      { key: "sensors", ok: false },
      { key: "hotPlate", ok: true },
      { key: "urn", ok: false },
      { key: "timers", ok: true },
      { key: "sukkah", ok: false },
    ]);
    expect(shabbatChecklist({ shabbatFeatures: ["hot_plate"], jewishFeatures: [], floor: 1 })[1]).toEqual({ key: "elevator", ok: false, floor: null });
    expect(shabbatChecklist({ shabbatFeatures: [], jewishFeatures: ["sukkah_space"], floor: 3 })).toEqual([]);
  });

  it("shows the section only with at least one such feature", () => {
    const none = {
      kitchenKosher: "NOT_KOSHER" as const,
      shabbatFeatures: [],
      jewishFeatures: ["host_speaks_hebrew"],
      hotelJewishFeatures: [],
      kosherCertName: null,
      hostKeepsShabbat: false,
      verifiedSynagogue: false,
    };
    expect(hasKosherShabbat(none)).toBe(false);
    expect(hasKosherShabbat({ ...none, kitchenKosher: "CAN_KASHER" })).toBe(true);
    expect(hasKosherShabbat({ ...none, verifiedSynagogue: true })).toBe(true);
    expect(otherJewishFeatures(["mezuzot", "sukkah_space", "host_speaks_hebrew"], true)).toEqual(["mezuzot", "host_keeps_shabbat"]);
  });

  it("keeps the house rules the owner set, in order", () => {
    expect(houseRules({ smokingAllowed: false, petsAllowed: null, partiesAllowed: true, quietHoursFrom: "22:00", quietHoursTo: "08:00" })).toEqual([
      { key: "smoking", allowed: false },
      { key: "parties", allowed: true },
      { key: "quietHours", from: "22:00", to: "08:00" },
    ]);
  });
});
