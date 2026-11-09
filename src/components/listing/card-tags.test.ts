import { describe, expect, it } from "vitest";
import { emptyFilters } from "@/lib/listing/search-params";
import { cardDealLabel, cardPhotoTag, cardTags, MAX_CARD_TAGS, preferredCardTags, stayNights } from "./card-tags";

describe("cardPhotoTag", () => {
  it("shows at most one tag: demo, then promoted, then new", () => {
    expect(cardPhotoTag({ demo: true, promoted: true, isNew: true })).toBe("demo");
    expect(cardPhotoTag({ promoted: true, isNew: true })).toBe("promoted");
    expect(cardPhotoTag({ isNew: true })).toBe("new");
    expect(cardPhotoTag({})).toBeNull();
  });
});

describe("cardDealLabel", () => {
  it("names every type but short stays (round 3: למכירה, חודשי, מלון)", () => {
    expect(cardDealLabel("SHORT_STAY")).toBeNull();
    expect(cardDealLabel("MONTHLY_RENT")).toBe("MONTHLY_RENT");
    expect(cardDealLabel("SALE")).toBe("SALE");
    expect(cardDealLabel("HOTEL_ROOM")).toBe("HOTEL_ROOM");
  });

  it("is not one of the two tags", () => {
    const all = { kosherKitchen: true, shabbatFriendly: true, speaksHebrew: true };
    expect(cardTags(all)).toHaveLength(MAX_CARD_TAGS);
  });
});

describe("cardTags", () => {
  const all = { kosherKitchen: true, shabbatFriendly: true, speaksHebrew: true, synagogueWalkMin: 6, synagogueVerified: true };

  it("keeps at most two, in the default order", () => {
    expect(cardTags(all)).toEqual([{ kind: "kosherKitchen" }, { kind: "shabbatFriendly" }]);
  });

  it("puts the visitor's filters first", () => {
    expect(cardTags(all, ["hebrew"])).toEqual([{ kind: "hebrew" }, { kind: "kosherKitchen" }]);
    expect(cardTags(all, ["synagogue", "hebrew"])).toEqual([{ kind: "synagogue", minutes: 10 }, { kind: "hebrew" }]);
  });

  it("never shows an unverified synagogue walk", () => {
    expect(cardTags({ synagogueWalkMin: 4, synagogueVerified: false }, ["synagogue"])).toEqual([]);
    expect(cardTags({ synagogueWalkMin: 4 })).toEqual([]);
  });
});

describe("preferredCardTags", () => {
  it("follows the Jewish filters, including the kosher & Shabbat chip", () => {
    expect(preferredCardTags(emptyFilters())).toEqual([]);
    expect(preferredCardTags({ ...emptyFilters(), kosherShabbat: true })).toEqual(["kosherKitchen", "shabbatFriendly"]);
    expect(preferredCardTags({ ...emptyFilters(), synagogueMaxWalk: 10, jewish: ["host_speaks_hebrew"] })).toEqual(["synagogue", "hebrew"]);
  });
});

describe("stayNights", () => {
  it("counts nights between two dates", () => {
    expect(stayNights("2026-12-12", "2026-12-15")).toBe(3);
    expect(stayNights("2026-12-12", null)).toBeNull();
    expect(stayNights("2026-12-15", "2026-12-12")).toBeNull();
  });
});

describe("the visited tag (round 3, brief 8.3)", () => {
  const all = { kosherKitchen: true, shabbatFriendly: true, speaksHebrew: true, synagogueWalkMin: 6, synagogueVerified: true };

  it("comes first and counts toward the two-tag limit", () => {
    expect(cardTags({ ...all, visited: true })).toEqual([{ kind: "visited" }, { kind: "kosherKitchen" }]);
    expect(cardTags({ visited: true })).toEqual([{ kind: "visited" }]);
    expect(cardTags({ ...all, visited: true })).toHaveLength(MAX_CARD_TAGS);
  });

  it("stays first even before the visitor's filters", () => {
    expect(cardTags({ ...all, visited: true }, ["hebrew"])).toEqual([{ kind: "visited" }, { kind: "hebrew" }]);
    expect(cardTags({ ...all, visited: true }, ["synagogue", "hebrew"])).toEqual([{ kind: "visited" }, { kind: "synagogue", minutes: 10 }]);
  });

  it("is absent without the badge", () => {
    expect(cardTags({ ...all, visited: false })).toEqual([{ kind: "kosherKitchen" }, { kind: "shabbatFriendly" }]);
    expect(cardTags(all, ["visited"])).toEqual([{ kind: "kosherKitchen" }, { kind: "shabbatFriendly" }]);
  });

  it("the visited filter asks for it too", () => {
    expect(preferredCardTags({ ...emptyFilters(), visited: true })).toEqual(["visited"]);
  });
});

describe("cardTags: the walk to the sea / lifts (round 3, brief 7.3)", () => {
  const jewish = { kosherKitchen: true, shabbatFriendly: true, speaksHebrew: true };

  it("shows up to N min to the sea or the lifts at 15 minutes or less", () => {
    expect(cardTags({ seaWalkMinutes: 5 })).toEqual([{ kind: "sea", minutes: 5 }]);
    expect(cardTags({ seaWalkMinutes: 15 })).toEqual([{ kind: "sea", minutes: 15 }]);
    expect(cardTags({ liftWalkMinutes: 7 })).toEqual([{ kind: "lift", minutes: 10 }]);
    expect(cardTags({ seaWalkMinutes: 16 })).toEqual([]);
    expect(cardTags({ liftWalkMinutes: 30 })).toEqual([]);
    expect(cardTags({ seaWalkMinutes: null, liftWalkMinutes: null })).toEqual([]);
    expect(cardTags({ seaWalkMinutes: 0 })).toEqual([]);
  });

  it("comes first in those towns, before ביקרנו במקום and the visitor's filters", () => {
    expect(cardTags({ ...jewish, visited: true, seaWalkMinutes: 4 })).toEqual([{ kind: "sea", minutes: 5 }, { kind: "visited" }]);
    expect(cardTags({ ...jewish, liftWalkMinutes: 9 }, ["hebrew"])).toEqual([{ kind: "lift", minutes: 10 }, { kind: "hebrew" }]);
  });

  it("counts toward the two-tag limit", () => {
    expect(cardTags({ ...jewish, visited: true, seaWalkMinutes: 4 })).toHaveLength(MAX_CARD_TAGS);
  });

  it("changes nothing elsewhere (no walk value) or beyond 15 minutes", () => {
    expect(cardTags({ ...jewish, visited: true })).toEqual([{ kind: "visited" }, { kind: "kosherKitchen" }]);
    expect(cardTags({ ...jewish, visited: true, seaWalkMinutes: 22 })).toEqual([{ kind: "visited" }, { kind: "kosherKitchen" }]);
  });
});
