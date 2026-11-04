import { describe, expect, it } from "vitest";
import { DEAL_FILTER_TYPES } from "@/lib/listing/search-params";
import { SEARCH_BAR_DEALS } from "@/lib/search/search-bar";
import { HOME_DEFAULT_DEAL, HOME_RECOMMENDED_CARDS, mergeRecommended } from "./recommended";

describe("'Recommended places' follows the home tab (round 3, brief 3 and 4)", () => {
  it("opens on short stays, at most 6 cards", () => {
    expect(HOME_DEFAULT_DEAL).toBe("short-stay");
    expect(HOME_RECOMMENDED_CARDS).toBe(6);
  });

  it("each tab shows only its own deal type: never a sale among nightly stays", () => {
    expect(DEAL_FILTER_TYPES["short-stay"]).toEqual(["SHORT_STAY"]);
    for (const deal of SEARCH_BAR_DEALS) {
      expect(DEAL_FILTER_TYPES[deal]).toHaveLength(1);
      if (deal !== "buy") expect(DEAL_FILTER_TYPES[deal]).not.toContain("SALE");
    }
  });

  it("keeps promoted first, then the newest, without duplicates, at most 6", () => {
    const ids = (...n: number[]) => n.map((i) => ({ id: String(i) }));
    expect(mergeRecommended(ids(1, 2), ids(2, 3, 4, 5, 6, 7, 8)).map((x) => x.id)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });
});
