import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MATCH_IDS_CAP,
  MATCH_WINDOW_OVERLAP_MS,
  MAX_LISTINGS_PER_SEARCH,
  MAX_LOOKBACK_DAYS,
  MAX_SEARCHES_PER_EMAIL,
  SAVED_SEARCH_NAME_MAX,
  buildDigest,
  clipSearchName,
  dailyClaimKey,
  datesPassed,
  defaultNameParts,
  isSameSearch,
  matchWindowStart,
  mergeMatchIds,
  newMatches,
  normalizeSearch,
  readStoredFilters,
  savedAlertsDue,
  savedSearchPath,
  toStoredFilters,
  validateSearchName,
} from "./core";

const never = () => false;
const always = () => true;

describe("saved search filters", () => {
  it("keeps the city, deal, property types, filters and dates, and drops sort, view and page", () => {
    const { filters, query } = normalizeSearch(
      "?page=3&sort=price_asc&view=map&city=batumi&deal=short-stay&propertyTypes=house,apartment&checkIn=2026-12-10&checkOut=2026-12-14&guests=4&kitchen=kosher",
    );
    expect(query).toBe("deal=short-stay&city=batumi&checkIn=2026-12-10&checkOut=2026-12-14&guests=4&propertyTypes=apartment%2Chouse&kitchen=kosher");
    expect(filters).toMatchObject({ city: "batumi", deal: "short-stay", sort: "recommended", view: "grid", page: 1, guests: 4 });
    expect(filters.propertyTypes).toEqual(["APARTMENT", "HOUSE"]);
  });

  it("gives the same query for the same search written differently", () => {
    const a = normalizeSearch("city=batumi&deal=monthly&bedrooms=2&amenities=wifi,parking");
    const b = normalizeSearch("?amenities=parking&amenities=wifi&deal=monthly&bedrooms=2&city=BATUMI&sort=newest");
    expect(a.query).toBe(b.query);
  });

  it("drops invalid values instead of saving them", () => {
    const { query } = normalizeSearch("city=../etc&deal=castle&guests=-3&priceMin=abc&checkIn=2026-02-31&kitchen=kosher");
    expect(query).toBe("kitchen=kosher");
  });

  it("round-trips through the stored JSON, with the display currency", () => {
    const stored = toStoredFilters("deal=buy&city=tbilisi&priceMax=300000&sort=newest", "ILS");
    expect(stored).toEqual({ v: 1, query: "deal=buy&city=tbilisi&priceMax=300000", currency: "ILS" });
    const read = readStoredFilters(JSON.parse(JSON.stringify(stored)));
    expect(read?.query).toBe(stored.query);
    expect(read?.currency).toBe("ILS");
    expect(read?.filters.priceMax).toBe(300000);
  });

  it("reads nothing from rows it does not understand", () => {
    for (const junk of [null, 42, "deal=buy", [], { query: "deal=buy" }, { v: 2, query: "deal=buy" }, { v: 1, query: 7 }]) {
      expect(readStoredFilters(junk), JSON.stringify(junk)).toBeNull();
    }
    // An unknown currency falls back to dollars (the price is compared in USD anyway).
    expect(readStoredFilters({ v: 1, query: "deal=buy", currency: "XXX" })?.currency).toBe("USD");
  });

  it("treats a search saved twice as the same one; the currency matters only with a price range", () => {
    const one = readStoredFilters(toStoredFilters("city=batumi", "USD"))!;
    const two = readStoredFilters(toStoredFilters("sort=newest&city=batumi", "ILS"))!;
    expect(isSameSearch(one, two)).toBe(true);
    const priced = readStoredFilters(toStoredFilters("city=batumi&priceMax=100", "USD"))!;
    const pricedIls = readStoredFilters(toStoredFilters("city=batumi&priceMax=100", "ILS"))!;
    expect(isSameSearch(priced, pricedIls)).toBe(false);
    expect(isSameSearch(one, priced)).toBe(false);
  });

  it("opens on the search page", () => {
    expect(savedSearchPath("city=batumi")).toBe("/search?city=batumi");
    expect(savedSearchPath("")).toBe("/search");
  });

  it("knows when the dates are over (Georgian calendar day)", () => {
    expect(datesPassed({ checkIn: "2026-11-06" }, "2026-11-07")).toBe(true);
    expect(datesPassed({ checkIn: "2026-11-07" }, "2026-11-07")).toBe(false);
    expect(datesPassed({ checkIn: null }, "2026-11-07")).toBe(false);
  });
});

