import { describe, expect, it } from "vitest";
import {
  activeFilterChips,
  availableSorts,
  clearFilters,
  countActiveFilters,
  emptyFilters,
  nightsBetween,
  parseCalendarDay,
  parseSearchParams,
  removeFilter,
  serializeSearchParams,
  serializeSearchQuery,
  withFilters,
} from "./search-params";

describe("parseSearchParams", () => {
  it("returns empty filters for nothing", () => {
    expect(parseSearchParams(null)).toEqual(emptyFilters());
    expect(parseSearchParams({})).toEqual(emptyFilters());
  });

  it("reads every kind of value from a record and from URLSearchParams", () => {
    const query =
      "deal=monthly&city=Tbilisi&neighborhood=vake&q=  sunny   flat &checkIn=2026-11-01&guests=4" +
      "&priceMin=500&priceMax=300&bedrooms=2&bathrooms=1.5&propertyTypes=apartment,HOUSE,castle" +
      "&amenities=wifi,pets-allowed,unknown&kitchen=kosher_or_kasherable&shabbatFriendly=1" +
      "&jewish=mezuzot&hotel=kosher_breakfast&synagogueMaxWalk=10&bigFamily=true&sharedRoomFor=women" +
      "&verifiedOnly=1&ownerType=private&hasPhotos=1&hasVideo=yes&postedWithin=7d&condition=white_frame" +
      "&heating=gas_boiler&views=sea,city&furnished=1&elevator=1&sizeMin=40&sizeMax=120&floorMin=2" +
      "&floorMax=9&buildingAge=new&sort=price_asc&view=map&bounds=41.8,41.6,44.9,44.7&page=3";
    const fromParams = parseSearchParams(new URLSearchParams(query));
    const record = Object.fromEntries(new URLSearchParams(query));
    expect(parseSearchParams(record)).toEqual(fromParams);

    expect(fromParams).toMatchObject({
      deal: "monthly",
      city: "tbilisi",
      neighborhood: "vake",
      q: "sunny flat",
      checkIn: "2026-11-01",
      checkOut: null,
      guests: 4,
      priceMin: 300,
      priceMax: 500,
      bedrooms: 2,
      bathrooms: 1.5,
      propertyTypes: ["APARTMENT", "HOUSE"],
      amenities: ["wifi", "pets_allowed"],
      kitchen: "kosher_or_kasherable",
      shabbatFriendly: true,
      jewish: ["mezuzot"],
      hotel: ["kosher_breakfast"],
      synagogueMaxWalk: 10,
      bigFamily: true,
      sharedRoomFor: "WOMEN",
      verifiedOnly: true,
      ownerType: "private",
      hasPhotos: true,
      hasVideo: true,
      postedWithin: "7d",
      condition: ["WHITE_FRAME"],
      heating: ["GAS_BOILER"],
      views: ["SEA", "CITY"],
      furnished: true,
      elevator: true,
      sizeMin: 40,
      sizeMax: 120,
      floorMin: 2,
      floorMax: 9,
      buildingAge: "NEW",
      sort: "price_asc",
      view: "map",
      bounds: { north: 41.8, south: 41.6, east: 44.9, west: 44.7 },
      page: 3,
    });
  });

  it("drops invalid values instead of throwing", () => {
    const f = parseSearchParams({
      deal: "lease",
      city: "../etc",
      neighborhood: "vake",
      checkIn: "2026-02-30",
      guests: "-2",
      priceMin: "abc",
      bedrooms: "1e9",
      synagogueMaxWalk: "7",
      sort: "rating",
      view: "table",
      bounds: "1,2,3",
      page: "0",
    });
    expect(f.deal).toBeNull();
    expect(f.city).toBeNull();
    expect(f.neighborhood).toBeNull(); // needs a city
    expect(f.checkIn).toBeNull();
    expect(f.guests).toBeNull();
    expect(f.priceMin).toBeNull();
    expect(f.bedrooms).toBeNull();
    expect(f.synagogueMaxWalk).toBeNull();
    expect(f.sort).toBe("recommended"); // reviews are off
    expect(f.view).toBe("grid");
    expect(f.bounds).toBeNull();
    expect(f.page).toBe(1);
  });

  it("keeps check-out only after check-in, and ignores dates and guests for sales", () => {
    expect(parseSearchParams({ checkIn: "2026-11-05", checkOut: "2026-11-02" }).checkOut).toBeNull();
    expect(parseSearchParams({ checkIn: "2026-11-05", checkOut: "2026-11-08" }).checkOut).toBe("2026-11-08");
    expect(parseSearchParams({ checkOut: "2026-11-08" }).checkOut).toBeNull();
    const sale = parseSearchParams({ deal: "buy", checkIn: "2026-11-05", guests: "3" });
    expect(sale.checkIn).toBeNull();
    expect(sale.guests).toBeNull();
  });

  it("offers price per m² only for sales", () => {
    expect(parseSearchParams({ sort: "price_sqm" }).sort).toBe("recommended");
    expect(parseSearchParams({ deal: "buy", sort: "price_sqm" }).sort).toBe("price_sqm");
    expect(availableSorts("buy")).toContain("price_sqm");
    expect(availableSorts("rent")).not.toContain("price_sqm");
    expect(availableSorts(null)).not.toContain("rating");
  });

  it("accepts repeated list parameters", () => {
    const params = new URLSearchParams("propertyTypes=villa&propertyTypes=apartment");
    expect(parseSearchParams(params).propertyTypes).toEqual(["APARTMENT", "VILLA"]);
  });
});

