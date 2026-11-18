import { afterEach, describe, expect, it } from "vitest";
import { ALL_CONSENT, consentCookieString, NECESSARY_ONLY, type Consent } from "@/lib/consent-cookie";
import { emptyFilters } from "@/lib/listing/search-params";
import { HOME_HISTORY_ATTR, HOME_HISTORY_SCRIPT } from "./history-hint";
import {
  lastSearchExpiry,
  lastSearchHref,
  lastSearchParts,
  LAST_SEARCH_MAX_AGE_MS,
  parseLastSearch,
  stampLastSearch,
  type LastSearchDraft,
} from "./last-search";
import { lastSearchDraft } from "./last-search-draft";
import { compactStay } from "./search-card";

const NOW = new Date(2026, 10, 4, 12, 0).getTime(); // 4 Nov 2026, noon (device time)

const draft = (patch: Partial<LastSearchDraft> = {}): LastSearchDraft => ({
  query: "deal=short-stay&city=batumi&checkIn=2026-12-12&checkOut=2026-12-15&guests=2",
  deal: "short-stay",
  city: "batumi",
  neighborhood: null,
  q: null,
  checkIn: "2026-12-12",
  checkOut: "2026-12-15",
  guests: 2,
  place: "בטומי",
  placeLocale: "he",
  ...patch,
});

describe("last search: what is remembered", () => {
  it("builds the draft from the search page's filters, without the page and the map area", () => {
    const filters = {
      ...emptyFilters(),
      deal: "short-stay" as const,
      city: "batumi",
      checkIn: "2026-12-12",
      checkOut: "2026-12-15",
      guests: 2,
      page: 3,
      bounds: { north: 41.7, south: 41.5, east: 41.7, west: 41.5 },
    };
    const d = lastSearchDraft(filters, "בטומי", "he");
    expect(d?.query).toContain("city=batumi");
    expect(d?.query).not.toContain("page=");
    expect(d?.query).not.toContain("bounds=");
    expect(d).toMatchObject({ city: "batumi", checkIn: "2026-12-12", checkOut: "2026-12-15", guests: 2, place: "בטומי", placeLocale: "he" });
  });

  it("skips searches with no place and no dates ('all short stays')", () => {
    expect(lastSearchDraft({ ...emptyFilters(), deal: "short-stay" }, null, "he")).toBeNull();
    expect(lastSearchDraft({ ...emptyFilters(), q: "ואקה" }, null, "he")?.q).toBe("ואקה");
    expect(lastSearchDraft({ ...emptyFilters(), checkIn: "2026-12-01" }, null, "he")?.checkIn).toBe("2026-12-01");
  });
});

describe("last search: when it stops showing", () => {
  it("30 days after the search", () => {
    expect(lastSearchExpiry(NOW, null)).toBe(NOW + LAST_SEARCH_MAX_AGE_MS);
  });

  it("or once the check-in day is over (local midnight after it)", () => {
    expect(lastSearchExpiry(NOW, "2026-11-06")).toBe(new Date(2026, 10, 7).getTime());
    expect(lastSearchExpiry(NOW, "2027-03-01")).toBe(NOW + LAST_SEARCH_MAX_AGE_MS);
  });

  it("a search whose check-in has passed is not stored or shown", () => {
    expect(stampLastSearch(draft({ checkIn: "2026-11-01", checkOut: "2026-11-03" }), NOW)).toBeNull();
    const stamped = stampLastSearch(draft({ checkIn: "2026-11-04", checkOut: "2026-11-06" }), NOW)!;
    expect(parseLastSearch(stamped, NOW)).not.toBeNull();
    expect(parseLastSearch(stamped, new Date(2026, 10, 5, 0, 1).getTime())).toBeNull();
  });

  it("a search older than 30 days is dropped, whatever the stored expiry says", () => {
    const stamped = { ...stampLastSearch(draft({ checkIn: null, checkOut: null }), NOW)!, exp: NOW * 2 };
    expect(parseLastSearch(stamped, NOW + LAST_SEARCH_MAX_AGE_MS - 1)).not.toBeNull();
    expect(parseLastSearch(stamped, NOW + LAST_SEARCH_MAX_AGE_MS)).toBeNull();
  });

  it("rejects malformed values", () => {
    expect(parseLastSearch(null, NOW)).toBeNull();
    expect(parseLastSearch({ v: 2 }, NOW)).toBeNull();
    expect(parseLastSearch({ ...stampLastSearch(draft(), NOW), city: "<script>" }, NOW)).toBeNull();
  });
});

