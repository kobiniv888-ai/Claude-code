/**
 * The privacy policy names every outside service the code really sends data to (SECURITY_REPORT
 * 15.7.a, S2 review LP-6): each translation provider, the address search host, the video players
 * and the 360-tour sites have an entry in privacy.sections.processors.list, in the 5 languages.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TOUR_DOMAINS } from "@/config/external-hosts";
import { TRANSLATION_PROVIDER_IDS } from "@/lib/translate/provider";

const LOCALES = ["he", "en", "ru", "ar", "ka"] as const;
const processors = (locale: string): string =>
  Object.values(JSON.parse(readFileSync(path.join(process.cwd(), "messages", locale, "legal.json"), "utf8")).privacy.sections.processors.list as Record<string, string>).join("\n");

/** What the code uses → the name the policy must show. */
const NAMES: Record<string, RegExp> = {
  ...Object.fromEntries(TRANSLATION_PROVIDER_IDS.map((id) => [`translation:${id}`, id === "azure" ? /Azure AI Translator/ : /Google Cloud Translation/])),
  "geocode:nominatim.openstreetmap.org": /OpenStreetMap/,
  "video:youtube": /YouTube/,
  "video:vimeo": /Vimeo/,
  ...Object.fromEntries(TOUR_DOMAINS.map((domain) => [`tour:${domain}`, new RegExp(domain.split(".")[0]!, "i")])),
};

describe("privacy policy processors (LP-6)", () => {
  it("the geocoder still calls nominatim.openstreetmap.org by default", () => {
    expect(readFileSync(path.join(process.cwd(), "src/lib/geocode/index.ts"), "utf8")).toContain("https://nominatim.openstreetmap.org/search");
  });

  it.each(LOCALES)("%s names every service the code sends data to", (locale) => {
    const text = processors(locale);
    for (const [use, name] of Object.entries(NAMES)) expect(text, `${locale}: ${use}`).toMatch(name);
  });
});

describe("browser storage and login sessions are described (LP-9)", () => {
  const legal = (locale: string) => JSON.parse(readFileSync(path.join(process.cwd(), "messages", locale, "legal.json"), "utf8"));

  it("the storage keys the code uses are on the cookie page", () => {
    // The keys: the compare list (src/hooks/use-compare.ts), signed-out lists
    // (src/lib/lists/device-store.ts) and the post form's unsent answers (src/components/wizard/unsent.ts).
    for (const file of ["src/hooks/use-compare.ts", "src/lib/lists/device-store.ts", "src/components/wizard/unsent.ts"]) {
      expect(readFileSync(path.join(process.cwd(), file), "utf8")).toMatch(/localStorage|sessionStorage/);
    }
    const en: string = legal("en").cookies.sections.storage.p1;
    for (const thing of ["compare list", "signed out", "listing form"]) expect(en).toContain(thing);
  });

  it.each(LOCALES)("%s: a login session's IP address and browser, and how long they stay", (locale) => {
    const privacy = legal(locale).privacy.sections;
    for (const text of [privacy.collect.list.h as string, privacy.retention.list.c as string]) {
      expect(text).toContain("IP");
      expect(text).toContain("{sessionDays}");
    }
  });
});
