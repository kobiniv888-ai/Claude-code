import { describe, expect, it, vi } from "vitest";
import { BOOKING_TIME_ZONE } from "@/lib/booking/dates";
import { DEFAULT_TIME_ZONE as FORMAT_TIME_ZONE } from "@/lib/format";
import { DEFAULT_TIME_ZONE as HEBCAL_TIME_ZONE } from "@/lib/hebcal/core";
import { GEORGIA_EMERGENCY_NUMBER } from "@/lib/jewish-life/emergency";
import { safeTimeZone } from "@/lib/listing-page/helpers";
import { georgiaBounds } from "@/lib/map-bounds";
import { listingContactDefaultCountry } from "@/lib/auth/phone-defaults";
import { GEORGIA_BOUNDS, isInGeorgia } from "@/lib/wizard/schemas";
import { COUNTRIES, DEFAULT_COUNTRY, countryConfig, enabledCountryCodes, isInCountry, isSiteCountryCode } from "./countries";
import { siteConfig } from "./site";

vi.mock("server-only", () => ({}));

describe("countryConfig", () => {
  it("returns Georgia for GE, any case, and for unknown or missing codes", () => {
    expect(countryConfig("GE").code).toBe("GE");
    expect(countryConfig("ge").code).toBe("GE");
    expect(countryConfig(null)).toBe(COUNTRIES.GE);
    expect(countryConfig(undefined)).toBe(COUNTRIES.GE);
    expect(countryConfig("ZZ")).toBe(COUNTRIES.GE);
    // Known but not configured yet (Phase 3): still Georgia's values, never undefined.
    expect(countryConfig("US")).toBe(COUNTRIES.GE);
  });

  it("only Georgia is open for posting", () => {
    expect(DEFAULT_COUNTRY).toBe("GE");
    expect(enabledCountryCodes()).toEqual(["GE"]);
    expect(isSiteCountryCode("GE")).toBe(true);
    expect(isSiteCountryCode("IL")).toBe(false);
  });

  it("has the Georgia values the brief names", () => {
    const ge = countryConfig("GE");
    expect(ge.timezone).toBe("Asia/Tbilisi");
    expect(ge.localCurrency).toBe("GEL");
    expect(ge.defaultPhoneCountry).toBe("GE");
    expect(ge.emergencyNumber).toBe("112");
  });
});

describe("no behaviour change for Georgia: the old constants come from countryConfig('GE')", () => {
  const ge = countryConfig("GE");

  it("time zones", () => {
    expect(BOOKING_TIME_ZONE).toBe(ge.timezone);
    expect(FORMAT_TIME_ZONE).toBe(ge.timezone);
    expect(HEBCAL_TIME_ZONE).toBe(ge.timezone);
    expect(safeTimeZone(null)).toBe(ge.timezone);
    expect(safeTimeZone("Not/AZone")).toBe(ge.timezone);
    for (const city of siteConfig.cities) expect(city.timezone).toBe("Asia/Tbilisi");
  });

  it("map area, pin box and center (the values round 2 had)", () => {
    expect(siteConfig.map.georgiaBounds).toEqual([
      [41.05, 40.0],
      [43.6, 46.75],
    ]);
    expect(georgiaBounds()).toEqual(ge.mapBounds);
    expect(GEORGIA_BOUNDS).toEqual({ north: 43.65, south: 41.0, east: 46.8, west: 39.9 });
    expect(GEORGIA_BOUNDS).toEqual(ge.pinBounds);
    expect(siteConfig.map.defaultCenter).toEqual({ lat: 41.7151, lng: 44.8271 });
  });

  it("currency, phone, emergency number and the countries list", () => {
    expect(siteConfig.currencies.byCountry.GE).toBe("GEL");
    expect(siteConfig.currencies.byCountry.IL).toBe("ILS");
    expect(listingContactDefaultCountry()).toBe(ge.defaultPhoneCountry);
    expect(siteConfig.phone.listingContactDefaultCountry).toBe("GE");
    expect(GEORGIA_EMERGENCY_NUMBER).toBe("112");
    expect(siteConfig.countries).toEqual([
      { code: "GE", enabled: true },
      { code: "US", enabled: false },
      { code: "GB", enabled: false },
      { code: "AE", enabled: false },
    ]);
  });
});

describe("isInCountry", () => {
  it("Tbilisi and Batumi are in Georgia; Yerevan, Istanbul and Sochi are not", () => {
    expect(isInCountry("GE", 41.7151, 44.8271)).toBe(true);
    expect(isInCountry("GE", 41.6168, 41.6367)).toBe(true);
    expect(isInCountry("GE", 40.1792, 44.4991)).toBe(false);
    expect(isInCountry("GE", 41.0082, 28.9784)).toBe(false);
    expect(isInCountry("GE", 43.6028, 39.7342)).toBe(false);
  });

  it("matches the wizard's old isInGeorgia, edges included", () => {
    for (const [lat, lng] of [
      [43.65, 46.8],
      [41.0, 39.9],
      [43.66, 44],
      [42, 46.81],
    ] as const) {
      expect(isInCountry("GE", lat, lng)).toBe(isInGeorgia(lat, lng));
    }
    expect(isInCountry(null, 41.7, 44.8)).toBe(true);
    expect(isInCountry("GE", Number.NaN, 44.8)).toBe(false);
  });
});
