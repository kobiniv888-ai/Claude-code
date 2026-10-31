import { describe, expect, it } from "vitest";
import { listingCardSelect, toListingCard, type ListingCardRow } from "./mappers";

const now = new Date("2026-10-31T12:00:00.000Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

function row(overrides: Partial<ListingCardRow> = {}): ListingCardRow {
  return {
    id: "lst_1",
    publicId: 1234,
    title: "דירה שמשית בוואקה",
    originalLocale: "he",
    dealType: "SHORT_STAY",
    propertyType: "APARTMENT",
    bedrooms: 2,
    bathrooms: 1,
    sizeSqm: 85,
    maxGuests: 4,
    price: 120 as unknown as ListingCardRow["price"],
    currency: "GEL",
    pricePeriod: "NIGHT",
    priceUsd: 44.44 as unknown as ListingCardRow["priceUsd"],
    isShabbatFriendly: true,
    kitchenKosher: "KOSHER",
    synagogueWalkMin: 6,
    publishedAt: daysAgo(2),
    priceDroppedAt: daysAgo(30),
    featuredUntil: null,
    isDemo: false,
    ownerVerifiedAt: null,
    approxLat: 41.71,
    approxLng: 44.76,
    owner: { accountType: "PRIVATE", idVerifiedAt: daysAgo(100) },
    city: { names: { he: "טביליסי", en: "Tbilisi", ru: "Тбилиси", ar: "تبليسي", ka: "თბილისი" } },
    neighborhood: { names: { he: "וואקה", en: "Vake", ru: "Ваке", ar: "فاكي", ka: "ვაკე" } },
    translations: [{ title: "Sunny flat in Vake", isAuto: true, isOriginal: false }],
    photos: [
      { url: "https://images.unsplash.com/photo-1?w=1600", storageKey: null, alt: null, blurDataUrl: null },
      { url: "/api/media/x-lg.webp", storageKey: "listings/lst_1/p2", alt: "Kitchen", blurDataUrl: "data:image/webp;base64,AA" },
    ],
    roomTypes: [],
    ...overrides,
  };
}

describe("listingCardSelect", () => {
  it("never selects private columns", () => {
    const select = listingCardSelect("en") as Record<string, unknown>;
    for (const key of ["address", "lat", "lng", "cadastralCode", "contactMethods", "description", "icalToken"]) {
      expect(select).not.toHaveProperty(key);
    }
  });
});

describe("toListingCard", () => {
  it("uses the translation, localized places and approximate coordinates", () => {
    const card = toListingCard(row(), { locale: "en", now });
    expect(card.title).toBe("Sunny flat in Vake");
    expect(card.titleIsAutoTranslated).toBe(true);
    expect(card.href).toBe("/listing/1234-sunny-flat-in-vake");
    expect(card.cityName).toBe("Tbilisi");
    expect(card.neighborhoodName).toBe("Vake");
    expect([card.lat, card.lng]).toEqual([41.71, 44.76]);
    expect(card.photos[0]).toEqual({ url: expect.stringContaining("w=800"), alt: "Sunny flat in Vake" });
    expect(card.photos[1]).toEqual({ url: "/api/media/listings/lst_1/p2-md.webp", alt: "Kitchen", blurDataUrl: "data:image/webp;base64,AA" });
    expect(card).toMatchObject({ price: 120, currency: "GEL", priceUsd: 44.44, priceIsFrom: false });
  });

  it("keeps the original title in the owner's language", () => {
    const card = toListingCard(row({ translations: [{ title: "דירה שמשית בוואקה", isAuto: false, isOriginal: true }] }), {
      locale: "he",
      now,
    });
    expect(card.title).toBe("דירה שמשית בוואקה");
    expect(card.titleIsAutoTranslated).toBe(false);
    expect(card.href).toBe("/listing/1234-dyrh-shmshyt-bvvakh");
  });

  it("computes badges and labels", () => {
    const card = toListingCard(row(), { locale: "en", now, featuredIds: new Set(["lst_1"]), favoriteIds: new Set(["lst_1"]) });
    expect(card.badges).toEqual({
      verified: true,
      business: false,
      shabbatFriendly: true,
      kosherKitchen: true,
      synagogueWalkMin: 6,
      isNew: true,
      priceDropped: false,
      promoted: true,
      demo: false,
    });
    expect(card.isFavorite).toBe(true);
    const old = toListingCard(row({ publishedAt: daysAgo(20), priceDroppedAt: daysAgo(3), featuredUntil: daysAgo(-2) }), {
      locale: "en",
      now,
    });
    expect(old.badges).toMatchObject({ isNew: false, priceDropped: true, promoted: true });
  });

  it("shows hotels 'from' their cheapest room type", () => {
    const card = toListingCard(
      row({
        price: null,
        dealType: "HOTEL_ROOM",
        maxGuests: null,
        roomTypes: [
          {
            price: 95 as unknown as ListingCardRow["price"] & object,
            currency: "USD",
            pricePeriod: "NIGHT",
            priceUsd: 95 as unknown as ListingCardRow["priceUsd"],
            maxGuests: 3,
          },
        ],
      }),
      { locale: "en", now },
    );
    expect(card).toMatchObject({ price: 95, currency: "USD", pricePeriod: "NIGHT", priceIsFrom: true, maxGuests: 3 });
  });
});
