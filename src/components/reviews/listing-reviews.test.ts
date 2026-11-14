/**
 * reviews-8 (round 3 phase-5 hardening): a failed reviews query must not take the listing page
 * down — ListingReviews resolves with the counters' summary and a short "can't be shown" line.
 */
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => {
    const t = (key: string) => `t:${key}`;
    return Object.assign(t, { has: () => true });
  },
}));
vi.mock("@/i18n/navigation", () => ({ Link: (props: { children?: ReactNode }) => props.children ?? null }));
const getListingReviews = vi.hoisted(() => vi.fn());
vi.mock("@/lib/reviews/queries", () => ({ getListingReviews }));

const { ListingReviews } = await import("./listing-reviews");

/** Every string in a React element tree (props and children), without rendering it. */
function texts(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((child) => texts(child, out));
  else if (node && typeof node === "object" && "props" in node) {
    const props = (node as ReactElement<Record<string, unknown>>).props;
    for (const value of Object.values(props)) texts(value, out);
  }
  return out;
}

describe("ListingReviews", () => {
  it("resolves with the counters' summary and a notice when the reviews query fails", async () => {
    getListingReviews.mockRejectedValueOnce(new Error("database timeout"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const element = await ListingReviews({ listingId: "l1", locale: "he", counters: { reviewCount: 4, ratingSum: 18 } });
    const strings = texts(element);
    expect(strings).toContain("t:section.unavailable");
    expect(strings).toContain("t:summary.average");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("says how many it shows and links to all reviews when there are more than it loads", async () => {
    const review = (id: string) => ({ id, rating: 4, quick: [], body: { shown: "x", original: "x", translated: false, language: "en" }, month: "2026-10", author: "Dana", reply: null });
    getListingReviews.mockResolvedValueOnce({ reviews: Array.from({ length: 30 }, (_, i) => review(`r${i}`)), total: 45, quick: [] });
    const element = await ListingReviews({ listingId: "l1", locale: "he", counters: { reviewCount: 45, ratingSum: 180 }, allHref: "/listing/1-x/reviews" });
    const strings = texts(element);
    expect(strings).toContain("t:section.showingOf");
    expect(strings).toContain("t:section.allReviews");
    expect(strings).toContain("/listing/1-x/reviews");
  });
});
