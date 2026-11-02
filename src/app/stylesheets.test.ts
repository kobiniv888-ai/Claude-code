import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, reachableModules, tsxFiles } from "../../tests/unit/module-graph";

/**
 * The public stylesheet (src/app/globals.css) skips the folders of the admin panel, the account
 * dashboard, the wizard and the dev pages; their layouts load src/app/sections.css. So no public
 * page may render a component from one of those folders: its classes would be missing.
 */
const APP = path.join(SRC, "app", "[locale]");
const SITE = path.join(APP, "(site)");

/** The `@source not` folders of globals.css, as absolute paths (the globs resolved by hand). */
const SECTION_ONLY = [
  path.join(APP, "admin"),
  path.join(APP, "dev"),
  path.join(SITE, "account"),
  path.join(SITE, "post"),
  path.join(SRC, "components", "account"),
  path.join(SRC, "components", "admin"),
  path.join(SRC, "components", "pledge"),
  path.join(SRC, "components", "wizard"),
  path.join(SRC, "lib", "admin"),
  path.join(SRC, "lib", "wizard"),
];

const inSection = (file: string) => SECTION_ONLY.some((dir) => file.startsWith(dir + path.sep));

describe("public stylesheet", () => {
  it("lists the same folders as globals.css", () => {
    const css = fs.readFileSync(path.join(SRC, "app", "globals.css"), "utf8");
    const excluded = [...css.matchAll(/@source not "([^"]+)";/g)].map((m) => m[1]);
    expect(excluded).toEqual([
      "../generated",
      "./*/admin",
      "./*/dev",
      "./*/*/account",
      "./*/*/post",
      "../components/account",
      "../components/admin",
      "../components/pledge",
      "../components/wizard",
      "../lib/admin",
      "../lib/wizard",
    ]);
  });

  it("no public route renders a module from a section-only folder", () => {
    const publicEntries = [
      ...tsxFiles(APP, false),
      ...tsxFiles(SITE).filter((file) => !inSection(file)),
    ];
    const offenders = [...reachableModules(publicEntries)].filter(inSection).map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it("every section layout loads the full stylesheet", () => {
    for (const layout of [
      path.join(APP, "admin", "layout.tsx"),
      path.join(APP, "dev", "layout.tsx"),
      path.join(SITE, "account", "layout.tsx"),
      path.join(SITE, "post", "layout.tsx"),
    ]) {
      expect(fs.readFileSync(layout, "utf8"), layout).toMatch(/import "(\.\.\/)+sections\.css";/);
    }
  });
});
