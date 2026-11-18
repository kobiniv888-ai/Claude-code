import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Round 3, section 3: no site footer inside the post form (/post/<id>, the edit form) and the
 * booking flow (/listing/<id>/book). The marker is rendered by those routes' layouts (so it is also
 * there while a step loads); the CSS rule hides the footer wherever the marker is on the page.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const LAYOUTS = [
  "src/app/[locale]/(site)/post/[id]/layout.tsx",
  "src/app/[locale]/(site)/account/listings/[id]/edit/layout.tsx",
  "src/app/[locale]/(site)/listing/[id]/book/layout.tsx",
];

describe("<HideFooter />", () => {
  it("renders a hidden marker the stylesheet looks for", () => {
    expect(read("src/components/layout/hide-footer.tsx")).toContain("data-hide-footer");
    expect(read("src/components/layout/footer.tsx")).toContain("data-site-footer");
    expect(read("src/app/styles/bayit.css")).toMatch(/body:has\(\[data-hide-footer\]\)\s+\[data-site-footer\]\s*\{\s*display:\s*none;/);
  });

  it.each(LAYOUTS)("is rendered by %s", (path) => {
    const source = read(path);
    expect(source).toContain('from "@/components/layout/hide-footer"');
    expect(source).toContain("<HideFooter />");
  });

  it("is not on the /post start page, which keeps its footer", () => {
    expect(read("src/app/[locale]/(site)/post/layout.tsx")).not.toContain("HideFooter");
    expect(read("src/app/[locale]/(site)/post/page.tsx")).not.toContain("HideFooter");
  });

  it("covers the booking review's navigation skeleton too", () => {
    expect(read("src/components/booking/booking-review-skeleton.tsx")).toContain("<HideFooter />");
  });
});
