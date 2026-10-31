import type { MetadataRoute } from "next";
import { locales, siteConfig } from "@/config/site";
import { db } from "@/lib/db";
import { DEAL_FILTERS, type DealFilter } from "@/lib/listing/search-params";
import { listingPath, searchPath } from "@/lib/listing/urls";
import { publicListingWhere } from "@/lib/listing/where";
import { getCities } from "@/lib/places";
import { absoluteUrl, localizedPath, X_DEFAULT_LOCALE } from "@/lib/seo";
import { getSettings } from "@/lib/settings";

/**
 * /sitemap.xml — every public page in the five languages (with hreflang alternates): the static
 * pages, the popular cities × deal types, and every LIVE listing (demo listings only while the
 * "demo data" setting is on). One file holds up to 50,000 URLs, so the listings are capped at the
 * most recently updated MAX_LISTINGS (× 5 languages).
 */

// Read the database on request (not at build time).
export const dynamic = "force-dynamic";

const MAX_LISTINGS = 9_000;

/** Pages that exist in every language and should be indexed. */
const STATIC_PAGES: readonly { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/search", priority: 0.9, changeFrequency: "hourly" },
  { path: "/jewish-life", priority: 0.8, changeFrequency: "weekly" },
  { path: "/how-it-works", priority: 0.6, changeFrequency: "monthly" },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" },
  { path: "/safety", priority: 0.6, changeFrequency: "monthly" },
  { path: "/help", priority: 0.5, changeFrequency: "weekly" },
  { path: "/contact", priority: 0.4, changeFrequency: "monthly" },
  { path: "/legal", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/terms", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/cookies", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/accessibility", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/listing-rules", priority: 0.2, changeFrequency: "yearly" },
];

/** Deals linked for each popular city (null = all deals). */
const CITY_DEALS: readonly (DealFilter | null)[] = [null, ...DEAL_FILTERS.filter((deal) => deal !== "rent")];

type Entry = MetadataRoute.Sitemap[number];

/** One entry per language for a page path, each listing the others as alternates. */
function localized(path: string, extra: Omit<Entry, "url" | "alternates"> = {}): Entry[] {
  const languages: Record<string, string> = Object.fromEntries(
    locales.map((locale) => [locale, absoluteUrl(localizedPath(locale, path))]),
  );
  languages["x-default"] = absoluteUrl(localizedPath(X_DEFAULT_LOCALE, path));
  return locales.map((locale) => ({ url: languages[locale], alternates: { languages }, ...extra }));
}

async function safely<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    console.error(`[sitemap] could not load ${label}:`, error);
    return fallback;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const settings = await safely("settings", getSettings, null);
  const demoVisible = settings?.demoDataVisible ?? false;

  const [cities, listings, guides] = await Promise.all([
    safely("cities", getCities, []),
    safely(
      "listings",
      () =>
        db.listing.findMany({
          where: publicListingWhere({ demoVisible, now }),
          orderBy: { updatedAt: "desc" },
          take: MAX_LISTINGS,
          select: { publicId: true, title: true, updatedAt: true },
        }),
      [],
    ),
    siteConfig.features.articles
      ? safely(
          "guides",
          () =>
            db.article.findMany({
              where: { status: "PUBLISHED" },
              orderBy: { publishedAt: "desc" },
              take: 500,
              select: { slug: true, updatedAt: true },
            }),
          [],
        )
      : Promise.resolve([]),
  ]);

  return [
    ...STATIC_PAGES.flatMap(({ path, priority, changeFrequency }) => localized(path, { priority, changeFrequency })),
    ...cities
      .filter((city) => city.isPopular)
      .flatMap((city) =>
        CITY_DEALS.flatMap((deal) =>
          localized(searchPath({ city: city.slug, deal }), { changeFrequency: "daily", priority: deal ? 0.7 : 0.8 }),
        ),
      ),
    ...guides.flatMap((guide) =>
      localized(`/jewish-life/guides/${guide.slug}`, { lastModified: guide.updatedAt, changeFrequency: "monthly", priority: 0.5 }),
    ),
    ...listings.flatMap((listing) =>
      localized(listingPath(listing.publicId, listing.title), {
        lastModified: listing.updatedAt,
        changeFrequency: "weekly",
        priority: 0.6,
      }),
    ),
  ];
}