describe("saved search names", () => {
  it("cleans hidden characters and spaces", () => {
    expect(validateSearchName("  בטומי \n באוגוסט\u200F ")).toEqual({ ok: true, name: "בטומי באוגוסט" });
    expect(validateSearchName("\u202Egnp.exe")).toEqual({ ok: true, name: "gnp.exe" });
  });

  it("needs a name of at most 80 characters", () => {
    expect(validateSearchName("   ")).toEqual({ ok: false, error: "name_required" });
    expect(validateSearchName(undefined)).toEqual({ ok: false, error: "name_required" });
    expect(validateSearchName("א".repeat(SAVED_SEARCH_NAME_MAX)).ok).toBe(true);
    expect(validateSearchName("א".repeat(SAVED_SEARCH_NAME_MAX + 1))).toEqual({ ok: false, error: "name_too_long" });
  });

  it("clips a long generated name with an ellipsis", () => {
    const name = clipSearchName("ქ".repeat(100));
    expect([...name].length).toBe(SAVED_SEARCH_NAME_MAX);
    expect(name.endsWith("…")).toBe(true);
    expect(clipSearchName("Batumi")).toBe("Batumi");
  });

  it("prefills from the deal type, the place and the dates", () => {
    const { filters } = normalizeSearch("deal=short-stay&city=batumi&checkIn=2026-12-10&checkOut=2026-12-14&q=sea");
    expect(defaultNameParts(filters, "בטומי")).toEqual({ deal: "shortStay", place: "בטומי", text: null, checkIn: "2026-12-10", checkOut: "2026-12-14" });
    const text = normalizeSearch("q=vake").filters;
    expect(defaultNameParts(text, null)).toEqual({ deal: "any", place: null, text: "vake", checkIn: null, checkOut: null });
  });
});

describe("matching new listings", () => {
  const saved = new Date("2026-11-01T10:00:00Z");
  const now = new Date("2026-11-07T07:00:00Z");

  it("starts at the save on the first check", () => {
    expect(matchWindowStart({ createdAt: saved, lastCheckedAt: null }, now)).toEqual(saved);
  });

  it("starts a little before the last check, but never before the save", () => {
    const last = new Date("2026-11-06T07:00:00Z");
    expect(matchWindowStart({ createdAt: saved, lastCheckedAt: last }, now)).toEqual(new Date(last.getTime() - MATCH_WINDOW_OVERLAP_MS));
    const justSaved = new Date("2026-11-06T06:58:00Z");
    expect(matchWindowStart({ createdAt: justSaved, lastCheckedAt: last }, now)).toEqual(justSaved);
  });

  it("never looks back more than a week", () => {
    const old = new Date("2026-09-01T00:00:00Z");
    expect(matchWindowStart({ createdAt: old, lastCheckedAt: old }, now)).toEqual(new Date(now.getTime() - MAX_LOOKBACK_DAYS * 86_400_000));
  });

  it("never sends the same listing twice for a search", () => {
    const candidates = [{ id: "a" }, { id: "b" }, { id: "a" }, { id: "c" }];
    expect(newMatches(candidates, ["b"]).map((c) => c.id)).toEqual(["a", "c"]);
    expect(newMatches(candidates, ["a", "b", "c"])).toEqual([]);
  });

  it("remembers the sent ids newest first, capped", () => {
    expect(mergeMatchIds(["x", "y"], ["z", "x"])).toEqual(["z", "x", "y"]);
    const many = Array.from({ length: MATCH_IDS_CAP }, (_, i) => `old${i}`);
    const merged = mergeMatchIds(many, ["new1", "new2"]);
    expect(merged).toHaveLength(MATCH_IDS_CAP);
    expect(merged.slice(0, 3)).toEqual(["new1", "new2", "old0"]);
    expect(merged).not.toContain(`old${MATCH_IDS_CAP - 1}`);
  });
});

