import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import { locales } from "@/config/site";
import { haversineMeters, walkingMinutes, type LatLng } from "@/lib/geo";
import { NEAR_WALK_MINUTES, isNearWalk } from "@/lib/geo/walk-towns";
import { SYNAGOGUE_WALK_OPTIONS } from "@/lib/listing/search-params";
import type { NearbyInfo } from "@/lib/nearby";
import {
  MAX_PUBLIC_WALKS,
  PUBLIC_WALK_ORDER,
  WALK_STEP_MINUTES,
  countPublicWalks,
  isFirstWalkStep,
  keptWalkKinds,
  publicKm,
  publicNearby,
  publicWalkMinutes,
  publicWalkTimes,
} from "./public-walk";

describe("publicWalkMinutes (security checklist 6.d, founder's decision 2)", () => {
  it("rounds every walk UP to the next 5 minutes", () => {
    expect([1, 2, 3, 4, 5].map(publicWalkMinutes)).toEqual([5, 5, 5, 5, 5]);
    expect([6, 7, 8, 9, 10].map(publicWalkMinutes)).toEqual([10, 10, 10, 10, 10]);
    expect([11, 14, 15, 16, 29, 30].map(publicWalkMinutes)).toEqual([15, 15, 15, 20, 30, 30]);
    expect(publicWalkMinutes(0.4)).toBe(5);
  });

  it("returns null for nothing to show", () => {
    for (const value of [null, undefined, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) expect(publicWalkMinutes(value)).toBeNull();
  });

  it("is idempotent (the components round again)", () => {
    for (let m = 1; m <= 90; m++) {
      const once = publicWalkMinutes(m)!;
      expect(publicWalkMinutes(once)).toBe(once);
      expect(once % WALK_STEP_MINUTES).toBe(0);
      expect(once).toBeGreaterThanOrEqual(m);
      expect(once - m).toBeLessThan(WALK_STEP_MINUTES);
    }
  });

  it("marks only the first step as 'up to 5'", () => {
    expect(isFirstWalkStep(5)).toBe(true);
    expect(isFirstWalkStep(10)).toBe(false);
    expect(isFirstWalkStep(null)).toBe(false);
    expect(isFirstWalkStep(0)).toBe(false);
  });

  it("keeps every search filter exactly in line with what the page shows", () => {
    // The filters run on the exact stored value; with step-aligned limits, "exact ≤ limit" must be
    // the same as "shown ≤ limit", so a filter can never reveal more than the rounded number.
    const limits = [...SYNAGOGUE_WALK_OPTIONS, NEAR_WALK_MINUTES];
    for (const limit of limits) {
      expect(limit % WALK_STEP_MINUTES).toBe(0);
      for (let exact = 1; exact <= 60; exact++) expect(exact <= limit).toBe(publicWalkMinutes(exact)! <= limit);
    }
    for (let exact = 1; exact <= 60; exact++) expect(isNearWalk(exact)).toBe(isNearWalk(publicWalkMinutes(exact)));
  });
});

describe("publicKm", () => {
  it("gives whole kilometers, at least 1", () => {
    expect(publicKm(120)).toBe(1);
    expect(publicKm(1_499)).toBe(1);
    expect(publicKm(1_500)).toBe(2);
    expect(publicKm(23_740)).toBe(24);
    expect(publicKm(null)).toBeNull();
    expect(publicKm(-1)).toBeNull();
  });
});

describe("publicNearby", () => {
  const stored = {
    synagogue: { id: "p1", name: { he: "בית כנסת", en: "Synagogue", ru: "", ar: "", ka: "" }, minutes: 7, meters: 450 },
    chabad: { id: "p2", name: { he: "חב״ד", en: "Chabad", ru: "", ar: "", ka: "" }, minutes: 3, meters: 200 },
    kosherFood: { id: "p3", name: { he: "כשר", en: "Kosher", ru: "", ar: "", ka: "" }, minutes: 9, meters: 600 },
    // Around the pin: staff only, never on a page (walk-trilat-1).
    supermarket: { minutes: 4, meters: 250, name: "Pin Market", names: { en: "Pin Market" } },
    transport: { kind: "bus", minutes: 11, meters: 650, name: "Pin Stop" },
    // Around the public map point: what pages show.
    public: {
      supermarket: { minutes: 6, meters: 400, name: "Market", names: { en: "Market" } },
      transport: { kind: "tram", minutes: 2, meters: 150, name: "Tram stop" },
    },
    airport: { code: "BUS", km: 3.6 },
    exactPin: { lat: 41.6, lng: 41.6 },
  } as unknown as NearbyInfo;

  it("rounds every walking time, drops the meters, the Chabad house, unshown entries and unknown keys; airport in whole km", () => {
    expect(publicNearby(stored)).toEqual({
      synagogue: { id: "p1", name: stored.synagogue!.name, minutes: 10 },
      supermarket: { minutes: 10, name: "Market", names: { en: "Market" } },
      transport: { kind: "tram", minutes: 5, name: "Tram stop" },
      airport: { code: "BUS", km: 4 },
    });
    expect(JSON.stringify(publicNearby(stored))).not.toMatch(/meters|exactPin|kosherFood|chabad|Chabad|p2|Pin Market|Pin Stop|450|650/);
  });

  it("never shows the supermarket or stop picked around the pin, even when no public one is stored", () => {
    const { public: _public, ...pinOnly } = stored as NearbyInfo & { public?: unknown };
    void _public;
    const out = publicNearby(pinOnly as NearbyInfo);
    expect(out.supermarket).toBeUndefined();
    expect(out.transport).toBeUndefined();
  });

  it("answer (2): a Chabad house is never a listing's walking time, wherever the listing is", () => {
    for (const town of [{}, { seaWalkMinutes: 12 }, { liftWalkMinutes: 4 }]) {
      // Even a legacy row where the Chabad house was stored as the nearest "synagogue" keeps only
      // the synagogue entry by id; the Chabad entry and chabadWalkMin are gone.
      const out = publicWalkTimes({ synagogueWalkMin: 7, chabadWalkMin: 3, nearby: stored, ...town } as never);
      expect(out).not.toHaveProperty("chabadWalkMin");
      expect(out.nearby).not.toHaveProperty("chabad");
      expect(JSON.stringify(out)).not.toMatch(/chabad|Chabad|"p2"/);
      expect(out.synagogueWalkMin).toBe(10);
    }
  });

  it("answer (3): at most 3 walking times per listing, kept in the documented order", () => {
    expect(MAX_PUBLIC_WALKS).toBe(3);
    expect(PUBLIC_WALK_ORDER).toEqual(["sea", "lift", "synagogue", "transport", "supermarket"]);
    // Sea + synagogue + stop + shop: the shop (last in the order) is left out.
    const sea = publicWalkTimes({ synagogueWalkMin: 7, seaWalkMinutes: 12, liftWalkMinutes: null, nearby: stored });
    expect(sea).toMatchObject({ seaWalkMinutes: 15, synagogueWalkMin: 10, liftWalkMinutes: null });
    expect(sea.nearby.transport).toMatchObject({ kind: "tram", minutes: 5 });
    expect(sea.nearby.supermarket).toBeUndefined();
    expect(countPublicWalks(sea)).toBe(3);
    // Inland: synagogue, stop and shop all fit.
    const inland = publicWalkTimes({ synagogueWalkMin: 7, seaWalkMinutes: null, liftWalkMinutes: null, nearby: stored });
    expect(inland.nearby.supermarket).toMatchObject({ minutes: 10 });
    expect(countPublicWalks(inland)).toBe(3);
    // A broken row with both a sea and a lift walk: sea, lift, synagogue; no stop or shop.
    const both = publicWalkTimes({ synagogueWalkMin: 7, seaWalkMinutes: 3, liftWalkMinutes: 4, nearby: stored });
    expect(both).toMatchObject({ seaWalkMinutes: 5, liftWalkMinutes: 5, synagogueWalkMin: 10 });
    expect(both.nearby.transport).toBeUndefined();
    expect(both.nearby.supermarket).toBeUndefined();
    expect(both.nearby.synagogue).toMatchObject({ id: "p1" });
    // Every combination stays within the cap, and the airport (a distance, not a walk) stays.
    const values = [null, 3, 12];
    for (const s of values) for (const l of values) for (const g of values) {
      const out = publicWalkTimes({ synagogueWalkMin: g, seaWalkMinutes: s, liftWalkMinutes: l, nearby: stored });
      expect(countPublicWalks(out)).toBeLessThanOrEqual(MAX_PUBLIC_WALKS);
      expect(out.nearby.airport).toEqual({ code: "BUS", km: 4 });
    }
    expect([...keptWalkKinds({ supermarket: true, transport: true, synagogue: true, sea: true })]).toEqual(["sea", "synagogue", "transport"]);
  });

  it("the synagogue counts once whether it comes from the column or the JSON", () => {
    const noColumn = publicWalkTimes({ synagogueWalkMin: null, seaWalkMinutes: 12, nearby: stored });
    expect(noColumn.synagogueWalkMin).toBe(10);
    expect(countPublicWalks(noColumn)).toBe(3);
  });

  it("tolerates empty or broken values", () => {
    expect(publicNearby(null)).toEqual({});
    expect(publicNearby({ synagogue: { id: "x", minutes: "7" } } as unknown as NearbyInfo)).toEqual({});
    expect(publicNearby({ public: "nope" } as unknown as NearbyInfo)).toEqual({});
    expect(publicWalkTimes({})).toEqual({ synagogueWalkMin: null, seaWalkMinutes: null, liftWalkMinutes: null, nearby: {} });
  });
});

describe("walking-time texts: 'up to N' for every value, never '≈' (founder's answer (b), 5 languages)", () => {
  // [namespace, key, argument name]
  const KEYS = [
    ["listingCard", "tags.sea", "count"],
    ["listingCard", "tags.lift", "count"],
    ["listingCard", "tags.synagogue", "count"],
    ["listingCard", "badges.synagogueWalk", "count"],
    ["ds", "badges.synagogueWalk", "minutes"],
    ["listing", "nearby.walk", "count"],
    ["listing", "highlights.seaWalk", "count"],
    ["listing", "highlights.liftWalk", "count"],
    ["listing", "kosher.walk", "count"],
    ["listingFields", "facts.synagogueWalk", "count"],
    ["listingFields", "filter.synagogueMaxWalk", "count"],
    ["trips", "shabbat.walk", "count"],
  ] as const;
  // The "up to" words of each language (the same in every walking text).
  const UP_TO: Record<string, RegExp> = { he: /עד/, en: /up to/i, ru: /не больше/i, ar: /حتى/, ka: /არაუმეტეს/ };

  for (const locale of locales) {
    it(`${locale}: every step reads as an upper bound`, async () => {
      for (const [namespace, key, arg] of KEYS) {
        const messages = (await import(`../../../messages/${locale}/${namespace}.json`)).default;
        const t = createTranslator({ locale, messages: { [namespace]: messages }, namespace });
        for (const minutes of [5, 10, 15, 20, 30, 45]) {
          const text = t(key as never, { [arg]: minutes } as never) as string;
          expect(text, `${namespace}.${key} ${minutes}`).not.toContain("≈");
          expect(text, `${namespace}.${key} ${minutes}`).toMatch(UP_TO[locale]);
          expect(text).toContain(String(minutes));
        }
      }
      const account = (await import(`../../../messages/${locale}/account.json`)).default;
      const tc = createTranslator({ locale, messages: { account }, namespace: "account" });
      for (const count of [5, 10, 25]) {
        const text = tc("compare.walkMinutes", { count, countText: String(count) });
        expect(text).not.toContain("≈");
        expect(text).toMatch(UP_TO[locale]);
      }
    });
  }

  it("he: the founder's wording", async () => {
    const messages = (await import("../../../messages/he/listingCard.json")).default;
    const t = createTranslator({ locale: "he", messages: { listingCard: messages }, namespace: "listingCard" });
    expect(t("tags.sea", { count: 5 })).toBe("עד 5 דק׳ הליכה לים");
    expect(t("tags.sea", { count: 10 })).toBe("עד 10 דק׳ הליכה לים");
    expect(t("tags.synagogue", { count: 15 })).toBe("עד 15 דק׳ לבית כנסת");
  });

  it("no walking text in any language still says ≈", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(__dirname, "../../../messages");
    const offenders: string[] = [];
    for (const locale of locales) {
      for (const file of readdirSync(path.join(dir, locale))) {
        const walk = (node: unknown, at: string): void => {
          if (typeof node === "string") {
            if (node.includes("≈") && /\{(count|minutes|countText)[,}]/.test(node) && /walk|Walk|הליכה|пешком|سير|مشي|ფეხით/.test(node + at)) offenders.push(`${locale}/${file}:${at}`);
          } else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(v, at ? `${at}.${k}` : k);
        };
        walk(JSON.parse(readFileSync(path.join(dir, locale, file), "utf8")), "");
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * The attack from SECURITY_REPORT 6.d (walk-trilat-1): with the public circle (moved 120–300 m
 * from the home), the public points of the venues (synagogues, every supermarket and stop are on
 * OpenStreetMap) and everything a page shows, find every point that would show the same. It
 * models the page as it is built:
 * - the supermarket and the stop, with their NAMES and walking times, picked around the public
 *   map point (pickOsmForListing in @/lib/nearby; Poisson point sets of 10–40 stops per km²);
 * - at most two walking times measured from the pin (publicWalkTimes: the sea/lift walk and the
 *   synagogue; the third of the at most 3 walks is the stop or shop around the public point),
 *   rounded up to 5 minutes.
 * The names and walks of the supermarket and stop must add nothing at all (the region is exactly
 * the one of the walking times alone), and the same names taken from the pin, as before the fix,
 * would have shrunk it to about a building.
 */
describe("trilateration from everything a listing page shows", () => {
  const EARTH = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const move = (p: LatLng, meters: number, bearing: number): LatLng => ({
    lat: p.lat + ((meters * Math.cos(bearing)) / EARTH) * (180 / Math.PI),
    lng: p.lng + ((meters * Math.sin(bearing)) / (EARTH * Math.cos(toRad(p.lat)))) * (180 / Math.PI),
  });
  // The stored minutes exactly as src/lib/nearby.ts and src/lib/geo/walk-targets.ts make them.
  const storedMinutes = (meters: number) => walkingMinutes(Math.max(50, Math.round(meters / 50) * 50));
  const shown = (from: LatLng, venue: LatLng) => publicWalkMinutes(storedMinutes(haversineMeters(from, venue)));
  function prng(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const quantile = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.floor(q * (xs.length - 1))];
  /** The nearest point of a set (index and meters), as pickOsmNearby picks it. */
  const nearest = (from: LatLng, points: LatLng[]) => {
    let best = -1;
    let bestM = Number.POSITIVE_INFINITY;
    points.forEach((p, i) => {
      const m = haversineMeters(from, p);
      if (m < bestM) [best, bestM] = [i, m];
    });
    return { index: best, minutes: publicWalkMinutes(storedMinutes(bestM)) };
  };

  it("names and walks of the supermarket and stop add nothing; at most two pin walks keep a large region", () => {
    const rand = prng(20261108);
    const STEP = 8; // grid step in meters
    const CIRCLE = 300; // the home is within 300 m of the public circle's center
    const CIRCLE_AREA = Math.PI * CIRCLE * CIRCLE;
    const areas: number[] = [];
    const pinNameAreas: number[] = [];
    for (let scenario = 0; scenario < 30; scenario++) {
      const home = { lat: 41.64 + (rand() - 0.5) * 0.02, lng: 41.63 + (rand() - 0.5) * 0.02 };
      const center = move(home, CIRCLE * (0.4 + 0.6 * rand()), 2 * Math.PI * rand());
      const density = [10, 20, 40][scenario % 3]; // stops per km² (shops: 70% of that)
      const scatter = (perKm2: number) =>
        Array.from({ length: Math.round(perKm2 * 9) }, () => move(home, 1_500 * Math.sqrt(rand()), 2 * Math.PI * rand()));
      const shops = scatter(density * 0.7);
      const stops = scatter(density);
      // Two walking times from the pin (the most a page shows): the synagogue and the sea/lift.
      const venues = Array.from({ length: 1 + (scenario % 2) }, () => move(home, 150 + rand() * 1_350, 2 * Math.PI * rand()));
      const page = {
        walks: venues.map((v) => shown(home, v)),
        // What the page shows for the supermarket and the stop: picked around the PUBLIC point.
        shop: nearest(center, shops),
        stop: nearest(center, stops),
      };
      const pinShop = nearest(home, shops);
      const pinStop = nearest(home, stops);
      let walksOnly = 0;
      let withPublicNames = 0;
      let withPinNames = 0;
      for (let dx = -CIRCLE; dx <= CIRCLE; dx += STEP) {
        for (let dy = -CIRCLE; dy <= CIRCLE; dy += STEP) {
          if (dx * dx + dy * dy > CIRCLE * CIRCLE) continue;
          const p = move(move(center, dx, Math.PI / 2), dy, 0);
          if (!venues.every((v, i) => shown(p, v) === page.walks[i])) continue;
          walksOnly++;
          // A candidate home p would show the same supermarket and stop: they come from the
          // public point, which does not depend on p, so every candidate matches.
          const asPublished = { shop: nearest(center, shops), stop: nearest(center, stops) };
          if (asPublished.shop.index === page.shop.index && asPublished.stop.index === page.stop.index) withPublicNames++;
          // Before the fix the names came from the pin: "the nearest stop is X" from p.
          const s = nearest(p, shops);
          const t = nearest(p, stops);
          if (s.index === pinShop.index && t.index === pinStop.index && s.minutes === pinShop.minutes && t.minutes === pinStop.minutes) withPinNames++;
        }
      }
      expect(withPublicNames).toBe(walksOnly);
      const area = withPublicNames * STEP * STEP;
      areas.push(area);
      pinNameAreas.push(withPinNames * STEP * STEP);
      expect(area).toBeGreaterThanOrEqual(withPinNames * STEP * STEP);
    }
    // Measured: the median region is about half of the circle; with the names taken from the pin
    // it was a few percent (worst case about one building, the walk-trilat-1 finding).
    expect(quantile(areas, 0.5)).toBeGreaterThanOrEqual(0.25 * CIRCLE_AREA);
    expect(quantile(areas, 0.5)).toBeGreaterThanOrEqual(4 * quantile(pinNameAreas, 0.5));
    expect(quantile(pinNameAreas, 0.5)).toBeLessThan(0.1 * CIRCLE_AREA);
  });
});
