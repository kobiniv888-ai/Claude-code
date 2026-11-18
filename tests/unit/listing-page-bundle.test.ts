/**
 * speed-listing-1 / speed-listing-2 (round 3, phase 4 hardening): what the public listing page
 * sends to every visitor on the first load.
 * - The hotel room picker and "All photos" by room render only inside sheets that are closed on
 *   first paint: they load with next/dynamic at the first opening, never in the first load.
 * - Server components of the listing page draw icons from the sprite, never from lucide-react
 *   (a lucide icon is a client component: HTML, RSC data and hydration).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clientModules, eagerClientModules, moduleInfo, reachableModules, SRC } from "./module-graph";

const PAGE = path.join(SRC, "app/[locale]/(site)/listing/[id]/page.tsx");
const rel = (file: string) => path.relative(SRC, file);

describe("the listing page's first load", () => {
  const eager = new Set([...eagerClientModules([PAGE])].map(rel));
  const all = new Set([...clientModules([PAGE])].map(rel));

  it("has the dates sheet and the gallery, but not the room picker or the room sections", () => {
    expect(eager.has("components/booking/dates-guests-sheet.tsx")).toBe(true);
    expect(eager.has("components/listing-page/gallery.tsx")).toBe(true);
    for (const lazy of ["components/booking/room-picker.tsx", "components/listing-page/room-sections.tsx"]) {
      expect(eager.has(lazy), lazy).toBe(false);
      // Still reachable: loaded when the sheet opens.
      expect(all.has(lazy), lazy).toBe(true);
    }
  });

  it("draws no lucide-react icon from a server component of the listing page", () => {
    // Rendered on the server: reachable from the page but never bundled for the browser.
    const server = [...reachableModules([PAGE])].filter((file) => !all.has(rel(file)) && !moduleInfo(file).isClient);
    const offenders = server
      .filter((file) => file.startsWith(path.join(SRC, "components/listing-page")))
      .filter((file) => /from\s+["']lucide-react["']/.test(fs.readFileSync(file, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
    expect(server.map(rel)).toContain("components/listing-page/room-types.tsx");
  });
});
