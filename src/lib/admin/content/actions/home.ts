"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { photoUrl } from "@/lib/media";
import { getSettings, HOME_SECTION_KEYS, updateSettings } from "@/lib/settings";
import { pickLocalized } from "@/i18n/locale";
import { addDays, endOfGeorgiaDay, featuredAddSchema, georgiaToday } from "../schemas";
import { ContentActionError, parseInput, runContentAction } from "../server/common";

/** Home page sections and hand-picked featured listings ("content"). */

const MAX_FEATURED = 48;
const MAX_FEATURE_DAYS = 365;

const homeSectionsInput = z.object({
  sections: z
    .array(z.object({ key: z.enum(HOME_SECTION_KEYS), enabled: z.boolean() }))
    .min(1)
    .max(HOME_SECTION_KEYS.length),
});

export async function saveHomeSections(input: unknown): Promise<ActionResult> {
  return runContentAction("content", "home", async (staff) => {
    const parsed = parseInput(homeSectionsInput, input);
    if (!parsed.ok) return parsed.result;
    // updateSettings validates again and writes "settings.update" to the audit log.
    await updateSettings({ homeSections: parsed.data.sections }, staff.id);
    return ok();
  });
}

export type FeaturedCandidate = {
  id: string;
  publicId: number;
  title: string;
  city: string;
  status: string;
  photo: string | null;
  featured: boolean;
  isDemo: boolean;
};

/** Finds listings by public ID ("1234", "ID 1234") or by a word of the title. */
export async function searchListingsToFeature(input: unknown): Promise<ActionResult<FeaturedCandidate[]>> {
  return runContentAction(
    "content",
    "featured_search",
    async () => {
      const parsed = z.object({ query: z.string().trim().min(1).max(120), locale: z.string().max(5) }).safeParse(input);
      if (!parsed.success) return fail("invalid_input");
      const { query, locale } = parsed.data;
      const digits = query.replace(/^(id|#)\s*/i, "");
      const publicId = /^\d{1,9}$/.test(digits) ? Number(digits) : null;
      const settings = await getSettings();
      const now = new Date();
      const rows = await db.listing.findMany({
        where: {
          status: { not: "DELETED" },
          OR: [
            ...(publicId !== null ? [{ publicId }] : []),
            { title: { contains: query, mode: "insensitive" as const } },
            { translations: { some: { title: { contains: query, mode: "insensitive" as const } } } },
          ],
        },
        orderBy: [{ status: "asc" }, { publishedAt: "desc" }],
        take: 10,
        select: {
          id: true,
          publicId: true,
          title: true,
          status: true,
          isDemo: true,
          featuredUntil: true,
          city: { select: { names: true } },
          photos: { orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }], take: 1, select: { url: true, storageKey: true } },
        },
      });
      // LIVE first, then the others (they cannot be added, but the admin sees why).
      rows.sort((a, b) => Number(b.status === "LIVE") - Number(a.status === "LIVE"));
      return ok(
        rows.map((row) => ({
          id: row.id,
          publicId: row.publicId,
          title: row.title,
          city: row.city ? pickLocalized(row.city.names, locale) : "",
          status: row.status,
          photo: row.photos[0] ? photoUrl(row.photos[0], "sm") : null,
          featured:
            settings.featuredListingIds.includes(row.id) ||
            (row.featuredUntil !== null && row.featuredUntil.getTime() > now.getTime()),
          isDemo: row.isDemo,
        })),
      );
    },
    { limit: 60, windowSeconds: 60 },
  );
}

export async function addFeaturedListing(input: unknown): Promise<ActionResult> {
  return runContentAction("content", "featured", async (staff) => {
    const parsed = parseInput(featuredAddSchema, input);
    if (!parsed.ok) return parsed.result;
    const { listingId, until } = parsed.data;
    const today = georgiaToday();
    if (until < today) throw new ContentActionError("date_in_past", 422);
    if (until > addDays(today, MAX_FEATURE_DAYS)) return fail("invalid_input", { until: ["out_of_range"] });

    const listing = await db.listing.findUnique({ where: { id: listingId }, select: { id: true, status: true, publicId: true } });
    if (!listing) throw new ContentActionError("listing_not_found", 404);
    if (listing.status !== "LIVE") throw new ContentActionError("listing_not_live");

    const settings = await getSettings();
    const ids = settings.featuredListingIds.filter((id) => id !== listing.id);
    if (ids.length >= MAX_FEATURED) throw new ContentActionError("featured_limit");

    const featuredUntil = endOfGeorgiaDay(until);
    await db.listing.update({ where: { id: listing.id }, data: { featuredUntil } });
    await updateSettings({ featuredListingIds: [...ids, listing.id] }, staff.id);
    await audit({
      actorId: staff.id,
      action: "listing.feature",
      targetType: "Listing",
      targetId: listing.id,
      details: { publicId: listing.publicId, featuredUntil },
    });
    return ok();
  });
}

export async function removeFeaturedListing(input: unknown): Promise<ActionResult> {
  return runContentAction("content", "featured", async (staff) => {
    const parsed = z.object({ listingId: z.string().min(1).max(64) }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const { listingId } = parsed.data;
    const settings = await getSettings();
    const listing = await db.listing.findUnique({ where: { id: listingId }, select: { id: true, publicId: true } });
    if (!listing && !settings.featuredListingIds.includes(listingId)) throw new ContentActionError("listing_not_found", 404);

    if (listing) await db.listing.update({ where: { id: listing.id }, data: { featuredUntil: null } });
    if (settings.featuredListingIds.includes(listingId)) {
      await updateSettings({ featuredListingIds: settings.featuredListingIds.filter((id) => id !== listingId) }, staff.id);
    }
    await audit({
      actorId: staff.id,
      action: "listing.unfeature",
      targetType: "Listing",
      targetId: listingId,
      details: { publicId: listing?.publicId ?? null },
    });
    return ok();
  }, { freshProof: "window" });
}

/** Removes featured listings whose date has passed or that are no longer LIVE. */
export async function removeEndedFeatured(): Promise<ActionResult<{ removed: number }>> {
  return runContentAction("content", "featured", async (staff) => {
    const settings = await getSettings();
    const now = new Date();
    const rows = await db.listing.findMany({
      where: { OR: [{ id: { in: settings.featuredListingIds } }, { featuredUntil: { not: null } }] },
      select: { id: true, status: true, featuredUntil: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ended = new Set<string>();
    for (const id of settings.featuredListingIds) {
      const row = byId.get(id);
      if (!row || row.status !== "LIVE" || !row.featuredUntil || row.featuredUntil.getTime() <= now.getTime()) ended.add(id);
    }
    for (const row of rows) {
      if (row.featuredUntil && (row.featuredUntil.getTime() <= now.getTime() || row.status !== "LIVE")) ended.add(row.id);
    }
    if (ended.size === 0) return ok({ removed: 0 });

    await db.listing.updateMany({ where: { id: { in: [...ended] } }, data: { featuredUntil: null } });
    await updateSettings({ featuredListingIds: settings.featuredListingIds.filter((id) => !ended.has(id)) }, staff.id);
    await audit({
      actorId: staff.id,
      action: "listing.unfeature_ended",
      targetType: "Listing",
      targetId: [...ended].slice(0, 20).join(","),
      details: { count: ended.size },
    });
    return ok({ removed: ended.size });
  }, { freshProof: "window" });
}