describe("last search: the one-tap line", () => {
  const options = {
    locale: "he",
    cityName: "בטומי",
    dealLabel: null,
    guestsLabel: (count: number) => `${count} אורחים`,
  };

  it("place · dates · guests, dates through @/lib/format", () => {
    const search = stampLastSearch(draft(), NOW)!;
    expect(lastSearchParts(search, options)).toEqual(["בטומי", compactStay("2026-12-12", "2026-12-15", "he"), "2 אורחים"]);
    expect(compactStay("2026-12-12", "2026-12-15", "he")).toBe("12–15 בדצמ׳");
    expect(compactStay("2026-12-12", "2026-12-15", "en")).toBe("Dec 12–15");
    expect(compactStay("2026-12-12", "2026-12-15", "ru")).toBe("12–15 дек.");
    expect(lastSearchHref(search)).toBe(`/search?${search.query}`);
  });

  it("uses the city's name in the page's language, not the one stored", () => {
    const search = stampLastSearch(draft({ place: "Batumi", placeLocale: "en" }), NOW)!;
    expect(lastSearchParts(search, options)[0]).toBe("בטומי");
  });

  it("names the deal when it is not a short stay", () => {
    const search = stampLastSearch(draft({ deal: "monthly", checkIn: null, checkOut: null, guests: null }), NOW)!;
    expect(lastSearchParts(search, { ...options, dealLabel: "חודשי" })).toEqual(["בטומי", "חודשי"]);
  });

  it("free text is shown as typed", () => {
    const search = stampLastSearch(draft({ city: null, q: "ואקה", place: null, checkIn: null, checkOut: null, guests: null }), NOW)!;
    expect(lastSearchParts(search, { ...options, cityName: null })).toEqual(["ואקה"]);
  });
});

describe("the 'has history' hint (no layout shift)", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).document;
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  function run(consent: Consent | null, stored: Record<string, string>): string | null {
    const attrs = new Map<string, string>();
    const g = globalThis as Record<string, unknown>;
    g.document = {
      cookie: consent ? `theme=x; ${consentCookieString(consent, { secure: false }).split(";")[0]}` : "theme=x",
      documentElement: { setAttribute: (name: string, value: string) => attrs.set(name, value) },
    };
    g.localStorage = { getItem: (key: string) => stored[key] ?? null };
    new Function(HOME_HISTORY_SCRIPT)();
    return attrs.get(HOME_HISTORY_ATTR) ?? null;
  }

  const recent = JSON.stringify([{ id: 1, at: 1 }]);
  const search = JSON.stringify(stampLastSearch(draft(), Date.now()));

  it("reserves nothing on a first visit", () => {
    expect(run(ALL_CONSENT, {})).toBeNull();
  });

  it("reserves the rows this device has", () => {
    expect(run(ALL_CONSENT, { "bayit:recently-viewed": recent })).toBe("r");
    expect(run(ALL_CONSENT, { "bayit:last-search": search })).toBe("s");
    expect(run(ALL_CONSENT, { "bayit:recently-viewed": recent, "bayit:last-search": search })).toBe("r s");
  });

  it("reserves nothing without consent or for a search that is over", () => {
    expect(run(null, { "bayit:recently-viewed": recent })).toBeNull();
    expect(run(NECESSARY_ONLY, { "bayit:recently-viewed": recent })).toBeNull();
    const over = JSON.stringify({ ...JSON.parse(search), exp: Date.now() - 1 });
    expect(run(ALL_CONSENT, { "bayit:last-search": over })).toBeNull();
  });

  it("never throws on bad data", () => {
    expect(run(ALL_CONSENT, { "bayit:recently-viewed": "{oops" })).toBeNull();
  });
});

describe("device history keys", () => {
  it("are private: logging out clears them", async () => {
    const { privateStorageKeys } = await import("@/lib/auth/device-data");
    const { RECENTLY_VIEWED_STORAGE_KEY } = await import("@/lib/recently-viewed/core");
    const { LAST_SEARCH_STORAGE_KEY } = await import("./last-search");
    expect(privateStorageKeys([RECENTLY_VIEWED_STORAGE_KEY, LAST_SEARCH_STORAGE_KEY])).toHaveLength(2);
  });

  it("the reserved-space classes read the hint's attribute", async () => {
    const layout = await import("@/components/home/continue-layout");
    for (const cls of [layout.SHOW_IF_ANY, layout.SHOW_IF_SEARCH, layout.SHOW_IF_RECENT]) {
      expect(cls).toContain(`[${HOME_HISTORY_ATTR}`);
    }
  });
});
