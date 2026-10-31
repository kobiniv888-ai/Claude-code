import { describe, expect, it } from "vitest";
import {
  addDaysToDate,
  buildMonthWeeks,
  formatMonthParam,
  parseMonthParam,
  shiftMonth,
  shortHebrewDate,
  todayIn,
  utcOffsetLabel,
  hebrewMonthSpan,
} from "./calendar";
import { parseEmergencyContacts } from "./emergency";
import { groupHolidays, holidayHints, jewishFeatureSearchHref, type HolidayDayLike } from "./holidays";
import {
  directionsUrl,
  displayUrl,
  parsePlaceTypes,
  safeWebsiteUrl,
  serializePlaceTypes,
  telHref,
  toPublicPlace,
} from "./places";
import { jewishLifeHref, pickJewishLifeParams } from "./urls";
import { parseMarkdown } from "./markdown";

describe("place types in URLs", () => {
  it("parses slugs and enum values in canonical order, dropping unknown ones", () => {
    expect(parsePlaceTypes("mikveh,synagogue,nope")).toEqual(["SYNAGOGUE", "MIKVEH"]);
    expect(parsePlaceTypes(["kosher-restaurant", "CHABAD_HOUSE"])).toEqual(["CHABAD_HOUSE", "KOSHER_RESTAURANT"]);
    expect(parsePlaceTypes(undefined)).toEqual([]);
    expect(parsePlaceTypes("")).toEqual([]);
  });

  it("round-trips through serializePlaceTypes", () => {
    const types = parsePlaceTypes("heritage,kosher-shop");
    expect(serializePlaceTypes(types)).toBe("kosher-shop,heritage");
    expect(parsePlaceTypes(serializePlaceTypes(types))).toEqual(types);
    expect(serializePlaceTypes([])).toBe("");
  });
});

describe("place links", () => {
  it("builds OpenStreetMap directions to the point", () => {
    expect(directionsUrl({ lat: 41.69, lng: 44.8 })).toBe(
      "https://www.openstreetmap.org/directions?route=%3B41.690000%2C44.800000#map=17/41.690000/44.800000",
    );
  });

  it("builds tel: links and rejects junk", () => {
    expect(telHref("+995 32 2 12-34-56")).toBe("tel:+995322123456");
    expect(telHref("112")).toBe("tel:112");
    expect(telHref("call us")).toBeNull();
  });

  it("only accepts http(s) websites and adds https:// when missing", () => {
    expect(safeWebsiteUrl("chabad.example")).toBe("https://chabad.example/");
    expect(safeWebsiteUrl("http://example.org/a")).toBe("http://example.org/a");
    expect(safeWebsiteUrl("javascript:alert(1)")).toBeNull();
    expect(safeWebsiteUrl("localhost")).toBeNull();
    expect(safeWebsiteUrl("  ")).toBeNull();
    expect(displayUrl("https://www.example.org/tbilisi/")).toBe("example.org/tbilisi");
  });

  it("localizes a stored place for the browser", () => {
    const place = toPublicPlace(
      {
        id: "p1",
        type: "SYNAGOGUE",
        names: { he: "בית כנסת", en: "Synagogue" },
        description: null,
        address: { en: "1 Main St" },
        hours: null,
        lat: 41.7,
        lng: 44.8,
        phone: " +995 555 00 00 00 ",
        website: "example.org",
        isDemo: true,
        city: { id: "c1", slug: "tbilisi", names: { he: "טביליסי", en: "Tbilisi" } },
      },
      "he",
    );
    expect(place.name).toBe("בית כנסת");
    expect(place.address).toBe("1 Main St"); // falls back to English
    expect(place.cityName).toBe("טביליסי");
    expect(place.phone).toBe("+995 555 00 00 00");
    expect(place.phoneHref).toBe("tel:+995555000000");
    expect(place.website).toBe("https://example.org/");
    expect(place.isDemo).toBe(true);
  });
});

describe("calendar month parameter", () => {
  const current = { year: 2026, month: 10 };

  it("reads a valid month", () => {
    expect(parseMonthParam("2027-03", current)).toEqual({ year: 2027, month: 3, valid: true, isCurrent: false });
    expect(parseMonthParam(["2026-10"], current)).toEqual({ year: 2026, month: 10, valid: true, isCurrent: true });
  });

  it("falls back to the current month for missing, invalid or far-away values", () => {
    expect(parseMonthParam(undefined, current)).toEqual({ ...current, valid: true, isCurrent: true });
    expect(parseMonthParam("2026-13", current)).toEqual({ ...current, valid: false, isCurrent: true });
    expect(parseMonthParam("oct", current)).toEqual({ ...current, valid: false, isCurrent: true });
    expect(parseMonthParam("2099-01", current)).toEqual({ ...current, valid: false, isCurrent: true });
  });

  it("shifts across years and formats", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(formatMonthParam({ year: 2026, month: 3 })).toBe("2026-03");
  });
});

