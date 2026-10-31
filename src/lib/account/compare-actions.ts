"use server";

/**
 * Data for /account/compare: up to siteConfig.listings.compareMax PUBLIC listings side by side.
 * Only public fields (never the address, exact point, cadastral code or contact values).
 */
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { siteConfig, type AppLocale, type CurrencyCode } from "@/config/site";
import type { DealType, KitchenKosher, Locale, PricePeriod, PropertyType } from "@/generated/prisma/enums";
import { isAppLocale, pickLocalized } from "@/i18n/locale";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { requireUserForAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { localizedTitle } from "@/lib/listing/mappers";
import { listingPath } from "@/lib/listing/urls";
import { publicListingWhere } from "@/lib/listing/where";
import { photoUrl } from "@/lib/media";
import { assertRateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";

export type CompareItem = {
  publicId: number;
  href: string;
  title: string;
  photo: { url: string; alt: string } | null;
  dealType: DealType;
  propertyType: PropertyType;
  place: string | null;
  price: { amount: number | null; currency: CurrencyCode; period: PricePeriod; from: boolean };
  verified: boolean;
  facts: {
    rooms: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    sizeSqm: number | null;
    maxGuests: number | null;
    floor: number | null;
    totalFloors: number | null;
    minStayNights: number | null;
  };
  jewish: {
    shabbatFriendly: boolean;
    kitchenKosher: KitchenKosher | null;
    kosherCertName: string | null;
    synagogueWalkMin: number | null;
    chabadWalkMin: number | null;
    features: string[];
  };
  amenities: string[];
  costs: {
    currency: CurrencyCode;
    deposit: number | null;
    cleaningFee: number | null;
    utilitiesIncluded: boolean | null;
    utilitiesEstimate: number | null;
    weeklyDiscountPct: number | null;
    monthlyDiscountPct: number | null;
  };
};

const idsSchema = z.array(z.number().int().positive().max(2_147_483_647)).max(siteConfig.listings.compareMax);

function num(value: { toString(): string } | null): number | null {
  if (value === null) return null;
  const n = Number(value.toString());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function getCompareItems(publicIds: unknown): Promise<ActionResult<CompareItem[]>> {
  return runAction<CompareItem[]>(async () => {
    const user = await requireUserForAction();
    const parsed = idsSchema.safeParse(publicIds);
    if (!parsed.success) return fail("invalid_input");
    if (parsed.data.length === 0) return ok([]);
    await assertRateLimit(`account:compare:${user.id}`, { limit: 60, windowSeconds: 60 });

    const raw = await getLocale();
    const locale: AppLocale = isAppLocale(raw) ? raw : siteConfig.i18n.primaryLocale;
    const settings = await getSettings();
    const rows = await db.listing.findMany({
      where: { AND: [publicListingWhere({ demoVisible: settings.demoDataVisible }), { publicId: { in: parsed.data } }] },
      select: {
        publicId: true,
        title: true,
        originalLocale: true,
        dealType: true,
        propertyType: true,
        rooms: true,
        bedrooms: true,
        bathrooms: true,
        sizeSqm: true,
        maxGuests: true,
        floor: true,
        totalFloors: true,
        minStayNights: true,
        price: true,
        currency: true,
        pricePeriod: true,
        deposit: true,
        cleaningFee: true,
        utilitiesIncluded: true,
        utilitiesEstimate: true,
        weeklyDiscountPct: true,
        monthlyDiscountPct: true,
        isShabbatFriendly: true,
        kitchenKosher: true,
        kosherCertName: true,
        synagogueWalkMin: true,
        chabadWalkMin: true,
        shabbatFeatures: true,
        jewishFeatures: true,
        hotelJewishFeatures: true,
        amenities: true,
        ownerVerifiedAt: true,
        owner: { select: { idVerifiedAt: true } },
        city: { select: { names: true } },
        neighborhood: { select: { names: true } },
        translations: { where: { locale: locale as Locale }, take: 1, select: { title: true, isAuto: true, isOriginal: true } },
        photos: { orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }], take: 1, select: { url: true, storageKey: true, alt: true } },
        roomTypes: {
          orderBy: [{ priceUsd: { sort: "asc", nulls: "last" } }, { sortOrder: "asc" }],
          take: 1,
          select: { price: true, currency: true, pricePeriod: true, maxGuests: true },
        },
      },
    });

    const byId = new Map(rows.map((row) => [row.publicId, row]));
    const items = parsed.data.flatMap((publicId): CompareItem[] => {
      const row = byId.get(publicId);
      if (!row) return [];
      const { title } = localizedTitle(row, locale);
      const room = row.roomTypes[0];
      const own = num(row.price);
      const price =
        own !== null || !room || num(room.price) === null
          ? { amount: own, currency: row.currency as CurrencyCode, period: row.pricePeriod, from: false }
          : { amount: num(room.price), currency: room.currency as CurrencyCode, period: room.pricePeriod, from: true };
      const photo = row.photos[0];
      const place = [row.neighborhood ? pickLocalized(row.neighborhood.names, locale) : "", row.city ? pickLocalized(row.city.names, locale) : ""]
        .filter(Boolean)
        .join(" · ");
      return [
        {
          publicId: row.publicId,
          href: listingPath(row.publicId, title),
          title,
          photo: photo ? { url: photoUrl(photo, "md"), alt: photo.alt?.trim() || title } : null,
          dealType: row.dealType,
          propertyType: row.propertyType,
          place: place || null,
          price,
          verified: !!row.owner.idVerifiedAt || !!row.ownerVerifiedAt,
          facts: {
            rooms: row.rooms,
            bedrooms: row.bedrooms,
            bathrooms: row.bathrooms,
            sizeSqm: row.sizeSqm,
            maxGuests: row.maxGuests ?? room?.maxGuests ?? null,
            floor: row.floor,
            totalFloors: row.totalFloors,
            minStayNights: row.minStayNights,
          },
          jewish: {
            shabbatFriendly: row.isShabbatFriendly,
            kitchenKosher: row.kitchenKosher,
            kosherCertName: row.kosherCertName?.trim() || null,
            synagogueWalkMin: row.synagogueWalkMin,
            chabadWalkMin: row.chabadWalkMin,
            features: [...row.shabbatFeatures.map((f) => `shabbat:${f}`), ...row.jewishFeatures.map((f) => `jewish:${f}`), ...row.hotelJewishFeatures.map((f) => `hotel:${f}`)],
          },
          amenities: row.amenities,
          costs: {
            currency: row.currency as CurrencyCode,
            deposit: num(row.deposit),
            cleaningFee: num(row.cleaningFee),
            utilitiesIncluded: row.utilitiesIncluded,
            utilitiesEstimate: num(row.utilitiesEstimate),
            weeklyDiscountPct: row.weeklyDiscountPct,
            monthlyDiscountPct: row.monthlyDiscountPct,
          },
        },
      ];
    });
    return ok(items);
  });
}
