/**
 * Who a saved trip copy belongs to (round 3 phase-5 hardening, privacy-1): the owner key, the
 * content key, and the browser-side reconcile that <PrivateCacheGuard> runs on every page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFFLINE_TRIPS_CACHE, OFFLINE_TRIPS_INDEX, type OfflineTripEntry } from "./offline";
import { reconcileOfflineTrips, removeOfflinePage, savedOfflineEntry } from "./offline-device";
import { offlineOwnerKey, offlineOwnerKeyFor, offlineTripVersion } from "./offline-server";

vi.mock("server-only", () => ({}));

const ORIGIN = "https://bayit.example";
const keyOf = (request: string | { url: string }) => new URL(typeof request === "string" ? request : request.url, ORIGIN).pathname;

function installCaches() {
  const store = new Map<string, Map<string, Response>>();
  const cacheOf = (entries: Map<string, Response>) => ({
    match: async (request: string) => entries.get(keyOf(request))?.clone(),
    put: async (request: string, response: Response) => void entries.set(keyOf(request), response.clone()),
    delete: async (request: string) => entries.delete(keyOf(request)),
  });
  const caches = {
    has: async (name: string) => store.has(name),
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      return cacheOf(store.get(name)!);
    },
    delete: async (name: string) => store.delete(name),
  };
  Object.assign(globalThis, { caches, window: { isSecureContext: true, caches } });
  return store;
}

const ALICE = offlineOwnerKey("user_alice");
const BOB = offlineOwnerKey("user_bob");

function entry(path: string, owner: string | undefined, keepUntil = "2099-01-01"): Partial<OfflineTripEntry> {
  return {
    path,
    code: path.slice(-8),
    ...(owner ? { owner } : {}),
    title: "דירה",
    checkIn: "2026-11-13",
    checkOut: "2026-11-15",
    status: "CONFIRMED",
    savedAt: "2026-11-07T12:00:00.000Z",
    keepUntil,
    version: "0123456789abcdef",
  };
}

async function seed(store: Map<string, Map<string, Response>>, entries: Partial<OfflineTripEntry>[]) {
  const cache = new Map<string, Response>();
  for (const e of entries) cache.set(e.path!, new Response(`copy of ${e.path}`));
  cache.set(OFFLINE_TRIPS_INDEX, new Response(JSON.stringify({ trips: entries })));
  store.set(OFFLINE_TRIPS_CACHE, cache);
}

const A1 = "/he/account/trips/BT-7K3Q9";
const A2 = "/en/account/trips/BT-22222";
const B1 = "/he/account/trips/BT-33333";

describe("offline owner and content keys", () => {
  it("is a short keyed hash, the same for one account and different between accounts", () => {
    expect(ALICE).toMatch(/^[0-9a-f]{24}$/);
    expect(offlineOwnerKey("user_alice")).toBe(ALICE);
    expect(BOB).not.toBe(ALICE);
    expect(ALICE).not.toContain("alice");
    expect(offlineOwnerKeyFor(null)).toBeNull();
    expect(offlineOwnerKeyFor(undefined)).toBeUndefined();
    expect(offlineOwnerKeyFor({ id: "user_alice" })).toBe(ALICE);
  });

  it("gives the same content key for the same content, whatever the key order", () => {
    const a = offlineTripVersion({ status: "CONFIRMED", address: "x", times: ["15:00", "11:00"] });
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(offlineTripVersion({ times: ["15:00", "11:00"], address: "x", status: "CONFIRMED" })).toBe(a);
    expect(offlineTripVersion({ status: "CONFIRMED", address: "y", times: ["15:00", "11:00"] })).not.toBe(a);
    expect(offlineTripVersion({ status: "CONFIRMED", address: "x", times: ["16:00", "11:00"] })).not.toBe(a);
  });
});

describe("reconcileOfflineTrips (the guard on every page)", () => {
  let store: Map<string, Map<string, Response>>;
  beforeEach(() => {
    store = installCaches();
  });
  afterEach(() => {
    delete (globalThis as { caches?: unknown }).caches;
    delete (globalThis as { window?: unknown }).window;
  });

  it("signed out (session expired, logged out everywhere, suspended, deleted): the whole cache goes", async () => {
    await seed(store, [entry(A1, ALICE)]);
    await reconcileOfflineTrips(null, "2026-11-07");
    expect(store.has(OFFLINE_TRIPS_CACHE)).toBe(false);
  });

  it("another account signs in: the first account's copies go, theirs stay", async () => {
    await seed(store, [entry(A1, ALICE), entry(A2, ALICE), entry(B1, BOB)]);
    await reconcileOfflineTrips(BOB, "2026-11-07");
    const cache = store.get(OFFLINE_TRIPS_CACHE)!;
    expect(cache.has(A1)).toBe(false);
    expect(cache.has(A2)).toBe(false);
    expect(cache.has(B1)).toBe(true);
    const index = JSON.parse(await cache.get(OFFLINE_TRIPS_INDEX)!.clone().text()) as { trips: OfflineTripEntry[] };
    expect(index.trips.map((t) => t.path)).toEqual([B1]);
    expect(await savedOfflineEntry(A1, ALICE)).toBeNull();
    expect((await savedOfflineEntry(B1, BOB))?.path).toBe(B1);
  });

  it("another account signs in and none of the copies are theirs: the whole cache goes", async () => {
    await seed(store, [entry(A1, ALICE)]);
    await reconcileOfflineTrips(BOB, "2026-11-07");
    expect(store.has(OFFLINE_TRIPS_CACHE)).toBe(false);
  });

  it("the same account: nothing changes (no rewrite)", async () => {
    await seed(store, [entry(A1, ALICE)]);
    const before = store.get(OFFLINE_TRIPS_CACHE)!.get(OFFLINE_TRIPS_INDEX);
    await reconcileOfflineTrips(ALICE, "2026-11-07");
    expect(store.get(OFFLINE_TRIPS_CACHE)!.get(OFFLINE_TRIPS_INDEX)).toBe(before);
    expect(store.get(OFFLINE_TRIPS_CACHE)!.has(A1)).toBe(true);
  });

  it("copies saved before owners existed, and copies past their last day, go", async () => {
    await seed(store, [entry(A1, undefined), entry(A2, ALICE, "2026-11-01"), entry(B1, ALICE)]);
    await reconcileOfflineTrips(ALICE, "2026-11-07");
    const cache = store.get(OFFLINE_TRIPS_CACHE)!;
    expect([cache.has(A1), cache.has(A2), cache.has(B1)]).toEqual([false, false, true]);
  });

  it("another account's copy is not 'saved' for this account, and removing the last copy drops the cache", async () => {
    await seed(store, [entry(A1, ALICE)]);
    expect(await savedOfflineEntry(A1, BOB)).toBeNull();
    expect(await savedOfflineEntry(A1, null)).toBeNull();
    await removeOfflinePage(A1);
    expect(store.has(OFFLINE_TRIPS_CACHE)).toBe(false);
  });
});
