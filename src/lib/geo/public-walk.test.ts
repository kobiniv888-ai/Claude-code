import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import { locales } from "@/config/site";
import { haversineMeters, walkingMinutes, type LatLng } from "@/lib/geo";
import { NEAR_WALK_MINUTES, isNearWalk } from "@/lib/geo/walk-towns";
import { SYNAGOGUE_WALK_OPTIONS } from "@/lib/listing/search-params";
import type { NearbyInfo } from "@/lib/nearby";
import { WALK_STEP_MINUTES, isFirstWalkStep, publicKm, publicNearby, publicWalkMinutes } from "./public-walk";

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
    supermarket: { minutes: 4, meters: 250, name: "Market", names: { en: "Market" } },
    transport: { kind: "bus", minutes: 11, meters: 650 },
    airport: { code: "BUS", km: 3.6 },
    exactPin: { lat: 41.6, lng: 41.6 },
  } as unknown as NearbyInfo;

  it("rounds every walking time, drops the meters, unshown entries and unknown keys; airport in whole km", () => {
    expect(publicNearby(stored)).toEqual({
      synagogue: { id: "p1", name: stored.synagogue!.name, minutes: 10 },
      chabad: { id: "p2", name: stored.chabad!.name, minutes: 5 },
      supermarket: { minutes: 5, name: "Market", names: { en: "Market" } },
      transport: { kind: "bus", minutes: 15 },
      airport: { code: "BUS", km: 4 },
    });
    expect(JSON.stringify(publicNearby(stored))).not.toMatch(/meters|exactPin|kosherFood|450|650/);
  });

  it("tolerates empty or broken values", () => {
    expect(publicNearby(null)).toEqual({});
    expect(publicNearby({ synagogue: { id: "x", minutes: "7" } } as unknown as NearbyInfo)).toEqual({});
  });
});

describe("walking-time texts: 'up to 5', never '≈ 5' (5 languages)", () => {
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
    ["listingFields", "facts.chabadWalk", "count"],
    ["trips", "shabbat.walk", "count"],
  ] as const;

  for (const locale of locales) {
    it(`${locale}: 5 reads as an upper bound, other steps as ≈`, async () => {
      for (const [namespace, key, arg] of KEYS) {
        const messages = (await import(`../../../messages/${locale}/${namespace}.json`)).default;
        const t = createTranslator({ locale, messages: { [namespace]: messages }, namespace });
        const five = t(key as never, { [arg]: 5 } as never) as string;
        expect(five, `${namespace}.${key}`).not.toContain("≈");
        expect(five, `${namespace}.${key}`).toContain("5");
        for (const minutes of [10, 15, 30]) {
          const text = t(key as never, { [arg]: minutes } as never) as string;
          expect(text, `${namespace}.${key} ${minutes}`).toContain("≈");
          expect(text).toContain(String(minutes));
        }
      }
      const account = (await import(`../../../messages/${locale}/account.json`)).default;
      const tc = createTranslator({ locale, messages: { account }, namespace: "account" });
      expect(tc("compare.walkMinutes", { count: 5, countText: "5" })).not.toContain("≈");
      expect(tc("compare.walkMinutes", { count: 10, countText: "10" })).toContain("≈");
    });
  }

  it("he: the founder's wording", async () => {
    const messages = (await import("../../../messages/he/listingCard.json")).default;
    const t = createTranslator({ locale: "he", messages: { listingCard: messages }, namespace: "listingCard" });
    expect(t("tags.sea", { count: 5 })).toBe("עד 5 דק׳ הליכה לים");
    expect(t("tags.sea", { count: 10 })).toBe("≈ 10 דק׳ הליכה לים");
  });
});

/**
 * The attack from SECURITY_REPORT 6.d: with the public circle (moved 120–300 m from the home) and
 * the public points of a few venues (synagogues, beaches, shops are all on the map), find every
 * point whose walking times match the ones the page shows. With exact minutes that area was a few
 * dozen meters across; with 5-minute steps it must stay large.
 */
describe("trilateration from public walking times", () => {
  const EARTH = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const move = (p: LatLng, meters: number, bearing: number): LatLng => ({
    lat: p.lat + ((meters * Math.cos(bearing)) / EARTH) * (180 / Math.PI),
    lng: p.lng + ((meters * Math.sin(bearing)) / (EARTH * Math.cos(toRad(p.lat)))) * (180 / Math.PI),
  });
  // The stored minutes exactly as src/lib/nearby.ts and src/lib/geo/walk-targets.ts make them.
  const storedMinutes = (meters: number) => walkingMinutes(Math.max(50, Math.round(meters / 50) * 50));
  function prng(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  it("keeps the home hidden in a region many times larger than with exact minutes", () => {
    const rand = prng(20261108);
    const STEP = 6; // grid step in meters
    const CIRCLE = 300; // the home is within 300 m of the public circle's center
    const newAreas: number[] = [];
    const oldAreas: number[] = [];
    const newGuessErrors: number[] = [];
    for (let scenario = 0; scenario < 36; scenario++) {
      const home = { lat: 41.64 + (rand() - 0.5) * 0.02, lng: 41.63 + (rand() - 0.5) * 0.02 };
      const center = move(home, CIRCLE * (0.4 + 0.6 * rand()), 2 * Math.PI * rand());
      const venues = Array.from({ length: 2 + (scenario % 3) }, () => move(home, 150 + rand() * 1350, 2 * Math.PI * rand()));
      const exactShown = venues.map((v) => storedMinutes(haversineMeters(home, v)));
      const publicShown = exactShown.map((m) => publicWalkMinutes(m));
      let oldCount = 0;
      const matches: LatLng[] = [];
      for (let dx = -CIRCLE; dx <= CIRCLE; dx += STEP) {
        for (let dy = -CIRCLE; dy <= CIRCLE; dy += STEP) {
          if (dx * dx + dy * dy > CIRCLE * CIRCLE) continue;
          const p = move(move(center, dx, Math.PI / 2), dy, 0);
          const minutes = venues.map((v) => storedMinutes(haversineMeters(p, v)));
          if (minutes.every((m, i) => m === exactShown[i])) oldCount++;
          if (minutes.every((m, i) => publicWalkMinutes(m) === publicShown[i])) matches.push(p);
        }
      }
      const newArea = matches.length * STEP * STEP;
      // The home itself always matches (sanity), and every scenario is at least 2× harder than with
      // exact minutes. Measured on these 36 scenarios: the region grows from a median of about
      // 2,400 m² to about 42,000 m²; the worst case (4 walking times in a lucky geometry) is still
      // about 1,400 m², which is why the page shows at most one walk per kind (publicNearby drops
      // the ones no page shows) — see the privacy-location report.
      expect(matches.some((p) => haversineMeters(p, home) < STEP * 1.5)).toBe(true);
      expect(newArea).toBeGreaterThanOrEqual(1_000);
      expect(newArea).toBeGreaterThanOrEqual(2 * oldCount * STEP * STEP);
      const guess = {
        lat: matches.reduce((s, p) => s + p.lat, 0) / matches.length,
        lng: matches.reduce((s, p) => s + p.lng, 0) / matches.length,
      };
      newAreas.push(newArea);
      oldAreas.push(oldCount * STEP * STEP);
      newGuessErrors.push(haversineMeters(guess, home));
    }
    expect(median(newAreas)).toBeGreaterThanOrEqual(8 * median(oldAreas));
    expect(median(newGuessErrors)).toBeGreaterThanOrEqual(40);
  });
});
