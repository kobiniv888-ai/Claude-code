import { describe, expect, it, vi } from "vitest";
import { haversineMeters, walkingMinutes } from "@/lib/geo";
import seaData from "@/data/osm/sea.json";
import liftData from "@/data/osm/ski-lifts.json";
import {
  NEAR_WALK_MINUTES,
  SEA_TOWNS,
  SKI_TOWNS,
  WALK_CAP_MINUTES,
  capMeters,
  isNearWalk,
  isSeaTown,
  isSkiTown,
  nearestMeters,
  walkMinutesFor,
  walkMinutesFromMeters,
  walkMinutesTo,
  walkToLift,
  walkToSea,
} from "./walk-targets";

vi.mock("server-only", () => ({}));

/** A point `meters` east of `from` along its parallel (on the 6,371 km sphere haversine uses). */
function east(from: { lat: number; lng: number }, meters: number) {
  const metersPerDegree = (6_371_000 * Math.PI) / 180;
  return { lat: from.lat, lng: from.lng + meters / (metersPerDegree * Math.cos((from.lat * Math.PI) / 180)) };
}

const origin = { lat: 41.6, lng: 41.6 };
const area = [41.5, 41.5, 41.7, 41.7] as const;

describe("walking minutes (the synagogue method: 50 m steps × detour / pace)", () => {
  it("rounds the straight line to 50 m, then applies the detour factor and the pace", () => {
    expect(walkMinutesFromMeters(0)).toBe(1); // at least 50 m → 1 minute
    expect(walkMinutesFromMeters(410)).toBe(walkingMinutes(400)); // 400 × 1.3 / 80 = 6.5 → 7
    expect(walkMinutesFromMeters(410)).toBe(7);
    expect(walkMinutesFromMeters(924)).toBe(walkingMinutes(900)); // 14.6 → 15
    expect(walkMinutesFromMeters(924)).toBe(15);
    expect(walkMinutesFromMeters(1000)).toBe(16);
  });

  it("measures with haversine (fixture points 600 m apart)", () => {
    const b = east(origin, 600);
    expect(haversineMeters(origin, b)).toBeCloseTo(600, 0);
    expect(nearestMeters(origin, [[b.lat, b.lng]], 1000)).toBeCloseTo(600, 0);
  });

  it("picks the nearest point and ignores points beyond the limit", () => {
    const near = east(origin, 300);
    const far = east(origin, 1200);
    expect(nearestMeters(origin, [[far.lat, far.lng], [near.lat, near.lng]], 2000)).toBeCloseTo(300, 0);
    expect(nearestMeters(origin, [[far.lat, far.lng]], 1000)).toBeNull();
    expect(nearestMeters(origin, [], 1000)).toBeNull();
  });

  it("caps at 30 minutes (≈ 1.9 km straight line)", () => {
    expect(WALK_CAP_MINUTES).toBe(30);
    expect(walkMinutesFromMeters(capMeters() - 1)).toBeLessThanOrEqual(31);
    const at29 = east(origin, 1780);
    const at35 = east(origin, 2150);
    expect(walkMinutesTo(origin, { areas: [area], targets: [[at29.lat, at29.lng]] })).toBe(29);
    expect(walkMinutesTo(origin, { areas: [area], targets: [[at35.lat, at35.lng]] })).toBeNull();
  });
});

describe("walkMinutesTo (fixture points)", () => {
  const beach = east(origin, 400);
  const coast = east(origin, 150);

  it("is null outside every area", () => {
    expect(walkMinutesTo({ lat: 42, lng: 44 }, { areas: [area], targets: [[beach.lat, beach.lng]] })).toBeNull();
  });

  it("uses the targets first, the fallback only when no target is within the cap", () => {
    const data = { areas: [area], targets: [[beach.lat, beach.lng]] as const, fallback: [[coast.lat, coast.lng]] as const };
    expect(walkMinutesTo(origin, data)).toBe(7); // the beach (400 m), not the closer coastline
    const farBeach = east(origin, 5000);
    expect(walkMinutesTo(origin, { ...data, targets: [[farBeach.lat, farBeach.lng]] })).toBe(walkMinutesFromMeters(150));
    expect(walkMinutesTo(origin, { areas: [area], targets: [] })).toBeNull();
  });

  it("is null for coordinates that are not numbers", () => {
    expect(walkMinutesTo({ lat: Number.NaN, lng: 41.6 }, { areas: [area], targets: [[beach.lat, beach.lng]] })).toBeNull();
  });
});