describe("calendar grid", () => {
  it("pads weeks so they start on Sunday", () => {
    // November 2026 starts on a Sunday (weekday 0) and has 30 days.
    const nov = Array.from({ length: 30 }, (_, i) => ({ day: i + 1, weekday: i % 7 }));
    const weeks = buildMonthWeeks(nov);
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toEqual({ day: 1, weekday: 0 });
    expect(weeks[4].filter(Boolean)).toHaveLength(2);
    // October 2026 starts on a Thursday (weekday 4).
    const oct = Array.from({ length: 31 }, (_, i) => ({ day: i + 1, weekday: (4 + i) % 7 }));
    const octWeeks = buildMonthWeeks(oct);
    expect(octWeeks[0].slice(0, 4)).toEqual([null, null, null, null]);
    expect(octWeeks[0][4]).toEqual({ day: 1, weekday: 4 });
    expect(octWeeks.every((w) => w.length === 7)).toBe(true);
    expect(buildMonthWeeks([])).toEqual([]);
  });

  it("drops the year from Hebrew dates", () => {
    expect(shortHebrewDate("20 Cheshvan 5787")).toBe("20 Cheshvan");
    expect(shortHebrewDate("כ׳ חשון תשפ״ז")).toBe("כ׳ חשון");
    expect(shortHebrewDate("14 Adar II 5787")).toBe("14 Adar II");
  });

  it("finds today's date in a time zone", () => {
    // 21:30 UTC on Oct 31 is already Nov 1 in Tbilisi (UTC+4).
    expect(todayIn("Asia/Tbilisi", new Date("2026-10-31T21:30:00Z"))).toBe("2026-11-01");
    expect(todayIn("UTC", new Date("2026-10-31T21:30:00Z"))).toBe("2026-10-31");
    expect(addDaysToDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDate("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("groupHolidays", () => {
  const day = (date: string, key: HolidayDayLike["key"], extra: Partial<HolidayDayLike> = {}): HolidayDayLike => ({
    date,
    key,
    isYomTov: false,
    isErev: false,
    category: key === "sukkot" || key === "pesach" || key === "shemini-atzeret" ? "major" : "minor",
    ...extra,
  });

  it("collapses consecutive days and keeps the Erev as the start", () => {
    const groups = groupHolidays([
      day("2026-09-25", "sukkot", { isErev: true }),
      day("2026-09-26", "sukkot", { isYomTov: true }),
      day("2026-09-27", "sukkot", { isYomTov: true }),
      day("2026-09-28", "sukkot"),
      day("2026-10-03", "shemini-atzeret", { isYomTov: true }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      key: "sukkot",
      start: "2026-09-25",
      end: "2026-09-28",
      firstDay: "2026-09-26",
      includesErev: true,
      hasYomTov: true,
      yomTovDates: ["2026-09-26", "2026-09-27"],
      hint: "sukkah_space",
    });
    expect(groups[1]).toMatchObject({ key: "shemini-atzeret", hint: null, includesErev: false });
  });

  it("keeps separate runs apart and sorts by date", () => {
    const groups = groupHolidays([day("2027-04-22", "pesach"), day("2026-04-02", "pesach"), day("2026-04-03", "pesach")]);
    expect(groups.map((g) => [g.start, g.end])).toEqual([
      ["2026-04-02", "2026-04-03"],
      ["2027-04-22", "2027-04-22"],
    ]);
    expect(holidayHints(groups)).toEqual([{ hint: "pesach_ready", key: "pesach" }]);
  });
});

describe("jewishFeatureSearchHref", () => {
  it("adds the feature and keeps the other filters", () => {
    expect(jewishFeatureSearchHref({ city: "batumi", guests: "4", page: "3" }, "sukkah_space")).toEqual({
      pathname: "/search",
      query: { city: "batumi", guests: "4", jewish: "sukkah_space" },
    });
  });

  it("merges with Jewish features already chosen, without duplicates", () => {
    expect(jewishFeatureSearchHref("?jewish=kosher_kitchen&amenity=wifi&amenity=parking", "pesach_ready")).toEqual({
      pathname: "/search",
      query: { amenity: ["wifi", "parking"], jewish: "kosher_kitchen,pesach_ready" },
    });
    expect(jewishFeatureSearchHref(new URLSearchParams("jewish=sukkah_space"), "sukkah_space").query).toEqual({
      jewish: "sukkah_space",
    });
    expect(jewishFeatureSearchHref(undefined, "sukkah_space").query).toEqual({ jewish: "sukkah_space" });
  });
});

describe("parseEmergencyContacts", () => {
  it("keeps valid entries and normalizes links", () => {
    const contacts = parseEmergencyContacts([
      { label: { en: "Embassy", he: "שגרירות" }, phone: "+995 32 000 00 00", url: "embassy.example" },
      { label: { en: "Hotline" }, phone: "112" },
      { label: { en: "" }, phone: "112" },
      { label: { en: "No contact" } },
      { label: { en: "Bad link" }, url: "javascript:alert(1)" },
      "junk",
    ]);
    expect(contacts).toEqual([
      {
        label: { en: "Embassy", he: "שגרירות" },
        phone: "+995 32 000 00 00",
        phoneHref: "tel:+995320000000",
        url: "https://embassy.example/",
      },
      { label: { en: "Hotline" }, phone: "112", phoneHref: "tel:112", url: null },
    ]);
  });

  it("returns [] for anything that is not an array", () => {
    expect(parseEmergencyContacts(null)).toEqual([]);
    expect(parseEmergencyContacts({ label: { en: "x" }, phone: "1" })).toEqual([]);
  });
});

describe("time zone and Hebrew month labels", () => {
  it("shows the UTC offset of a zone", () => {
    expect(utcOffsetLabel("Asia/Tbilisi", new Date("2026-10-31T12:00:00Z"))).toBe("GMT+4");
    expect(utcOffsetLabel("Asia/Jerusalem", new Date("2026-07-01T12:00:00Z"))).toBe("GMT+3");
    expect(utcOffsetLabel("Asia/Jerusalem", new Date("2026-12-01T12:00:00Z"))).toBe("GMT+2");
  });

  it("spans the Hebrew months of a civil month", () => {
    expect(hebrewMonthSpan("20 Cheshvan 5787", "20 Kislev 5787")).toBe("Cheshvan – Kislev 5787");
    expect(hebrewMonthSpan("1 Elul 5786", "1 Tishrei 5787")).toBe("Elul 5786 – Tishrei 5787");
    expect(hebrewMonthSpan("1 Adar I 5787", "29 Adar I 5787")).toBe("Adar I 5787");
    expect(hebrewMonthSpan("כ׳ חשון תשפ״ז", "כ׳ כסלו תשפ״ז")).toBe("חשון – כסלו תשפ״ז");
  });
});

describe("jewishLifeHref", () => {
  it("keeps known params, applies changes and drops unknown ones", () => {
    const current = pickJewishLifeParams({ type: "synagogue", month: ["2026-11", "x"], utm: "a", city: undefined });
    expect(current).toEqual({ type: "synagogue", month: "2026-11" });
    expect(jewishLifeHref(current, { city: "batumi" }, "calendar")).toBe(
      "/jewish-life?type=synagogue&city=batumi&month=2026-11#calendar",
    );
    expect(jewishLifeHref(current, { month: null, type: null })).toBe("/jewish-life");
  });
});

describe("parseMarkdown", () => {
  it("parses headings, paragraphs, lists, bold and safe links", () => {
    const blocks = parseMarkdown(
      "# Getting there\nFlights land in **Tbilisi**\nmost days.\n\n- One\n- Two [map](https://example.org)\n1. First\n\n[bad](javascript:alert(1)) <b>x</b>",
    );
    expect(blocks).toEqual([
      { type: "heading", level: 2, content: [{ type: "text", text: "Getting there" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Flights land in " },
          { type: "strong", text: "Tbilisi" },
          { type: "text", text: " most days." },
        ],
      },
      {
        type: "list",
        ordered: false,
        items: [
          [{ type: "text", text: "One" }],
          [
            { type: "text", text: "Two " },
            { type: "link", text: "map", href: "https://example.org" },
          ],
        ],
      },
      { type: "list", ordered: true, items: [[{ type: "text", text: "First" }]] },
      { type: "paragraph", content: [{ type: "text", text: "[bad](javascript:alert(1)) <b>x</b>" }] },
    ]);
  });
});
