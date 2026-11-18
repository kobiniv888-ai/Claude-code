/**
 * speed-1 (round 3, phase 5 hardening): what the saved pages (/saved for a signed-out visitor,
 * /account/favorites signed in) send on the first load. The list's "…" menu and the list sheet are
 * closed on first paint: the Radix dropdown (with its positioning code) and the sheet load at the
 * first tap, never with the page (CONVENTIONS rule 6).
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clientModules, eagerClientModules, SRC } from "./module-graph";

const rel = (file: string) => path.relative(SRC, file);
const PAGES = {
  saved: path.join(SRC, "app/[locale]/(site)/saved/page.tsx"),
  favorites: path.join(SRC, "app/[locale]/(site)/account/favorites/page.tsx"),
};
const LAZY = ["components/ui/dropdown-menu.tsx", "components/ds/overflow-menu-impl.tsx", "components/lists/list-picker-sheet.tsx"];

describe.each(Object.entries(PAGES))("the %s page's first load", (_, page) => {
  const eager = new Set([...eagerClientModules([page])].map(rel));
  const all = new Set([...clientModules([page])].map(rel));

  it("has the list's tabs and header, but not the menu or the list sheet", () => {
    expect(eager.has("components/ds/overflow-menu.tsx")).toBe(true);
    for (const lazy of LAZY) {
      expect(eager.has(lazy), lazy).toBe(false);
      // Still reachable: loaded at the first tap.
      expect(all.has(lazy), lazy).toBe(true);
    }
  });
});
