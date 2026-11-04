import { describe, expect, it } from "vitest";
import { ALL_CONSENT, makeConsent, NECESSARY_ONLY } from "@/lib/consent-cookie";
import {
  addViewed,
  mayKeepOnDevice,
  mergeViewed,
  mustClearDevice,
  RECENTLY_VIEWED_KEEP,
  RECENTLY_VIEWED_SHOW,
  sameViewed,
  sanitizeViewed,
  viewedIds,
  type ViewedItem,
} from "./core";

const NOW = 1_800_000_000_000;
const items = (...pairs: [number, number][]): ViewedItem[] => pairs.map(([id, at]) => ({ id, at }));

describe("recently viewed: limits", () => {
  it("stores up to 50 and shows 10", () => {
    expect(RECENTLY_VIEWED_KEEP).toBe(50);
    expect(RECENTLY_VIEWED_SHOW).toBe(10);
  });
});

describe("addViewed", () => {
  it("puts the view on top and keeps each listing once", () => {
    expect(addViewed(items([1, 10], [2, 9]), 2, 20)).toEqual(items([2, 20], [1, 10]));
  });

  it("keeps at most the limit", () => {
    const full = Array.from({ length: RECENTLY_VIEWED_KEEP }, (_, i) => ({ id: i + 1, at: 1000 - i }));
    const next = addViewed(full, 999, 2000);
    expect(next).toHaveLength(RECENTLY_VIEWED_KEEP);
    expect(next[0]).toEqual({ id: 999, at: 2000 });
    expect(next.at(-1)?.id).toBe(RECENTLY_VIEWED_KEEP - 1);
  });

  it("ignores IDs that are not public IDs", () => {
    expect(addViewed(items([1, 10]), -3, 20)).toEqual(items([1, 10]));
    expect(addViewed(items([1, 10]), 1.5, 20)).toEqual(items([1, 10]));
  });
});

describe("mergeViewed (sign-in merge)", () => {
  it("joins device and account, newest first, the newest view of a listing wins", () => {
    const device = items([5, 300], [3, 100]);
    const account = items([3, 250], [7, 200], [9, 50]);
    expect(mergeViewed([device, account], NOW)).toEqual(items([5, 300], [3, 250], [7, 200], [9, 50]));
  });

  it("dedupes inside one list too", () => {
    expect(mergeViewed([items([1, 10], [1, 30], [2, 20])], NOW)).toEqual(items([1, 30], [2, 20]));
  });

  it("cuts to the limit (store 50)", () => {
    const device = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, at: 10_000 - i }));
    const account = Array.from({ length: 40 }, (_, i) => ({ id: 100 + i, at: 5_000 - i }));
    const merged = mergeViewed([device, account], NOW);
    expect(merged).toHaveLength(RECENTLY_VIEWED_KEEP);
    expect(merged.slice(0, 40).map((item) => item.id)).toEqual(device.map((item) => item.id));
    expect(merged.at(-1)?.id).toBe(109);
  });

  it("never trusts a time in the future (another device's clock)", () => {
    const merged = mergeViewed([items([1, NOW + 60_000]), items([2, NOW - 1])], NOW);
    expect(merged).toEqual(items([1, NOW], [2, NOW - 1]));
  });

  it("is idempotent and keeps the earlier list first on equal times", () => {
    const device = items([1, 100], [2, 100]);
    const account = items([3, 100]);
    const once = mergeViewed([device, account], NOW);
    expect(once.map((i) => i.id)).toEqual([1, 2, 3]);
    expect(sameViewed(mergeViewed([once, account], NOW), once)).toBe(true);
  });

  it("drops invalid IDs", () => {
    expect(mergeViewed([items([0, 5], [-1, 5], [4, 5])], NOW)).toEqual(items([4, 5]));
  });
});

describe("sanitizeViewed (reading the device copy)", () => {
  it("reads the round-2 format (IDs only, newest first) in the same order", () => {
    const list = sanitizeViewed([12, 7, 12, "x", 3], NOW);
    expect(viewedIds(list)).toEqual([12, 7, 3]);
    expect(list.every((item) => item.at <= NOW)).toBe(true);
  });

  it("reads the round-3 format and sorts it", () => {
    expect(sanitizeViewed([{ id: 1, at: 5 }, { id: 2, at: 9 }, { id: "3", at: 1 }, null], NOW)).toEqual(items([2, 9], [1, 5]));
  });

  it("returns nothing for anything else", () => {
    expect(sanitizeViewed({ id: 1 }, NOW)).toEqual([]);
    expect(sanitizeViewed(null, NOW)).toEqual([]);
  });

  it("keeps at most the limit", () => {
    expect(sanitizeViewed(Array.from({ length: 80 }, (_, i) => i + 1), NOW)).toHaveLength(RECENTLY_VIEWED_KEEP);
  });
});

describe("cookie consent (functional preference)", () => {
  it("keeps history on the device only after 'preferences' or 'accept all'", () => {
    expect(mayKeepOnDevice(null)).toBe(false);
    expect(mayKeepOnDevice(NECESSARY_ONLY)).toBe(false);
    expect(mayKeepOnDevice(makeConsent({ preferences: false, analytics: true }))).toBe(false);
    expect(mayKeepOnDevice(makeConsent({ preferences: true, analytics: false }))).toBe(true);
    expect(mayKeepOnDevice(ALL_CONSENT)).toBe(true);
  });

  it("removes it once the visitor chose without 'preferences', never before they chose", () => {
    expect(mustClearDevice(null)).toBe(false);
    expect(mustClearDevice(NECESSARY_ONLY)).toBe(true);
    expect(mustClearDevice(makeConsent({ preferences: false, analytics: true }))).toBe(true);
    expect(mustClearDevice(ALL_CONSENT)).toBe(false);
  });
});
