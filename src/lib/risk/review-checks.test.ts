import { describe, expect, it } from "vitest";
import {
  ADDRESS_PIN_TOLERANCE_M,
  COPY_MIN_WORDS,
  addressPinStatus,
  copySimilarity,
  priceVersusGuide,
  searchSnippet,
  shingles,
  textSearchUrl,
} from "./review-checks";

// Fake coordinates in Tbilisi (no real address is named).
const pin = { lat: 41.7151, lng: 44.8271 };

describe("addressPinStatus (SECURITY_REPORT 14.1.c)", () => {
  it("passes an address geocoded next to the pin", () => {
    const result = addressPinStatus(pin, [{ lat: 41.7155, lng: 44.8275 }]);
    expect(result.status).toBe("match");
  });

  it("flags an address far from the pin (Batumi vs Tbilisi)", () => {
    const result = addressPinStatus(pin, [{ lat: 41.6168, lng: 41.6367 }]);
    expect(result).toMatchObject({ status: "mismatch" });
    expect(result.status === "mismatch" && result.distanceM).toBeGreaterThan(200_000);
  });

  it("uses the nearest geocoder result", () => {
    const result = addressPinStatus(pin, [{ lat: 41.6168, lng: 41.6367 }, { lat: 41.7152, lng: 44.8272 }]);
    expect(result.status).toBe("match");
  });

  it("flags just past the tolerance, not just inside it", () => {
    const degPerMeter = 1 / 111_195;
    const inside = addressPinStatus(pin, [{ lat: pin.lat + (ADDRESS_PIN_TOLERANCE_M - 50) * degPerMeter, lng: pin.lng }]);
    const outside = addressPinStatus(pin, [{ lat: pin.lat + (ADDRESS_PIN_TOLERANCE_M + 50) * degPerMeter, lng: pin.lng }]);
    expect(inside.status).toBe("match");
    expect(outside.status).toBe("mismatch");
  });

  it("never reports a pass it could not check", () => {
    expect(addressPinStatus(null, [pin]).status).toBe("no_address");
    expect(addressPinStatus(pin, null).status).toBe("unavailable");
    expect(addressPinStatus(pin, []).status).toBe("not_found");
  });
});

describe("priceVersusGuide (SECURITY_REPORT 14.1.d)", () => {
  it("flags a price under half the guide's low end", () => {
    expect(priceVersusGuide(40, 100, [])).toMatchObject({ status: "far_below", low: 100, source: "guide" });
  });

  it("accepts a cheap but plausible price", () => {
    expect(priceVersusGuide(60, 100, []).status).toBe("ok");
    expect(priceVersusGuide(50, 100, []).status).toBe("ok");
  });

  it("uses the lowest low end of every source", () => {
    expect(priceVersusGuide(40, 100, [70])).toMatchObject({ status: "ok", low: 70, source: "reference" });
    expect(priceVersusGuide(30, 100, [70])).toMatchObject({ status: "far_below", low: 70 });
  });

  it("has no opinion without a price or a guide", () => {
    expect(priceVersusGuide(null, 100, []).status).toBe("no_data");
    expect(priceVersusGuide(0, 100, []).status).toBe("no_data");
    expect(priceVersusGuide(40, null, []).status).toBe("no_data");
    expect(priceVersusGuide(40, 0, [0]).status).toBe("no_data");
  });
});

// Invented demo-style text (no real place or listing).
const original =
  "A bright two room flat on a quiet street with a big balcony and a view of the old town. " +
  "The kitchen has a fridge, a stove and a kettle, and the living room has a sofa bed for two more guests. " +
  "Shops, a bakery and a bus stop are a short walk away, and the host lives nearby and is happy to help.";

describe("copySimilarity (SECURITY_REPORT 14.1.f)", () => {
  it("finds a copied description, also with case, punctuation and spacing changed", () => {
    const copy = original.toUpperCase().replace(/,/g, " ;").replace(/ /g, "  ");
    const result = copySimilarity(shingles(original), shingles(copy));
    expect(result.copied).toBe(true);
    expect(result.containment).toBe(1);
  });

  it("finds a copy that adds its own sentences", () => {
    const copy = `Welcome to our home. ${original} Message us on the site for more details about the stay.`;
    expect(copySimilarity(shingles(original), shingles(copy)).copied).toBe(true);
  });

  it("does not flag a different description that shares common phrases", () => {
    const other =
      "A cosy studio near the river with a small balcony, fast internet and a desk for work. " +
      "There is a washing machine, an iron and fresh towels, and a park with a playground is next door. " +
      "Parking is on the street and the metro is ten minutes away by foot through the market.";
    expect(copySimilarity(shingles(original), shingles(other)).copied).toBe(false);
  });

  it("does not compare short texts", () => {
    const short = original.split(" ").slice(0, COPY_MIN_WORDS - 1).join(" ");
    expect(shingles(short).size).toBe(0);
    expect(copySimilarity(shingles(short), shingles(short)).copied).toBe(false);
  });

  it("works on Hebrew text", () => {
    const he =
      "דירה מוארת עם שני חדרים ברחוב שקט עם מרפסת גדולה ונוף לעיר העתיקה. " +
      "במטבח יש מקרר, כיריים וקומקום, ובסלון יש ספה נפתחת לשני אורחים נוספים. " +
      "חנויות, מאפייה ותחנת אוטובוס נמצאות במרחק הליכה קצר, והמארח גר בקרבת מקום.";
    expect(copySimilarity(shingles(he), shingles(`שלום לכולם. ${he}`)).copied).toBe(true);
  });
});

describe("searchSnippet / textSearchUrl (SECURITY_REPORT 14.1.f)", () => {
  it("picks the longest sentence, at most 20 words", () => {
    const snippet = searchSnippet(original);
    expect(snippet).toContain("sofa bed");
    expect(snippet!.split(" ").length).toBeLessThanOrEqual(20);
  });

  it("returns null for a short text", () => {
    expect(searchSnippet("Nice flat.")).toBeNull();
    expect(searchSnippet(null)).toBeNull();
  });

  it("builds an exact-phrase web search", () => {
    const url = new URL(textSearchUrl("a quiet street"));
    expect(url.hostname).toBe("www.google.com");
    expect(url.searchParams.get("q")).toBe('"a quiet street"');
  });
});
