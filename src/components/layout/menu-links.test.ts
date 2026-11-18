import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Round 3, section 3: the phone menu has one Jewish life row, and "Emergency numbers" sits under
 * "Help & safety", opening the safety page's emergency section (the Jewish life page keeps its own).
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("menu links", () => {
  const menu = read("src/components/layout/mobile-menu-sheet.tsx");

  it("has one Jewish life row and no hub anchors", () => {
    expect(menu.match(/href: "\/jewish-life[^"]*"/g)).toEqual(['href: "/jewish-life"']);
    expect(menu).not.toContain("menu.groups.jewish");
  });

  it("links 'Emergency numbers' to the safety page, inside the help rows", () => {
    const helpRows = menu.slice(menu.indexOf("const helpRows"), menu.indexOf("].map((row)"));
    expect(helpRows).toContain('href: "/safety#emergency"');
    expect(helpRows).toContain('t("menu.links.emergency")');
  });

  it("finds the emergency section on the safety page and on the Jewish life page", () => {
    const safety = read("src/app/[locale]/(site)/safety/page.tsx");
    expect(safety).toMatch(/<Section id="emergency"/);
    expect(safety).toContain("<EmergencyContacts");
    expect(safety).toContain('{ id: "emergency", label: t("jump.emergency") }');
    expect(read("src/app/[locale]/(site)/jewish-life/page.tsx")).toContain("<EmergencyContacts");
  });

  it("puts emergency numbers in the footer's help column too", () => {
    expect(read("src/components/layout/footer.tsx")).toContain('{ key: "emergency", href: "/safety#emergency" }');
  });
});
