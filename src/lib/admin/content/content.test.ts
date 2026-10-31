import { describe, expect, it } from "vitest";
import { coordText } from "./coords";
import { cleanLocalized, cleanLocalizedOrNull, extractAliases, missingLocales, parseAliases, toLocalizedForm } from "./localized";
import { moveItem } from "./order";
import {
  addDays,
  alertSchema,
  bannedWordSchema,
  citySchema,
  emergencyContactsInputSchema,
  endOfGeorgiaDay,
  georgiaToday,
  issuesToFieldErrors,
  parseBulkPhrases,
  placeSchema,
  slugSchema,
} from "./schemas";
import {
  buildMessageRows,
  filterMessageRows,
  flattenMessages,
  messageArguments,
  messageTags,
  overrideProblems,
} from "./translations";

const names = { he: "טביליסי", en: "Tbilisi", ru: "", ar: "", ka: "" };

describe("localized helpers", () => {
  it("reads stored JSON into five strings", () => {
    expect(toLocalizedForm({ en: "A", he: 3, xx: "no" })).toEqual({ he: "", en: "A", ru: "", ar: "", ka: "" });
    expect(toLocalizedForm(null)).toEqual({ he: "", en: "", ru: "", ar: "", ka: "" });
  });
  it("drops empty languages and trims", () => {
    expect(cleanLocalized({ he: "  שלום ", en: "", ru: "   " })).toEqual({ he: "שלום" });
    expect(cleanLocalizedOrNull({ he: " ", en: "" })).toBeNull();
    expect(missingLocales({ he: "x", en: "y" })).toEqual(["ru", "ar", "ka"]);
  });
  it("parses and recovers aliases", () => {
    expect(parseAliases("Tiflis, tbilissi\nTIFLIS;  ")).toEqual(["tiflis", "tbilissi"]);
    expect(extractAliases("טביליסי | tbilisi | tiflis | tbilissi", names)).toEqual(["tiflis", "tbilissi"]);
  });
  it("keeps coordinates as text", () => {
    expect(coordText(41.7, null)).toEqual({ lat: "41.7", lng: "" });
  });
});

describe("schemas", () => {
  const city = {
    names,
    slug: "Tbilisi",
    lat: 41.7,
    lng: 44.8,
    timezone: "Asia/Tbilisi",
    airportCode: "tbs",
    airportLat: 41.66,
    airportLng: 44.95,
  };

  it("accepts a valid city and normalizes slug and airport code", () => {
    const parsed = citySchema.parse(city);
    expect(parsed.slug).toBe("tbilisi");
    expect(parsed.airportCode).toBe("TBS");
    expect(parsed.active).toBe(true);
  });

  it("requires Hebrew and English names and airport coordinates", () => {
    const result = citySchema.safeParse({ ...city, names: { ...names, he: "" }, airportLat: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = issuesToFieldErrors(result.error);
      expect(errors["names.he"]).toEqual(["required"]);
      expect(errors.airportLat).toEqual(["airport_coords_required"]);
    }
  });

  it("rejects bad slugs, coordinates and NaN", () => {
    expect(slugSchema.safeParse("old tbilisi").success).toBe(false);
    expect(slugSchema.safeParse("-x").success).toBe(false);
    expect(slugSchema.safeParse("old-tbilisi-2").success).toBe(true);
    const bad = citySchema.safeParse({ ...city, lat: Number.NaN, lng: 200 });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const errors = issuesToFieldErrors(bad.error);
      expect(errors.lat).toEqual(["invalid_number"]);
      expect(errors.lng).toEqual(["out_of_range"]);
    }
  });

  it("validates place phone (E.164) and website", () => {
    const base = { type: "SYNAGOGUE", names, lat: 41.7, lng: 44.8 };
    expect(placeSchema.safeParse({ ...base, phone: "+995322556500", website: "https://example.org" }).success).toBe(true);
    const bad = placeSchema.safeParse({ ...base, phone: "0322", website: "javascript:alert(1)" });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const errors = issuesToFieldErrors(bad.error);
      expect(errors.phone).toEqual(["invalid_phone"]);
      expect(errors.website).toEqual(["invalid_url"]);
    }
  });

  it("checks that an alert ends after it starts", () => {
    const alert = { title: names, body: names, startsAt: "2026-11-02T10:00:00Z" };
    expect(alertSchema.safeParse({ ...alert, endsAt: "2026-11-03T10:00:00Z" }).success).toBe(true);
    const bad = alertSchema.safeParse({ ...alert, endsAt: "2026-11-01T10:00:00Z" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(issuesToFieldErrors(bad.error).endsAt).toEqual(["ends_before_start"]);
  });

  it("validates banned words and parses bulk input", () => {
    expect(bannedWordSchema.safeParse({ phrase: "x", weight: 10 }).success).toBe(false);
    expect(bannedWordSchema.parse({ phrase: " western union ", weight: 30 })).toMatchObject({ phrase: "western union", locale: "all", action: "FLAG" });
    const { phrases, skipped } = parseBulkPhrases("Western  Union\nwestern union\n\nx\nגיפט קארד\n");
    expect(phrases).toEqual(["Western Union", "גיפט קארד"]);
    expect(skipped).toBe(2);
  });

  it("needs a phone or a URL for every emergency contact", () => {
    const ok = emergencyContactsInputSchema.safeParse({ contacts: [{ label: { en: "Embassy" }, phone: "+995 32 255 65 00" }] });
    expect(ok.success).toBe(true);
    const bad = emergencyContactsInputSchema.safeParse({ contacts: [{ label: { he: "שגרירות" } }] });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const errors = issuesToFieldErrors(bad.error);
      expect(errors["contacts.0.label.en"]).toEqual(["required"]);
      expect(errors["contacts.0.phone"]).toEqual(["required"]);
    }
  });
});

