import { describe, expect, it } from "vitest";
import {
  LruCache,
  QueueFullError,
  createSerialQueue,
  geocodeCacheKey,
  normalizeGeocodeQuery,
  parseNominatim,
  streetAddress,
} from "./core";

describe("normalizeGeocodeQuery", () => {
  it("trims, collapses spaces and refuses short queries", () => {
    expect(normalizeGeocodeQuery("  Chavchavadze   Ave  12 ")).toBe("Chavchavadze Ave 12");
    expect(normalizeGeocodeQuery("ab")).toBeNull();
    expect(normalizeGeocodeQuery("  a b ")).toBe("a b");
    expect(normalizeGeocodeQuery(null)).toBeNull();
    expect(normalizeGeocodeQuery(42)).toBeNull();
  });
  it("cuts very long queries", () => {
    expect(normalizeGeocodeQuery("x".repeat(500))?.length).toBe(200);
  });
});

describe("geocodeCacheKey", () => {
  it("ignores case but keeps the language apart", () => {
    expect(geocodeCacheKey("Rustaveli Ave", "he")).toBe(geocodeCacheKey("rustaveli ave", "he"));
    expect(geocodeCacheKey("Rustaveli Ave", "he")).not.toBe(geocodeCacheKey("Rustaveli Ave", "en"));
  });
});

describe("parseNominatim", () => {
  it("maps rows and drops malformed ones", () => {
    const rows = [
      { place_id: 1, display_name: "Rustaveli Ave, Tbilisi", lat: "41.7", lon: "44.8" },
      { place_id: 2, display_name: "", lat: "41", lon: "44" },
      { place_id: 3, display_name: "Bad", lat: "x", lon: "44" },
      null,
    ];
    expect(parseNominatim(rows)).toEqual([{ id: "1", label: "Rustaveli Ave, Tbilisi", street: null, lat: 41.7, lng: 44.8 }]);
    expect(parseNominatim({ error: "nope" })).toEqual([]);
  });
  it("returns at most 6 results", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ place_id: i, display_name: `R${i}`, lat: "41", lon: "44" }));
    expect(parseNominatim(rows)).toHaveLength(6);
  });
});

describe("street and house number only (bug 2.6)", () => {
  // What OpenStreetMap answered (3 Nov 2026) for the founder's search "sherif khimshiashvili 7" (Batumi).
  const publicServiceHall = {
    place_id: 206470631,
    osm_type: "way",
    category: "office",
    type: "government",
    name: "Public Service Hall",
    display_name: "Public Service Hall, 7, Sherif Khimshiashvili Street, Khimshiashvili, Batumi, Autonomous Republic of Adjara, 6000, Georgia",
    lat: "41.6411168",
    lon: "41.6150946",
    address: {
      office: "Public Service Hall",
      house_number: "7",
      road: "Sherif Khimshiashvili Street",
      suburb: "Khimshiashvili",
      city: "Batumi",
      state: "Autonomous Republic of Adjara",
      "ISO3166-2-lvl4": "GE-AJ",
      postcode: "6000",
      country: "Georgia",
      country_code: "ge",
    },
  };

  it("fills the address with the street and number, never the building's name", () => {
    const [result] = parseNominatim([publicServiceHall]);
    expect(result.street).toBe("Sherif Khimshiashvili Street 7");
    expect(result.street).not.toContain("Public Service Hall");
    // The full name stays for the list of results, and the pin goes on the result.
    expect(result.label).toBe(publicServiceHall.display_name);
    expect(result).toMatchObject({ lat: 41.6411168, lng: 41.6150946 });
  });

  it("uses a pedestrian street or footway when there is no road; a street without a number stays a street", () => {
    expect(streetAddress({ pedestrian: "Rustaveli Avenue", house_number: "12" })).toBe("Rustaveli Avenue 12");
    expect(streetAddress({ road: "Chavchavadze Avenue" })).toBe("Chavchavadze Avenue");
  });

  it("gives nothing for a result without a street (a city, a landmark, a bare number)", () => {
    expect(streetAddress({ city: "Batumi", country: "Georgia" })).toBeNull();
    expect(streetAddress({ tourism: "Alphabetic Tower", house_number: "5" })).toBeNull();
    expect(streetAddress(undefined)).toBeNull();
    expect(parseNominatim([{ place_id: 9, display_name: "Batumi, Adjara, Georgia", lat: "41.64", lon: "41.63" }])[0].street).toBeNull();
  });

  it("asks again for cached results from before streets were parsed", () => {
    expect(geocodeCacheKey("sherif khimshiashvili 7", "he").startsWith("v2|")).toBe(true);
  });
});

describe("LruCache", () => {
  it("evicts the least recently used entry and expires old ones", () => {
    let now = 0;
    const cache = new LruCache<number>(2, 1000, () => now);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1); // a is now the newest
    cache.set("c", 3); // evicts b
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    now = 1500;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(1);
  });
});

describe("createSerialQueue (site-wide 1 request per second)", () => {
  function fakeClock() {
    let now = 0;
    return {
      now: () => now,
      sleep: async (ms: number) => {
        now += ms;
      },
    };
  }

  it("runs tasks one at a time, at least the interval apart", async () => {
    const clock = fakeClock();
    const queue = createSerialQueue({ intervalMs: 1100, maxPending: 10, ...clock });
    const starts: number[] = [];
    let running = 0;
    let maxRunning = 0;
    const task = async () => {
      starts.push(clock.now());
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await Promise.resolve();
      running -= 1;
      return starts.length;
    };
    const results = await Promise.all([queue.run(task), queue.run(task), queue.run(task)]);
    expect(results).toEqual([1, 2, 3]);
    expect(maxRunning).toBe(1);
    for (let i = 1; i < starts.length; i += 1) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(1100);
  });

  it("keeps going after a failed task", async () => {
    const clock = fakeClock();
    const queue = createSerialQueue({ intervalMs: 1000, maxPending: 10, ...clock });
    const failed = queue.run(async () => {
      throw new Error("upstream down");
    });
    const next = queue.run(async () => "ok");
    await expect(failed).rejects.toThrow("upstream down");
    await expect(next).resolves.toBe("ok");
  });

  it("refuses work beyond maxPending", async () => {
    const clock = fakeClock();
    const queue = createSerialQueue({ intervalMs: 1000, maxPending: 2, ...clock });
    const a = queue.run(async () => 1);
    const b = queue.run(async () => 2);
    await expect(queue.run(async () => 3)).rejects.toBeInstanceOf(QueueFullError);
    await expect(Promise.all([a, b])).resolves.toEqual([1, 2]);
    expect(queue.pending).toBe(0);
  });
});
