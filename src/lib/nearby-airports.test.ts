import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { locales, siteConfig } from "@/config/site";
import { NAMED_AIRPORTS, namedAirport } from "./nearby-airports";

function nearbyMessages(locale: string) {
  const file = join(process.cwd(), "messages", locale, "listing.json");
  return (JSON.parse(readFileSync(file, "utf8")) as { nearby: { airports: Record<string, string>; km: string } }).nearby;
}

describe("namedAirport", () => {
  it("names the three Georgian airports by their code", () => {
    expect(namedAirport("BUS")).toBe("BUS");
    expect(namedAirport("tbs")).toBe("TBS");
    expect(namedAirport(" KUT ")).toBe("KUT");
  });

  it("falls back to the generic label for unknown or missing codes", () => {
    expect(namedAirport("XYZ")).toBeNull();
    expect(namedAirport("")).toBeNull();
    expect(namedAirport(null)).toBeNull();
    expect(namedAirport(undefined)).toBeNull();
  });

  it("covers every city's airport in the site config", () => {
    for (const city of siteConfig.cities) expect(namedAirport(city.airport.code), city.slug).not.toBeNull();
  });
});

describe("airport messages", () => {
  it("name every airport in all five languages, without the code", () => {
    for (const locale of locales) {
      const nearby = nearbyMessages(locale);
      for (const code of NAMED_AIRPORTS) {
        const name = nearby.airports[code];
        expect(name, `${locale} ${code}`).toBeTruthy();
        expect(name, `${locale} ${code}`).not.toContain(code);
      }
      // The distance is only the distance: "4 ק״מ", never "(BUS)".
      expect(nearby.km, locale).not.toContain("{code}");
    }
  });

  it("reads 'שדה התעופה של בטומי' in Hebrew", () => {
    expect(nearbyMessages("he").airports.BUS).toBe("שדה התעופה של בטומי");
  });
});
