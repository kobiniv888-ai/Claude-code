import { describe, expect, it } from "vitest";
import { listingPath, listingSlugParam, ownerPath, parseListingParam, searchPath, slugify } from "./urls";

describe("slugify", () => {
  it("makes ASCII slugs from English and accented text", () => {
    expect(slugify("Sunny flat in Vake!")).toBe("sunny-flat-in-vake");
    expect(slugify("  Café — São Paulo  ")).toBe("cafe-sao-paulo");
    expect(slugify("2BR, 85 m² near the sea")).toBe("2br-85-m2-near-the-sea");
  });

  it("transliterates Hebrew, Russian, Georgian and Arabic roughly", () => {
    expect(slugify("דירה בטביליסי")).toBe("dyrh-btbylysy");
    expect(slugify("Квартира в Батуми")).toBe("kvartira-v-batumi");
    expect(slugify("ბინა თბილისში")).toBe("bina-tbilisshi");
    expect(slugify("شقة في تبليسي")).toBe("shqa-fy-tblysy");
    expect(slugify("שָׁלוֹם")).toBe("shlvm"); // niqqud dropped
  });

  it("returns empty for nothing readable and cuts long titles at a word", () => {
    expect(slugify("")).toBe("");
    expect(slugify(null)).toBe("");
    expect(slugify("★ ☆ ✦")).toBe("");
    const long = slugify("A very long title about a wonderful apartment with a view of the old town and the river");
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("-")).toBe(false);
    expect(long).toBe("a-very-long-title-about-a-wonderful-apartment-with-a-view-of");
  });
});

describe("listing paths", () => {
  it("builds and parses listing URLs", () => {
    expect(listingPath(1234, "Sunny flat in Vake")).toBe("/listing/1234-sunny-flat-in-vake");
    expect(listingPath(77)).toBe("/listing/77");
    expect(listingSlugParam(5, "★")).toBe("5");
    expect(parseListingParam("1234-sunny-flat-in-vake")).toBe(1234);
    expect(parseListingParam("1234")).toBe(1234);
    expect(parseListingParam("1234-%D7%93%D7%99%D7%A8%D7%94")).toBe(1234);
  });

  it("rejects anything that is not a public ID", () => {
    expect(parseListingParam(undefined)).toBeNull();
    expect(parseListingParam("abc")).toBeNull();
    expect(parseListingParam("0")).toBeNull();
    expect(parseListingParam("-12")).toBeNull();
    expect(parseListingParam("12abc")).toBeNull();
    expect(parseListingParam("99999999999")).toBeNull();
    expect(parseListingParam("%E0%A4%A")).toBeNull();
  });

  it("builds owner and search paths", () => {
    expect(ownerPath("abc 1")).toBe("/owner/abc%201");
    expect(searchPath()).toBe("/search");
    expect(searchPath({ deal: "buy", city: "batumi" })).toBe("/search?deal=buy&city=batumi");
  });
});
