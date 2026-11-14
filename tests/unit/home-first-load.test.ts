/**
 * Round 3, phase 6 (speed): what every visitor of the home page downloads with its first load, and
 * what every page carries in its data.
 * - "המשך מאיפה שעצרתם" (history stores, recently viewed, server actions) and the place gazetteer
 *   load later (a returning visitor's block / the first tap on "Where"), not with the page.
 * - The last-resort error page is part of every page's first load in a chunk of its own: it must
 *   not bring the whole site configuration (it came twice).
 * - app/[locale]/not-found.tsx is rendered into the data of every page of a language: it must not
 *   contain the site frame (header, footer, bottom bar, cookie banner: ~40 KB per page).
 * - The header's stylesheet is part of globals.css, not a separate render-blocking request.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clientModules, eagerClientModules, reachableModules, SRC } from "./module-graph";

const rel = (file: string) => path.relative(SRC, file);
const HOME = path.join(SRC, "app/[locale]/(site)/page.tsx");
const SITE_LAYOUT = path.join(SRC, "app/[locale]/(site)/layout.tsx");
const LOCALE_LAYOUT = path.join(SRC, "app/[locale]/layout.tsx");

describe("the home page's first load", () => {
  const entries = [HOME, SITE_LAYOUT, LOCALE_LAYOUT];
  const eager = new Set([...eagerClientModules(entries)].map(rel));
  const all = new Set([...clientModules(entries)].map(rel));

  it("has the search card and the recommended row", () => {
    expect(eager.has("components/home/home-search-card.tsx")).toBe(true);
    expect(eager.has("components/search/place-combobox.tsx")).toBe(true);
    expect(eager.has("components/home/recommended-switch.tsx")).toBe(true);
  });

  it("loads the continue block and the place gazetteer later", () => {
    for (const later of ["components/home/continue-block.tsx", "lib/places-match.ts", "config/places.ts", "lib/recently-viewed/device.ts"]) {
      expect(eager.has(later), later).toBe(false);
      expect(all.has(later), later).toBe(true);
    }
  });
});

describe("the last-resort error page (part of every first load)", () => {
  const eager = new Set([...eagerClientModules([path.join(SRC, "app/global-error.tsx")])].map(rel));

  it("does not bring the site configuration", () => {
    expect(eager.has("config/site.ts")).toBe(false);
    expect(eager.has("config/countries.ts")).toBe(false);
    expect(eager.has("config/locales.ts")).toBe(true);
  });

  it("the locale helpers do not need the site configuration either", () => {
    const helpers = new Set([...reachableModules([path.join(SRC, "i18n/locale.ts")])].map(rel));
    expect(helpers.has("config/site.ts")).toBe(false);
  });
});

describe("not-found pages", () => {
  const frame = path.join(SRC, "components/layout/site-shell.tsx");

  it("the language-level 404 (sent with every page) has no site frame", () => {
    const reachable = reachableModules([path.join(SRC, "app/[locale]/not-found.tsx")]);
    expect(reachable.has(frame)).toBe(false);
  });

  it("public pages and unknown addresses still get the 404 inside the site frame", () => {
    // (site)/not-found.tsx renders inside (site)/layout.tsx; [...rest] has the same frame.
    for (const layout of ["app/[locale]/(site)/layout.tsx", "app/[locale]/[...rest]/layout.tsx"]) {
      expect(reachableModules([path.join(SRC, layout)]).has(frame), layout).toBe(true);
    }
    for (const page of ["app/[locale]/(site)/not-found.tsx", "app/[locale]/[...rest]/not-found.tsx"]) {
      expect(fs.readFileSync(path.join(SRC, page), "utf8"), page).toMatch(/NotFoundView/);
    }
  });
});

describe("stylesheets", () => {
  it("no client component of the site frame imports its own CSS file", () => {
    const shell = [...clientModules([SITE_LAYOUT, LOCALE_LAYOUT])].filter((file) => file.startsWith(path.join(SRC, "components/layout")));
    const offenders = shell.filter((file) => /^\s*import\s+["'][^"']+\.css["'];?/m.test(fs.readFileSync(file, "utf8"))).map(rel);
    expect(offenders).toEqual([]);
    expect(fs.readFileSync(path.join(SRC, "app/globals.css"), "utf8")).toContain('@import "../components/layout/header-scroll.css";');
  });
});
