import { describe, expect, it } from "vitest";
import { listingBadgeItems, listingPhotoTags } from "./badge-items";

describe("listingBadgeItems", () => {
  it("lists the features that apply, most useful first", () => {
    const items = listingBadgeItems({
      speaksHebrew: true,
      verified: true,
      welcomes: true,
      kosherKitchen: true,
      synagogueWalkMin: 7,
      shabbatFriendly: false,
    });
    expect(items).toEqual([
      { kind: "welcomes" },
      { kind: "verified" },
      { kind: "synagogueWalk", minutes: 7 },
      { kind: "kosherKitchen" },
      { kind: "hebrew" },
    ]);
  });

  it("treats 0 walking minutes as a synagogue badge and missing flags as false", () => {
    expect(listingBadgeItems({ synagogueWalkMin: 0 })).toEqual([{ kind: "synagogueWalk", minutes: 0 }]);
    expect(listingBadgeItems({ synagogueWalkMin: null })).toEqual([]);
    expect(listingBadgeItems({})).toEqual([]);
  });

  it("can leave kinds out (e.g. welcomes, already on the photo)", () => {
    expect(listingBadgeItems({ welcomes: true, verified: true }, { exclude: ["welcomes"] })).toEqual([{ kind: "verified" }]);
  });
});

describe("listingPhotoTags", () => {
  it("puts welcomes first and keeps at most two tags", () => {
    expect(listingPhotoTags({ welcomes: true, isNew: true, priceDropped: true })).toEqual([{ kind: "welcomes" }, { kind: "new" }]);
  });

  it("always shows demo and promoted, even when that drops welcomes", () => {
    expect(listingPhotoTags({ welcomes: true, demo: true })).toEqual([{ kind: "welcomes" }, { kind: "demo" }]);
    expect(listingPhotoTags({ welcomes: true, demo: true, promoted: true })).toEqual([{ kind: "demo" }, { kind: "promoted" }]);
    expect(listingPhotoTags({ isNew: true, promoted: true })).toEqual([{ kind: "new" }, { kind: "promoted" }]);
  });

  it("returns nothing for a plain listing", () => {
    expect(listingPhotoTags({})).toEqual([]);
  });
});