describe("once a day, in the morning, never on Shabbat", () => {
  it("sends from 08:00 to 11:59 Israel time on a weekday", () => {
    // Monday 9 November 2026, 09:30 in Israel (UTC+2).
    expect(savedAlertsDue(new Date("2026-11-09T07:30:00Z"), never)).toEqual({ send: true, day: "2026-11-09" });
    expect(savedAlertsDue(new Date("2026-11-09T05:30:00Z"), never)).toMatchObject({ send: false, reason: "too_early" });
    expect(savedAlertsDue(new Date("2026-11-09T10:30:00Z"), never)).toMatchObject({ send: false, reason: "too_late" });
  });

  it("waits while it is Shabbat or Yom Tov", () => {
    expect(savedAlertsDue(new Date("2026-11-07T07:30:00Z"), always)).toMatchObject({ send: false, reason: "rest_day" });
  });

  it("is called at least twice inside the window in winter and in summer (vercel.json)", () => {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
    const entry = config.crons.find((c) => c.path === "/api/cron/saved-alerts");
    expect(entry).toBeTruthy();
    const [minute, hours, , , weekdays] = entry!.schedule.split(" ");
    expect(weekdays).toBe("*");
    const [from, to] = hours.split("-").map(Number);
    for (const day of ["2026-11-09", "2026-06-08"]) {
      const calls = Array.from({ length: to - from + 1 }, (_, i) => new Date(`${day}T${String(from + i).padStart(2, "0")}:${minute.padStart(2, "0")}:00Z`));
      expect(calls.filter((at) => savedAlertsDue(at, never).send).length, day).toBeGreaterThanOrEqual(2);
    }
  });

  it("claims one email per user and Israel day", () => {
    expect(dailyClaimKey("2026-11-09", "user1")).toBe("saved-search-alerts:2026-11-09:user1");
    expect(dailyClaimKey("2026-11-09", "user1")).not.toBe(dailyClaimKey("2026-11-10", "user1"));
  });
});

describe("the email", () => {
  const place = (id: string) => ({ id });
  it("groups the searches with new places, the most first, and caps what it shows", () => {
    const digest = buildDigest([
      { id: "s1", name: "Batumi", query: "city=batumi", matches: [place("a")] },
      { id: "s2", name: "Tbilisi", query: "city=tbilisi", matches: [] },
      { id: "s3", name: "Kutaisi", query: "city=kutaisi", matches: Array.from({ length: MAX_LISTINGS_PER_SEARCH + 2 }, (_, i) => place(`k${i}`)) },
    ]);
    expect(digest.shown.map((s) => s.id)).toEqual(["s3", "s1"]);
    expect(digest.shown[0].matches).toHaveLength(MAX_LISTINGS_PER_SEARCH);
    expect(digest.shown[0]).toMatchObject({ more: 2, total: MAX_LISTINGS_PER_SEARCH + 2 });
    expect(digest.totalPlaces).toBe(MAX_LISTINGS_PER_SEARCH + 3);
    expect(digest.moreSearches).toBe(0);
  });

  it("counts a place new for two searches once", () => {
    const digest = buildDigest([
      { id: "s1", name: "A", query: "", matches: [place("a"), place("b")] },
      { id: "s2", name: "B", query: "", matches: [place("a")] },
    ]);
    expect(digest.totalPlaces).toBe(2);
  });

  it("leaves extra searches for the next email", () => {
    const searches = Array.from({ length: MAX_SEARCHES_PER_EMAIL + 3 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, query: "", matches: [place(`p${i}`)] }));
    const digest = buildDigest(searches);
    expect(digest.shown).toHaveLength(MAX_SEARCHES_PER_EMAIL);
    expect(digest.moreSearches).toBe(3);
  });
});
