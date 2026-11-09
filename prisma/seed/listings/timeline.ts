/**
 * Pure helpers that turn a ListingSeed into database values (dates, contact methods, price
 * history) — kept free of database access so they can be unit-tested.
 */
import { siteConfig } from "@/config/site";
import type { ContactMethod } from "@/lib/listing/fields";
import { stepsFor } from "@/lib/wizard/steps";
import { DAY_MS, daysFromNow } from "../lib";
import type { ListingSeed } from "./types";

export function demoListingId(n: number): string {
  return `demo-listing-${String(n).padStart(2, "0")}`;
}

/**
 * The public number (/listing/<n>) of demo listing n: always 88 + n (#89 … #113), the numbers the
 * first seed gave them, which docs and the end-to-end tests name (#91 kosher short stay, #104 sea
 * view, #107 Gudauri chalet, #113 the template of test listings). Kept stable so a database whose
 * demo rows were removed and seeded again gets the same addresses.
 */
export const DEMO_PUBLIC_ID_OFFSET = 88;
export function demoListingPublicId(n: number): number {
  return DEMO_PUBLIC_ID_OFFSET + n;
}

export type ListingTimeline = {
  createdAt: Date;
  publishedAt: Date | null;
  expiresAt: Date | null;
  expiryWarnedAt: Date | null;
  bumpedAt: Date | null;
  featuredUntil: Date | null;
  contentUpdatedAt: Date;
  rulesAcceptedAt: Date | null;
  reviewedAt: Date | null;
  wizardStep: number;
};

/** Dates for a listing's status, relative to `now` (see ListingSeed.days). */
export function listingTimeline(seed: Pick<ListingSeed, "n" | "status" | "days" | "featured" | "fields" | "moderation">, now: Date): ListingTimeline {
  const expiryMs = siteConfig.listings.defaultExpiryDays * DAY_MS;
  const hour = 6 + (seed.n % 12); // spread the times of day a little
  const allSteps = stepsFor({ dealType: seed.fields.dealType, propertyType: seed.fields.propertyType }).length;
  const reviewedAt =
    seed.moderation?.reviewedDaysAgo !== undefined ? daysFromNow(-seed.moderation.reviewedDaysAgo, now, hour + 2) : null;

  switch (seed.status) {
    case "LIVE":
    case "PAUSED":
    case "RENTED": {
      const publishedAt = daysFromNow(-seed.days, now, hour);
      return {
        createdAt: new Date(publishedAt.getTime() - DAY_MS),
        publishedAt,
        expiresAt: new Date(publishedAt.getTime() + expiryMs),
        expiryWarnedAt: null,
        bumpedAt: publishedAt,
        featuredUntil: seed.featured ? daysFromNow(14, now, 20) : null,
        contentUpdatedAt: publishedAt,
        rulesAcceptedAt: publishedAt,
        reviewedAt,
        wizardStep: allSteps,
      };
    }
    case "EXPIRED": {
      const expiresAt = daysFromNow(-seed.days, now, hour);
      const publishedAt = new Date(expiresAt.getTime() - expiryMs);
      return {
        createdAt: new Date(publishedAt.getTime() - DAY_MS),
        publishedAt,
        expiresAt,
        expiryWarnedAt: new Date(expiresAt.getTime() - siteConfig.listings.expiryWarningDays * DAY_MS),
        bumpedAt: publishedAt,
        featuredUntil: null,
        contentUpdatedAt: publishedAt,
        rulesAcceptedAt: publishedAt,
        reviewedAt,
        wizardStep: allSteps,
      };
    }
    case "IN_REVIEW":
    case "NEEDS_CHANGES": {
      const createdAt = daysFromNow(-seed.days, now, hour);
      return {
        createdAt,
        publishedAt: null,
        expiresAt: null,
        expiryWarnedAt: null,
        bumpedAt: null,
        featuredUntil: null,
        contentUpdatedAt: createdAt,
        rulesAcceptedAt: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000),
        reviewedAt,
        wizardStep: allSteps,
      };
    }
    case "DRAFT": {
      const createdAt = daysFromNow(-seed.days, now, hour);
      return {
        createdAt,
        publishedAt: null,
        expiresAt: null,
        expiryWarnedAt: null,
        bumpedAt: null,
        featuredUntil: null,
        contentUpdatedAt: createdAt,
        rulesAcceptedAt: null,
        reviewedAt: null,
        wizardStep: 4,
      };
    }
  }
}

/** WhatsApp first with the owner's phone, then the listing's other channels. Drafts have none yet. */
export function contactMethodsFor(seed: Pick<ListingSeed, "status" | "contact">, ownerPhone: string): ContactMethod[] | null {
  if (seed.status === "DRAFT") return null;
  const methods: Omit<ContactMethod, "order">[] = [{ channel: "WHATSAPP", value: ownerPhone }];
  if (seed.contact?.telegram) methods.push({ channel: "TELEGRAM", value: seed.contact.telegram });
  if (seed.contact?.viber) methods.push({ channel: "VIBER", value: ownerPhone });
  if (seed.contact?.phone) methods.push({ channel: "PHONE", value: ownerPhone });
  return methods.map((method, order) => ({ ...method, order }));
}

export type PriceChangeRow = { oldPrice: number; newPrice: number; changedAt: Date };

/**
 * PriceChange rows from a listing's older prices (oldest first): each older price was replaced by
 * the next one (or the current price) `changedDaysAgo` days ago.
 */
export function priceChangesFor(seed: Pick<ListingSeed, "priceHistory" | "fields">, now: Date): PriceChangeRow[] {
  const history = seed.priceHistory ?? [];
  const current = Number(seed.fields.price ?? 0);
  return history.map((entry, i) => ({
    oldPrice: entry.price,
    newPrice: history[i + 1]?.price ?? current,
    changedAt: daysFromNow(-entry.changedDaysAgo, now, 10),
  }));
}