describe("town gating", () => {
  it("lists the founder's towns", () => {
    expect([...SEA_TOWNS]).toEqual(["batumi", "kobuleti"]);
    expect([...SKI_TOWNS]).toEqual(["gudauri", "bakuriani", "mestia"]);
    expect(isSeaTown("batumi")).toBe(true);
    expect(isSeaTown("kobuleti")).toBe(true);
    expect(isSeaTown("tbilisi")).toBe(false);
    expect(isSeaTown(null)).toBe(false);
    expect(isSkiTown("gudauri")).toBe(true);
    expect(isSkiTown("mestia")).toBe(true);
    expect(isSkiTown("kazbegi")).toBe(false);
    expect(isSkiTown(undefined)).toBe(false);
  });

  it("gives the sea only to sea towns and the lifts only to ski towns", () => {
    const batumi = { lat: 41.6249, lng: 41.5979 }; // near the New Boulevard beach
    const gudauri = { lat: 42.4769, lng: 44.4811 };
    expect(walkMinutesFor("batumi", batumi.lat, batumi.lng).seaWalkMinutes).toBeGreaterThan(0);
    expect(walkMinutesFor("batumi", batumi.lat, batumi.lng).liftWalkMinutes).toBeNull();
    // Same pin, a city that is not a sea town: nothing.
    expect(walkMinutesFor("tbilisi", batumi.lat, batumi.lng)).toEqual({ seaWalkMinutes: null, liftWalkMinutes: null });
    expect(walkMinutesFor(null, batumi.lat, batumi.lng)).toEqual({ seaWalkMinutes: null, liftWalkMinutes: null });
    expect(walkMinutesFor("gudauri", gudauri.lat, gudauri.lng).liftWalkMinutes).toBeGreaterThan(0);
    expect(walkMinutesFor("gudauri", gudauri.lat, gudauri.lng).seaWalkMinutes).toBeNull();
    // A sea town with a pin far from the data (a pin that was never moved there): nothing.
    expect(walkMinutesFor("batumi", gudauri.lat, gudauri.lng)).toEqual({ seaWalkMinutes: null, liftWalkMinutes: null });
  });

  it("is null without a pin", () => {
    expect(walkMinutesFor("batumi", null, null)).toEqual({ seaWalkMinutes: null, liftWalkMinutes: null });
    expect(walkMinutesFor("gudauri", 42.47, null)).toEqual({ seaWalkMinutes: null, liftWalkMinutes: null });
  });
});

describe("the ≤ 15 minutes rule (card tag and filter)", () => {
  it("accepts 1–15 minutes only", () => {
    expect(NEAR_WALK_MINUTES).toBe(15);
    expect(isNearWalk(1)).toBe(true);
    expect(isNearWalk(15)).toBe(true);
    expect(isNearWalk(16)).toBe(false);
    expect(isNearWalk(0)).toBe(false);
    expect(isNearWalk(null)).toBe(false);
    expect(isNearWalk(undefined)).toBe(false);
  });
});

describe("the static OpenStreetMap data", () => {
  it("records its source, licence and date", () => {
    for (const file of [seaData, liftData]) {
      expect(file.attribution).toBe("© OpenStreetMap contributors");
      expect(file.license).toBe("ODbL-1.0");
      expect(file.extractedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("covers Batumi (with Gonio and Makhinjauri) and Kobuleti", () => {
    // Real places on the coast: each is a short walk from a mapped beach.
    expect(walkToSea(41.6255, 41.5985)).toBeLessThanOrEqual(10); // New Boulevard
    expect(walkToSea(41.5615, 41.574)).toBeLessThanOrEqual(15); // Gonio
    expect(walkToSea(41.673, 41.699)).toBeLessThanOrEqual(10); // Makhinjauri
    expect(walkToSea(41.8214, 41.7792)).toBeLessThanOrEqual(10); // Kobuleti
    expect(walkToSea(41.7151, 44.8271)).toBeNull(); // Tbilisi
  });

  it("covers the lifts of Gudauri, Bakuriani and Mestia", () => {
    expect(walkToLift(42.4775, 44.4795)).toBeLessThanOrEqual(15); // Gudauri center
    expect(walkToLift(41.737, 43.517)).toBeLessThanOrEqual(30); // Didveli
    expect(walkToLift(43.0453, 42.7266)).toBeLessThanOrEqual(20); // Mestia
    expect(walkToLift(41.6168, 41.6367)).toBeNull(); // Batumi
  });

  it("stays small", () => {
    expect(JSON.stringify(seaData).length + JSON.stringify(liftData).length).toBeLessThan(300_000);
  });
});
