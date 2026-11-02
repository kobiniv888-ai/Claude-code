import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, clientNamespaces, tsxFiles } from "../../tests/unit/module-graph";
import {
  ROUTE_MESSAGES,
  SHELL_MESSAGES,
  SITE_MESSAGES,
  mergeMessages,
  pickMessages,
  withoutCovered,
} from "./client-messages";

/**
 * Checks that each public route sends the interface text its client components read.
 *
 * From a route's files it follows the imports (`@/…` and relative; `import type` is skipped) and,
 * in every module that is a client module ("use client", or imported from one), collects the
 * namespaces of `useTranslations("…")`. Each must be covered by the sets the route receives.
 */
const APP = path.join(SRC, "app", "[locale]");
const SITE = path.join(APP, "(site)");
/** Segments that mount their own provider with every namespace. */
const FULL_SECTIONS = new Set(["account", "post"]);

/** "ns.part (read by file, file)" for every namespace not covered. */
function missing(entries: string[], covered: readonly string[]): string[] {
  return [...clientNamespaces(entries)]
    .filter(([ns]) => withoutCovered([ns], covered).length > 0)
    .map(([ns, files]) => `${ns} (read by ${[...files].join(", ")})`);
}

describe("client messages per route", () => {
  it("the root layout and its boundaries need only the shell set", () => {
    const entries = tsxFiles(APP, false);
    expect(entries.length).toBeGreaterThan(0);
    expect(missing(entries, SHELL_MESSAGES)).toEqual([]);
  });

  it("the (site) layout and the home page need only the shell and site sets", () => {
    expect(missing(tsxFiles(SITE, false), [...SHELL_MESSAGES, ...SITE_MESSAGES])).toEqual([]);
  });

  const segments = fs
    .readdirSync(SITE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !FULL_SECTIONS.has(entry.name))
    .map((entry) => entry.name);

  it.each(segments)("/%s gets what its client components read", (segment) => {
    const extra: readonly string[] = (ROUTE_MESSAGES as Record<string, readonly string[]>)[segment] ?? [];
    const problems = missing(tsxFiles(path.join(SITE, segment)), [...SHELL_MESSAGES, ...SITE_MESSAGES, ...extra]);
    if (problems.length > 0) {
      throw new Error(
        `Add these to ROUTE_MESSAGES["${segment}"] in src/i18n/client-messages.ts` +
          `${extra.length === 0 ? ` and mount <RouteMessages route="${segment}"> in its layout` : ""}:\n  ${problems.join("\n  ")}`,
      );
    }
  });

  it("every route with extra messages mounts <RouteMessages> in its layout", () => {
    for (const segment of Object.keys(ROUTE_MESSAGES)) {
      const layout = path.join(SITE, segment, "layout.tsx");
      expect(fs.existsSync(layout), layout).toBe(true);
      expect(fs.readFileSync(layout, "utf8")).toContain(`<RouteMessages route="${segment}">`);
    }
  });
});

describe("pickMessages / mergeMessages", () => {
  const all = { a: { x: "1", y: { z: "2" } }, b: { q: "3" }, c: "4" };

  it("picks whole namespaces and nested parts", () => {
    expect(pickMessages(all, ["b", "a.y"])).toEqual({ b: { q: "3" }, a: { y: { z: "2" } } });
    expect(pickMessages(all, ["a.x", "a.y.z", "missing", "c"])).toEqual({ a: { x: "1", y: { z: "2" } }, c: "4" });
  });

  it("merges nested namespaces", () => {
    expect(mergeMessages({ a: { x: "1" } }, { a: { y: { z: "2" } }, b: { q: "3" } })).toEqual({
      a: { x: "1", y: { z: "2" } },
      b: { q: "3" },
    });
  });

  it("drops paths that a broader entry already covers", () => {
    expect(withoutCovered(["search.bar", "search", "listing.map", "maps"], ["search", "map"])).toEqual(["listing.map", "maps"]);
  });
});
