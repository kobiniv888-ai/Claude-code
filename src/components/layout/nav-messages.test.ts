import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { locales } from "@/config/site";

/**
 * Round 3, section 3: the menu, the desktop tabs and the footer use the home page's four tab names
 * (לטווח קצר, חודשי, קנייה, מלונות) in every language, and the footer carries the new lines.
 */
type Json = Record<string, unknown>;

function messages(locale: string, namespace: string): Json {
  return JSON.parse(readFileSync(join(process.cwd(), "messages", locale, `${namespace}.json`), "utf8")) as Json;
}

function at(json: Json, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => (value as Json | undefined)?.[key], json);
}

const DEALS = [
  ["shortStay", "short-stay"],
  ["monthly", "monthly"],
  ["buy", "buy"],
  ["hotels", "hotels"],
] as const;

describe.each(locales)("navigation names (%s)", (locale) => {
  const nav = messages(locale, "nav");
  const footer = messages(locale, "footer");
  const home = messages(locale, "home");

  it("names the deal tabs exactly like the home page's search tabs", () => {
    for (const [key, homeKey] of DEALS) {
      const homeName = at(home, `search.deals.${homeKey}`);
      expect(homeName, `home.search.deals.${homeKey}`).toEqual(expect.any(String));
      expect(at(nav, `tabs.${key}`), `nav.tabs.${key}`).toBe(homeName);
      expect(at(footer, `links.${key}`), `footer.links.${key}`).toBe(homeName);
    }
  });

  it("has no 'Rent' tab or link any more, and one Jewish life row", () => {
    expect(at(nav, "tabs.rent")).toBeUndefined();
    expect(at(footer, "links.rent")).toBeUndefined();
    expect(at(nav, "menu.groups.jewish")).toBeUndefined();
    expect(at(nav, "menu.links.jewishLifeHome")).toEqual(expect.any(String));
    expect(at(nav, "menu.links.emergency")).toEqual(expect.any(String));
  });

  it("carries the new footer tagline and the 'built by' line", () => {
    expect(at(footer, "madeFor")).toBeUndefined();
    expect(at(footer, "builtBy")).toEqual(expect.any(String));
    expect(at(footer, "mission")).toEqual(expect.any(String));
  });
});

describe("footer wording (Hebrew and English, as the founder wrote it)", () => {
  it("uses the brief's tagline and bottom line", () => {
    expect(at(messages("he", "footer"), "mission")).toBe(
      "בתים בגאורגיה, אצל מארחים שהתחייבו לקבל ישראלים בברכה. מזמינים באתר ומשלמים כשמגיעים.",
    );
    expect(at(messages("en", "footer"), "mission")).toBe(
      "Homes in Georgia from hosts who promise to welcome Israelis. Book on the site and pay when you arrive.",
    );
    expect(at(messages("he", "footer"), "builtBy")).toBe("נבנה על ידי משפחה ישראלית.");
  });

  it("no longer promises 'no booking fees' or 'direct contact' anywhere in the footer", () => {
    for (const locale of locales) {
      const text = JSON.stringify(messages(locale, "footer"));
      expect(text, locale).not.toMatch(/דמי הזמנה|booking fees|комисси|رسوم حجز|საკომისიო/);
    }
  });
});