describe("dates", () => {
  it("works in Georgia time", () => {
    expect(endOfGeorgiaDay("2026-11-30").toISOString()).toBe("2026-11-30T19:59:59.999Z");
    expect(georgiaToday(new Date("2026-10-31T21:00:00Z"))).toBe("2026-11-01");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("ordering", () => {
  it("moves an item up or down and refuses impossible moves", () => {
    const list = ["a", "b", "c"];
    expect(moveItem(list, 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(list, 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(moveItem(list, 2, 1)).toBe(list);
  });
});

describe("translations", () => {
  const source = { title: "Search", filters: { city: "City", count: "{count, plural, one {{count} home} other {{count} homes}}" }, list: ["x"] };

  it("flattens nested messages", () => {
    expect(flattenMessages(source)).toEqual([
      ["title", "Search"],
      ["filters.city", "City"],
      ["filters.count", "{count, plural, one {{count} home} other {{count} homes}}"],
    ]);
  });

  it("builds and filters rows", () => {
    const rows = buildMessageRows(source, { title: "חיפוש" }, new Map([["filters.city", "עיר"]]));
    expect(rows[0]).toEqual({ key: "title", source: "Search", current: "חיפוש", override: null });
    expect(rows[1].override).toBe("עיר");
    expect(filterMessageRows(rows, { onlyOverridden: true }).map((r) => r.key)).toEqual(["filters.city"]);
    expect(filterMessageRows(rows, { onlyMissing: true }).map((r) => r.key)).toEqual(["filters.city", "filters.count"]);
    expect(filterMessageRows(rows, { query: "HOMES" }).map((r) => r.key)).toEqual(["filters.count"]);
  });

  it("finds ICU arguments but not plural option bodies", () => {
    expect(messageArguments("Hi {name}")).toEqual(["name"]);
    expect(messageArguments("{count, plural, one {{count} home in {city}} other {# homes}}").sort()).toEqual(["city", "count"]);
    expect(messageArguments("{gender, select, female {She} other {They}}")).toEqual(["gender"]);
    expect(messageArguments("Price '{'literal'}' {price, number}")).toEqual(["price"]);
    expect(messageTags("Read <link>the rules</link> and <b>x</b>")).toEqual(["link", "b"]);
  });

  it("reports placeholders and tags the original does not have", () => {
    expect(overrideProblems("Hello {name}", "שלום {name}")).toEqual({ unknownArguments: [], unknownTags: [] });
    expect(overrideProblems("Hello {name}", "שלום {user} <b>!</b>")).toEqual({ unknownArguments: ["user"], unknownTags: ["b"] });
  });
});
