import { describe, expect, it } from "vitest";
import { skeletonKindOf } from "./skeleton-routes";

describe("skeletonKindOf", () => {
  it("knows a listing page and its booking review, in every language", () => {
    expect(skeletonKindOf("/he/listing/89-dyrt-3-chdrym")).toBe("listing");
    expect(skeletonKindOf("/en/listing/105")).toBe("listing");
    expect(skeletonKindOf("/listing/105/")).toBe("listing");
    expect(skeletonKindOf("/ka/listing/89-x/book")).toBe("booking");
  });

  it("gives other pages no skeleton", () => {
    for (const path of ["/he", "/he/search", "/he/listing", "/he/listing/89/edit", "/he/account/listings/89", "/he/owner/x"]) {
      expect(skeletonKindOf(path)).toBeNull();
    }
  });
});
