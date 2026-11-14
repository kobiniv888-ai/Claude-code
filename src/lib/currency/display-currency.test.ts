import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  locale: "en",
  country: null as string | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (state.cookie ? { value: state.cookie } : undefined) }),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => state.locale }));
vi.mock("@/lib/request", () => ({ getCountryCode: async () => state.country }));
vi.mock("@/lib/settings", () => ({ getSettings: async () => ({ defaultCurrency: "USD" }) }));
vi.mock("@/lib/db", () => ({ db: {} }));

const { getDisplayCurrency } = await import("./index");
const { defaultCurrencyForLocale } = await import("./defaults");

describe("getDisplayCurrency", () => {
  beforeEach(() => {
    state.cookie = undefined;
    state.locale = "en";
    state.country = null;
  });

  it("shows shekels on the Hebrew site when nothing was chosen", async () => {
    state.locale = "he";
    expect(await getDisplayCurrency(null)).toBe("ILS");
    // Even for a Hebrew visitor browsing from Georgia.
    state.country = "GE";
    expect(await getDisplayCurrency(null)).toBe("ILS");
    expect(await getDisplayCurrency(null, "he")).toBe("ILS");
  });

  it("keeps an explicit choice (cookie, then account setting)", async () => {
    state.locale = "he";
    state.cookie = "EUR";
    expect(await getDisplayCurrency("USD")).toBe("EUR");
    state.cookie = undefined;
    expect(await getDisplayCurrency("GEL")).toBe("GEL");
  });

  it("defaults by language: he/ru/ar → ILS, en → USD, ka → GEL (bug 8.5)", async () => {
    state.country = "GE";
    for (const [locale, currency] of [
      ["he", "ILS"],
      ["ru", "ILS"],
      ["ar", "ILS"],
      ["en", "USD"],
      ["ka", "GEL"],
    ] as const) {
      state.locale = locale;
      expect(await getDisplayCurrency(null)).toBe(currency);
      expect(await getDisplayCurrency(null, locale)).toBe(currency);
    }
  });

  it("an unknown language falls back to the country, then the admin default", async () => {
    state.country = "GE";
    expect(await getDisplayCurrency(null, "fr")).toBe("GEL");
    state.country = null;
    expect(await getDisplayCurrency(null, "fr")).toBe("USD");
  });

  it("the visitor's choice wins over the language default", async () => {
    state.locale = "ka";
    state.cookie = "USD";
    expect(await getDisplayCurrency(null)).toBe("USD");
  });
});

describe("defaultCurrencyForLocale", () => {
  it("maps every interface language", () => {
    expect(defaultCurrencyForLocale("he")).toBe("ILS");
    expect(defaultCurrencyForLocale("ru")).toBe("ILS");
    expect(defaultCurrencyForLocale("ar")).toBe("ILS");
    expect(defaultCurrencyForLocale("en")).toBe("USD");
    expect(defaultCurrencyForLocale("ka")).toBe("GEL");
    expect(defaultCurrencyForLocale(undefined)).toBeNull();
  });
});
