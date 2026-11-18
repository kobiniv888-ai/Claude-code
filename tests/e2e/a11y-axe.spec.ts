import AxeBuilder from "@axe-core/playwright";
import { expect, settle, test } from "./fixtures";

/**
 * SECURITY_REPORT 15.6.a: the axe WCAG 2.0/2.1 A + AA check on the public pages the gate probed,
 * at a phone and a desktop width. The S2 gate's one finding was label-content-name-mismatch on the
 * 112 card of /he/jewish-life (its aria-label left out the visible note); the card's name now comes
 * from its screen-reader text (src/components/jewish-life/emergency-contacts.tsx).
 */
const PAGES = ["/he", "/en", "/he/search", "/he/jewish-life", "/en/jewish-life", "/he/safety", "/he/help", "/he/legal/privacy"];

for (const width of [390, 1280]) {
  test.describe(`axe A + AA at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const path of PAGES) {
      test(path, async ({ page }) => {
        await page.goto(path);
        await settle(page);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      });
    }
  });
}
