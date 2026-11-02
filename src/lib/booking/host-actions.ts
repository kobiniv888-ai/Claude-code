"use server";

import { flattenError, z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { requireUserForAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { assertSafeFeedUrl, icalExportUrl, syncListingCalendars, UnsafeFeedUrlError, type IcalFeedReport } from "@/lib/ical";
import { assertRateLimit } from "@/lib/rate-limit";
import { normalizeRanges } from "@/lib/wizard/availability";
import { LIMITS } from "@/lib/wizard/schemas";
import type { DayRange } from "@/lib/wizard/types";
import { isBookableDealType } from "./constants";
import { addDays, dayToDate, tbilisiToday } from "./dates";

/**
 * The host's calendar page (/account/listings/<id>/calendar): the host's own blocked dates, the
 * Airbnb / Booking.com calendars to import, and "sync now". Every action checks the session and
 * that the listing belongs to the signed-in user, validates with zod and is rate-limited.
 * Cancelling a booking and "לא הגיע" are the booking engine's own actions (`./actions`).
 *
 * Days here are inclusive ranges ("2026-11-10" → "2026-11-12" = 3 nights), like the wizard's
 * calendar; the database stores an exclusive end date.
 */

const listingIdSchema = z.string().trim().min(1).max(64);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const SAVE_LIMIT = { limit: 120, windowSeconds: 600 };

async function ownListing(listingId: string, userId: string) {
  const listing = await db.listing.findFirst({
    where: { id: listingId, ownerId: userId, deletedAt: null, status: { not: "DELETED" } },
    select: { id: true, dealType: true, icalToken: true, icalImportUrls: true },
  });
  if (!listing) throw new NotFoundError();
  return listing;
}

const blocksSchema = z.object({
  listingId: listingIdSchema,
  blocked: z
    .array(z.object({ start: day, end: day }).refine((r) => r.start <= r.end, "invalid_range"))
    .max(500),
});

/**
 * Replaces the host's own blocked days (source OWNER) from today on with `blocked`. Imported
 * (ICAL) and booked (BOOKING) nights are never touched here. Returns the stored ranges.
 */
export async function saveHostBlocksAction(input: unknown): Promise<ActionResult<{ blocked: DayRange[] }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`host-calendar:save:${user.id}`, SAVE_LIMIT);
    const parsed = blocksSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", flattenError(parsed.error).fieldErrors);
    const listing = await ownListing(parsed.data.listingId, user.id);
    const today = tbilisiToday();
    const ranges = normalizeRanges(parsed.data.blocked, today);
    await db.$transaction([
      // Past nights are history; only today and later are replaced.
      db.availabilityBlock.deleteMany({ where: { listingId: listing.id, source: "OWNER", endDate: { gt: dayToDate(today) } } }),
      db.availabilityBlock.createMany({
        data: ranges.map((r) => ({
          listingId: listing.id,
          source: "OWNER" as const,
          startDate: dayToDate(r.start),
          endDate: dayToDate(addDays(r.end, 1)),
        })),
      }),
    ]);
    return ok({ blocked: ranges });
  });
}

export type CalendarSyncResult = {
  /** ISO time of this sync. */
  syncedAt: string;
  feeds: IcalFeedReport[];
  /** Confirmed Bayit bookings that imported nights now overlap (a double booking to sort out). */
  conflicts: number;
};

const importsSchema = z.object({
  listingId: listingIdSchema,
  urls: z
    .array(z.string().trim().max(LIMITS.urlMax, "too_long"))
    .max(LIMITS.maxIcalImports, "too_many")
    .transform((list) => [...new Set(list.filter(Boolean))]),
});

/** The listing's own Bayit export link: importing it would only echo our own nights back. */
function isOwnExport(url: string, icalToken: string): boolean {
  try {
    const own = new URL(icalExportUrl(icalToken));
    const candidate = new URL(url);
    return candidate.pathname.startsWith("/api/ical/") && (candidate.host === own.host || candidate.pathname.includes(icalToken));
  } catch {
    return false;
  }
}

/**
 * Saves the Airbnb / Booking.com calendar links to import (https, public addresses only, at most
 * LIMITS.maxIcalImports) and syncs them right away, so a wrong link shows its error at once.
 */
export async function saveIcalImportsAction(input: unknown): Promise<ActionResult<CalendarSyncResult & { urls: string[] }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`host-calendar:ical:${user.id}`, { limit: 20, windowSeconds: 600 });
    const parsed = importsSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", flattenError(parsed.error).fieldErrors);
    const listing = await ownListing(parsed.data.listingId, user.id);
    if (!isBookableDealType(listing.dealType)) return fail("not_bookable");
    const urls = parsed.data.urls;
    for (const [index, url] of urls.entries()) {
      if (isOwnExport(url, listing.icalToken)) return fail("own_calendar", { [`urls.${index}`]: ["own_calendar"] });
      try {
        assertSafeFeedUrl(url);
      } catch (error) {
        if (error instanceof UnsafeFeedUrlError) return fail("bad_url", { [`urls.${index}`]: ["bad_url"] });
        throw error;
      }
    }
    await db.listing.update({ where: { id: listing.id }, data: { icalImportUrls: urls } });
    const result = await syncListingCalendars(listing.id);
    return ok({ urls, syncedAt: result.syncedAt.toISOString(), feeds: result.feeds, conflicts: result.conflicts });
  });
}

/** "Sync now": re-reads the listing's import calendars and reports each one. */
export async function syncIcalNowAction(input: unknown): Promise<ActionResult<CalendarSyncResult>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = z.object({ listingId: listingIdSchema }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`host-calendar:sync:${user.id}`, { limit: 10, windowSeconds: 600 });
    const listing = await ownListing(parsed.data.listingId, user.id);
    // Each feed is fetched from Airbnb / Booking.com: at most twice a minute per listing.
    await assertRateLimit(`host-calendar:sync-listing:${listing.id}`, { limit: 2, windowSeconds: 60 });
    const result = await syncListingCalendars(listing.id);
    return ok({ syncedAt: result.syncedAt.toISOString(), feeds: result.feeds, conflicts: result.conflicts });
  });
}
