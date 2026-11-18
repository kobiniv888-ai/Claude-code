import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultPhoneCountryForLocale,
  listingContactDefaultCountry,
  readRememberedPhoneCountry,
  rememberPhoneCountry,
} from "./phone-defaults";

describe("defaultPhoneCountryForLocale", () => {
  it("starts guests on +972 except in Georgian", () => {
    expect(defaultPhoneCountryForLocale("he")).toBe("IL");
    expect(defaultPhoneCountryForLocale("en")).toBe("IL");
    expect(defaultPhoneCountryForLocale("ru")).toBe("IL");
    expect(defaultPhoneCountryForLocale("ar")).toBe("IL");
    expect(defaultPhoneCountryForLocale("ka")).toBe("GE");
    expect(defaultPhoneCountryForLocale("xx")).toBe("GE");
  });
});

describe("listingContactDefaultCountry", () => {
  it("defaults the host's contact phone to Georgia (+995)", () => {
    expect(listingContactDefaultCountry()).toBe("GE");
  });
});

describe("remembered country", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("remembers the last pick per purpose", () => {
    expect(readRememberedPhoneCountry("login")).toBeNull();
    rememberPhoneCountry("login", "US");
    rememberPhoneCountry("listing-contact", "IL");
    expect(readRememberedPhoneCountry("login")).toBe("US");
    expect(readRememberedPhoneCountry("listing-contact")).toBe("IL");
  });

  it("ignores junk and blocked storage", () => {
    rememberPhoneCountry("login", "<script>");
    expect(readRememberedPhoneCountry("login")).toBeNull();
    store["bayit:phone-country:login"] = "israel";
    expect(readRememberedPhoneCountry("login")).toBeNull();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readRememberedPhoneCountry("login")).toBeNull();
    expect(() => rememberPhoneCountry("login", "IL")).not.toThrow();
  });
});
