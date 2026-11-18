/**
 * speed-2 (round 3, phase 5 hardening): a listing with no visible review (Listing.reviewCount 0,
 * every listing at launch) draws its reviews section without reading the database.
 */
import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "use-intl/core";
import { describe, expect, it, vi } from "vitest";
import { reachableModules, SRC } from "../../../tests/unit/module-graph";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const messages = JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, `${namespace}.json`), "utf8"));
    return createTranslator({ locale, messages: { [namespace]: messages }, namespace });
  },
}));

const { ListingReviewsEmpty } = await import("./listing-reviews-empty");
const he = JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages/he/reviews.json"), "utf8"));

describe("the empty reviews section", () => {
  it("shows the section with its empty state", async () => {
    const section = (await ListingReviewsEmpty({ locale: "he" })) as { props: { title: string; children: { props: { title: string; hint: string } } } };
    expect(section.props.title).toBe(he.section.title);
    expect(section.props.children.props).toMatchObject({ title: he.section.empty, hint: he.section.emptyHint });
  });

  it("reaches neither the database nor the review queries", () => {
    const reached = [...reachableModules([path.join(SRC, "components/reviews/listing-reviews-empty.tsx")])].map((f) => path.relative(SRC, f));
    expect(reached).not.toContain("lib/db.ts");
    expect(reached).not.toContain("lib/reviews/queries.ts");
  });

  it("is what the listing page renders while the counters say there is no review", () => {
    const page = fs.readFileSync(path.join(SRC, "app/[locale]/(site)/listing/[id]/page.tsx"), "utf8");
    const guard = page.indexOf("(data.reviewCount ?? 0) === 0");
    expect(guard).toBeGreaterThan(0);
    expect(page.indexOf("<ListingReviewsEmpty", guard)).toBeGreaterThan(guard);
    expect(page.indexOf("<ListingReviewsEmpty", guard)).toBeLessThan(page.indexOf("<ListingReviews\n", guard) === -1 ? Infinity : page.indexOf("<ListingReviews\n", guard));
  });
});