describe("serializeSearchParams", () => {
  it("omits defaults and keeps a stable order", () => {
    expect(serializeSearchQuery({})).toBe("");
    expect(serializeSearchQuery({ city: "batumi", deal: "buy", sort: "recommended", view: "grid", page: 1 })).toBe(
      "deal=buy&city=batumi",
    );
  });

  it("round-trips through the parser", () => {
    const filters = parseSearchParams(
      "deal=short-stay&city=batumi&checkIn=2026-12-01&checkOut=2026-12-05&guests=2&amenities=pool,wifi&shabbatFriendly=1&sort=synagogue&page=2"
        .split("&")
        .reduce<Record<string, string>>((acc, pair) => {
          const [k, v] = pair.split("=");
          acc[k] = v;
          return acc;
        }, {}),
    );
    const query = serializeSearchQuery(filters);
    expect(query).toBe(
      "deal=short-stay&city=batumi&checkIn=2026-12-01&checkOut=2026-12-05&guests=2&amenities=wifi,pool&shabbatFriendly=1&sort=synagogue&page=2".replace(
        /,/g,
        "%2C",
      ),
    );
    expect(parseSearchParams(new URLSearchParams(query))).toEqual(filters);
  });

  it("drops invalid values passed in code", () => {
    expect(serializeSearchQuery({ bedrooms: -3, sort: "price_sqm", neighborhood: "vake" })).toBe("");
  });

  it("writes enum lists in lower case, comma-separated", () => {
    const params = serializeSearchParams({ propertyTypes: ["APARTMENT", "VILLA"], sharedRoomFor: "WOMEN" });
    expect(params.get("propertyTypes")).toBe("apartment,villa");
    expect(params.get("sharedRoomFor")).toBe("women");
  });
});

describe("chips", () => {
  const filters = parseSearchParams({
    deal: "rent",
    city: "tbilisi",
    neighborhood: "vake",
    checkIn: "2026-11-01",
    checkOut: "2026-11-04",
    priceMax: "900",
    amenities: "wifi,pool",
    shabbatFriendly: "1",
    sizeMin: "50",
    sort: "newest",
  });

  it("lists one chip per value, ranges as one chip, without deal/sort/view", () => {
    expect(activeFilterChips(filters)).toEqual([
      { key: "city", value: "tbilisi" },
      { key: "neighborhood", value: "vake" },
      { key: "dates", value: "2026-11-01/2026-11-04" },
      { key: "price" },
      { key: "amenities", value: "wifi" },
      { key: "amenities", value: "pool" },
      { key: "shabbatFriendly" },
      { key: "size" },
    ]);
  });

  it("counts only filter-panel chips", () => {
    expect(countActiveFilters(filters)).toBe(5);
    expect(countActiveFilters(emptyFilters())).toBe(0);
  });

  it("removes one chip and goes back to page 1", () => {
    const paged = { ...filters, page: 4 };
    expect(removeFilter(paged, "amenities", "wifi").amenities).toEqual(["pool"]);
    expect(removeFilter(paged, "amenities").amenities).toEqual([]);
    expect(removeFilter(paged, "price")).toMatchObject({ priceMin: null, priceMax: null, page: 1 });
    expect(removeFilter(paged, "city")).toMatchObject({ city: null, neighborhood: null });
    expect(removeFilter(paged, "dates")).toMatchObject({ checkIn: null, checkOut: null });
    expect(removeFilter(paged, "shabbatFriendly").shabbatFriendly).toBe(false);
  });

  it("clears everything but the deal, view and sort", () => {
    const cleared = clearFilters(filters);
    expect(cleared).toEqual({ ...emptyFilters(), deal: "rent", sort: "newest" });
    expect(clearFilters(filters, { keepLocation: true }).neighborhood).toBe("vake");
  });

  it("withFilters resets the page and the neighborhood when the city changes", () => {
    const next = withFilters({ ...filters, page: 3 }, { city: "batumi" });
    expect(next).toMatchObject({ city: "batumi", neighborhood: null, page: 1 });
    expect(withFilters(filters, { deal: "monthly", sort: "price_sqm" }).sort).toBe("recommended");
  });
});

describe("calendar days", () => {
  it("validates real days", () => {
    expect(parseCalendarDay("2028-02-29")).toBe("2028-02-29");
    expect(parseCalendarDay("2027-02-29")).toBeNull();
    expect(parseCalendarDay("2026-1-01")).toBeNull();
    expect(nightsBetween("2026-03-28", "2026-04-02")).toBe(5);
  });
});
