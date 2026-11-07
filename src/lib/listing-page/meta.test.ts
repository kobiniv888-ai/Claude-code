import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { locales } from "@/config/site";
import { listingBreadcrumbs, listingMetaLead, listingMetaTitle, listingPlace } from "./meta";

function messages(locale: string, ns: string) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, `${ns}.json`), "utf8"));
}
function translator(locale: string, namespace: string) {
  const [ns] = namespace.split(".");
  return createTranslator({ locale, messages: { [ns]: messages(locale, ns) }, namespace: namespace as never }) as never;
}

describe("listing <title> (seo-10: unique titles)", () => {
  const base = { title: "Apartment in Batumi", cityName: "Batumi", neighborhoodName: null, publicId: 1234, titleTaken: false };

  it("adds the neighborhood next to the city when it is known", () => {
    const t = translator("en", "listing");
    expect(listingMetaTitle(base, t)).toBe("Apartment in Batumi · Batumi");
    expect(listingMetaTitle({ ...base, neighborhoodName: "Old Batumi" }, t)).toBe("Apartment in Batumi · Old Batumi, Batumi");
    expect(listingMetaTitle({ ...base, cityName: null }, t)).toBe("Apartment in Batumi");
  });

  it("two listings that share a title in a city get different titles: the public ID is added", () => {
    const t = translator("en", "listing");
    const a = listingMetaTitle({ ...base, publicId: 41, titleTaken: true }, t);
    const b = listingMetaTitle({ ...base, publicId: 42, titleTaken: true }, t);
    expect(a).toBe("Apartment in Batumi · Batumi · #41");
    expect(a).not.toBe(b);
  });

  it("works in all five languages (no raw keys or placeholders)", () => {
    for (const locale of locales) {
      const out = listingMetaTitle({ ...base, neighborhoodName: "Vake", titleTaken: true }, translator(locale, "listing"));
      expect(out, locale).toContain("Apartment in Batumi");
      expect(out, locale).toContain("Vake, Batumi");
      expect(out, locale).toContain("#1234");
      expect(out, locale).not.toMatch(/[{}]/);
    }
  });
});

describe("listing description lead", () => {
  it("is price · size · place, with the main size fact", () => {
    const t = translator("en", "listingFields.facts");
    const place = listingPlace("Vake", "Tbilisi");
    expect(listingMetaLead({ price: "₾120 / night", bedrooms: 2, size: "65 m²", place }, t)).toBe("₾120 / night · 2 bedrooms · Vake, Tbilisi");
    expect(listingMetaLead({ price: null, bedrooms: 0, size: null, place }, t)).toBe("Studio · Vake, Tbilisi");
    expect(listingMetaLead({ price: "₾90 / night", bedrooms: null, size: "40 m²", place: "Batumi" }, t)).toBe("₾90 / night · 40 m² · Batumi");
    expect(listingMetaLead({ price: null, bedrooms: null, size: null, place: "" }, t)).toBe("");
  });
});

describe("listing breadcrumbs (seo-7)", () => {
  const labels = {
    home: "Home",
    search: "Listings",
    types: { shortStays: "Short stays", monthly: "Monthly rentals", sale: "Homes for sale", hotels: "Hotels and guesthouses" },
  };
  const base = {
    title: "Sunny flat",
    path: "/listing/89-sunny-flat",
    dealType: "SHORT_STAY" as const,
    city: { slug: "batumi", name: "Batumi" },
    cityHasPages: true,
    citySearchPath: "/search?city=batumi",
    labels,
  };

  it("go through the city overview and its page of the listing's type, like the city pages", () => {
    expect(listingBreadcrumbs(base)).toEqual([
      { name: "Home", path: "/" },
      { name: "Batumi", path: "/batumi" },
      { name: "Short stays", path: "/batumi/short-stays" },
      { name: "Sunny flat", path: "/listing/89-sunny-flat" },
    ]);
    expect(listingBreadcrumbs({ ...base, dealType: "SALE" })[2]).toEqual({ name: "Homes for sale", path: "/batumi/sale" });
    expect(listingBreadcrumbs({ ...base, dealType: "HOTEL_ROOM" })[2]).toEqual({ name: "Hotels and guesthouses", path: "/batumi/hotels" });
    expect(listingBreadcrumbs({ ...base, dealType: "MONTHLY_RENT" })[2].path).toBe("/batumi/monthly");
    // Never the search URL that only points to the overview as its canonical.
    expect(listingBreadcrumbs(base).some((crumb) => crumb.path.startsWith("/search"))).toBe(false);
  });

  it("fall back to the search for a city without pages, or without a city", () => {
    expect(listingBreadcrumbs({ ...base, cityHasPages: false })).toEqual([
      { name: "Home", path: "/" },
      { name: "Listings", path: "/search" },
      { name: "Batumi", path: "/search?city=batumi" },
      { name: "Sunny flat", path: "/listing/89-sunny-flat" },
    ]);
    expect(listingBreadcrumbs({ ...base, city: null }).map((crumb) => crumb.path)).toEqual(["/", "/search", "/listing/89-sunny-flat"]);
  });
});
