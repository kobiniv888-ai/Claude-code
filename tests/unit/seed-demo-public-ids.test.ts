import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { ALL_LISTINGS } = await import("../../prisma/seed/listings/all");
const { demoListingPublicId } = await import("../../prisma/seed/listings/timeline");

/**
 * The demo listings keep the public numbers #89 … #113 (88 + n) on every seed, also after their
 * rows were removed and seeded again (S1 review gate, 9 November 2026: a re-seed had given them
 * new numbers, so every page the docs and the end-to-end tests name answered 404).
 */
describe("demo listing public numbers", () => {
  it("is 88 + n, unique, within #89 … #113", () => {
    const ids = ALL_LISTINGS.map((listing) => demoListingPublicId(listing.n));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toBeGreaterThanOrEqual(89);
      expect(id).toBeLessThanOrEqual(113);
    }
  });

  it("gives the numbers the docs and tests name to the right listings", () => {
    const byId = new Map(ALL_LISTINGS.map((listing) => [demoListingPublicId(listing.n), listing]));
    // #91: Yossi's kosher short stay in Tbilisi (booking.spec.ts, guest.spec.ts).
    expect(byId.get(91)).toMatchObject({ owner: "yossi", city: "tbilisi" });
    // #104: a Batumi flat by the sea; #107: the Gudauri chalet by the lifts (walk-distance.spec.ts).
    expect(byId.get(104)).toMatchObject({ city: "batumi" });
    expect(byId.get(107)).toMatchObject({ city: "gudauri" });
    // #113: the live listing the end-to-end helpers copy for their test listings.
    expect(byId.get(113)?.status).toBe("LIVE");
  });
});
