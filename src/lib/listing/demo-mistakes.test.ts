import { describe, expect, it } from "vitest";
import type { CurrencyCode } from "@/config/site";
import { ALL_LISTINGS } from "../../../prisma/seed/listings/all";
import { demoPhotoRoom } from "../../../prisma/seed/listings/photos";
import { checkListingMistakes, type MistakeInput } from "./mistake-check";

/**
 * Every published demo listing passes the mistake check's errors (round 3, brief 6.1): the demo
 * never shows a listing the site itself calls blocked (no exact address, fewer than 5 photos,
 * contact details in the text). Built from the seed objects, as the seed stores them: a hotel
 * room type's photos are its listing's photos with a roomTypeId.
 */
function inputOf(seed: (typeof ALL_LISTINGS)[number]): MistakeInput {
  const text = seed.text[seed.originalLocale];
  const roomOfPhoto = new Map<string, string>();
  (seed.roomTypes ?? []).forEach((room, i) => room.photos.forEach((key) => roomOfPhoto.set(key, `room-${i}`)));
  const f = seed.fields;
  return {
    dealType: f.dealType,
    propertyType: f.propertyType,
    originalLocale: seed.originalLocale,
    title: text.title,
    description: text.description,
    address: seed.address,
    lat: seed.lat,
    lng: seed.lng,
    city: null,
    currency: f.currency as CurrencyCode,
    maxGuests: f.maxGuests ?? null,
    bedsSingle: f.bedsSingle ?? null,
    bedsDouble: f.bedsDouble ?? null,
    bedsSofa: f.bedsSofa ?? null,
    bathrooms: f.bathrooms === undefined || f.bathrooms === null ? null : Number(f.bathrooms),
    checkInFrom: f.checkInFrom ?? null,
    checkOutUntil: f.checkOutUntil ?? null,
    checkInFlexible: f.checkInFlexible ?? false,
    checkOutFlexible: f.checkOutFlexible ?? false,
    photos: seed.photos.map((key) => ({ room: demoPhotoRoom(key), roomTypeId: roomOfPhoto.get(key) ?? null })),
    roomTypes: (seed.roomTypes ?? []).map((room, i) => ({
      id: `room-${i}`,
      name: room.names[seed.originalLocale],
      names: Object.values(room.names),
      maxGuests: room.maxGuests,
      bedsSingle: room.bedsSingle ?? null,
      bedsDouble: room.bedsDouble ?? null,
      bedsSofa: room.bedsSofa ?? null,
    })),
  };
}

describe("demo listings and the mistake check", () => {
  it("no published demo listing has an error that blocks publishing", () => {
    const published = ALL_LISTINGS.filter((l) => l.status !== "DRAFT");
    expect(published.length).toBeGreaterThan(0);
    for (const seed of published) {
      expect(checkListingMistakes(inputOf(seed)).errors, `demo listing ${seed.n}`).toEqual([]);
    }
  });
});
