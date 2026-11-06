"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { requireUserForAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { assertRateLimit } from "@/lib/rate-limit";
import { isBookableDealType } from "./constants";
import {
  DATE_PRICE_LIMITS,
  datePriceDatesProblem,
  datePriceInputSchema,
  datePriceIssue,
  overlappingDatePrice,
  type HostDatePrice,
} from "./date-prices";
import { listHostDatePrices } from "./date-prices-server";
import { dateToDay, dayToDate, tbilisiToday } from "./dates";

/**
 * Holiday prices in the place calendar (round 3, brief 6.3): add one for the selected nights, or
 * delete one. Only the listing's owner, for short stays and hotels; zod-validated and rate-limited.
 * Adding runs in one transaction that locks the listing row (like a booking), so two saves can
 * never create overlapping date prices, and a booking being made waits for the new price.
 * Both return the listing's date prices from today on.
 *
 * The note is stored in the host's language ({ he: "פסח" }); guests in other languages see it as
 * written (pickLocalized falls back to any language).
 */

const SAVE_LIMIT = { limit: 60, windowSeconds: 600 };
const listingIdSchema = z.string().trim().min(1).max(64);

async function viewerLocale(): Promise<AppLocale> {
  const locale = await getLocale().catch(() => null);
  return isAppLocale(locale) ? locale : siteConfig.i18n.primaryLocale;
}

async function ownBookableListing(listingId: string, userId: string) {
  const listing = await db.listing.findFirst({
    where: { id: listingId, ownerId: userId, deletedAt: null, status: { not: "DELETED" } },
    select: { id: true, dealType: true },
  });
  if (!listing) throw new NotFoundError();
  return listing;
}

export async function saveDatePriceAction(input: unknown): Promise<ActionResult<{ datePrices: HostDatePrice[] }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`host-calendar:price:${user.id}`, SAVE_LIMIT);
    const parsed = datePriceInputSchema.safeParse(input);
    if (!parsed.success) return fail(datePriceIssue(parsed.error));
    const value = parsed.data;
    const listing = await ownBookableListing(value.listingId, user.id);
    if (!isBookableDealType(listing.dealType)) return fail("not_bookable");
    const today = tbilisiToday();
    const problem = datePriceDatesProblem(value, today);
    if (problem) return fail(problem);
    if (value.roomTypeId) {
      const room = await db.roomType.findFirst({ where: { id: value.roomTypeId, listingId: listing.id }, select: { id: true } });
      if (!room) return fail("room_type_not_found");
    }
    const locale = await viewerLocale();

    const refused = await db.$transaction(async (tx) => {
      // Serialises date-price saves (and bookings) of this listing: see the file comment.
      await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${listing.id} FOR UPDATE`;
      const current = await tx.datePrice.findMany({
        where: { listingId: listing.id, endDate: { gt: dayToDate(today) } },
        select: { roomTypeId: true, startDate: true, endDate: true },
        take: DATE_PRICE_LIMITS.maxPerListing * 2,
      });
      if (current.length >= DATE_PRICE_LIMITS.maxPerListing) return "too_many" as const;
      const ranges = current.map((p) => ({ roomTypeId: p.roomTypeId, start: dateToDay(p.startDate), end: dateToDay(p.endDate) }));
      if (overlappingDatePrice({ start: value.start, end: value.end, roomTypeId: value.roomTypeId }, ranges)) return "overlap" as const;
      await tx.datePrice.create({
        data: {
          listingId: listing.id,
          roomTypeId: value.roomTypeId,
          startDate: dayToDate(value.start),
          endDate: dayToDate(value.end),
          price: value.price,
          minNights: value.minNights,
          label: value.label ? { [locale]: value.label } : undefined,
        },
      });
      return null;
    });
    if (refused) return fail(refused);
    return ok({ datePrices: await listHostDatePrices(listing.id, locale, { today }) });
  });
}

const deleteSchema = z.object({ listingId: listingIdSchema, id: listingIdSchema });

/** Removes one date price of the owner's listing (bookings already made keep their prices). */
export async function deleteDatePriceAction(input: unknown): Promise<ActionResult<{ datePrices: HostDatePrice[] }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`host-calendar:price:${user.id}`, SAVE_LIMIT);
    const parsed = deleteSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const listing = await ownBookableListing(parsed.data.listingId, user.id);
    const { count } = await db.datePrice.deleteMany({ where: { id: parsed.data.id, listingId: listing.id } });
    if (count === 0) throw new NotFoundError();
    return ok({ datePrices: await listHostDatePrices(listing.id, await viewerLocale()) });
  });
}
