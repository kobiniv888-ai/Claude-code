import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { currencyCodes, locales, type AppLocale } from "@/config/site";
import { convertedNote } from "./guide-view";
import ar from "../../../messages/ar/pricing.json";
import en from "../../../messages/en/pricing.json";
import he from "../../../messages/he/pricing.json";
import ka from "../../../messages/ka/pricing.json";
import ru from "../../../messages/ru/pricing.json";

const MESSAGES = { he, en, ru, ar, ka } as const;
type Translator = Parameters<typeof convertedNote>[0];
const translator = (locale: AppLocale) =>
  createTranslator({ locale, messages: { pricing: MESSAGES[locale] }, namespace: "pricing" }) as unknown as Translator;

describe("the price guide's converted note", () => {
  it("names the currency in words in every language, never by its ISO code", () => {
    for (const locale of locales) {
      for (const code of currencyCodes) {
        const text = convertedNote(translator(locale), code);
        expect(text).not.toContain(code);
        expect(text).not.toContain("{currency}");
      }
    }
    expect(convertedNote(translator("he"), "GEL")).toContain("לארי");
    expect(convertedNote(translator("en"), "USD")).toContain("US dollars");
  });
});
