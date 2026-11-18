/**
 * The sitemap's entries (round 3, brief 10), pure so the rules are unit-tested; src/app/sitemap.ts
 * loads the data. Every URL is a page that may be indexed, in each of the five languages with its
 * hreflang alternates (+ x-default):
 *
 * - the static pages (home, Jewish life, help, legal…)
 * - the search landings that are indexed and their own canonical page (src/lib/search/seo.ts)
 * - the INDEXABLE city pages (at least 3 real listings, listCityPages() of src/lib/city-pages) and
 *   the city overviews with at least one indexable page
 * - the published Jewish-life guides
 * - the real published listings: never demo listings, whatever the "demo data" setting says
 *
 * One sitemap file holds at most 50,000 URLs: the listings get what the other pages leave. The URLs
 * are XML-escaped ("&" → "&amp;"), because Next writes them into the XML as they are.
 */
import type { MetadataRoute } from "next";
import { locales, type AppLocale } from "@/config/site";
import { cityOverviewPath, cityPagePath, indexableCityOverviews, type CityPageEntry } from "@/lib/city-pages/core";
import { absoluteUrl, localizedPath, X_DEFAULT_LOCALE } from "@/lib/seo";

export type SitemapEntry = MetadataRoute.Sitemap[number];
type ChangeFrequency = SitemapEntry["changeFrequency"];

/** The sitemap protocol's limit for one file. */
export const SITEMAP_URL_LIMIT = 50_000;

/** Pages that exist in every language and are always indexed. */
export const STATIC_SITEMAP_PAGES: readonly { path: string; priority: number; changeFrequency: ChangeFrequency }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
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
  { path: "/photo-credits", priority: 0.1, changeFrequency: "yearly" },
];

export type SitemapListing = {
  /** The listing's path in each language (listingPathsByLocale): each language has its own slug. */
  paths: Record<AppLocale, string>;
  lastModified: Date | null;
};

export type SitemapGuide = { slug: string; updatedAt: Date | null };

export type SitemapInput = {
  /** Indexed search landings without the locale ("/search", "/search?deal=hotels"). */
  searchPaths: readonly string[];
  /** listCityPages(): every city × type; only the indexable ones are listed. */
  cityPages: readonly CityPageEntry[];
  guides: readonly SitemapGuide[];
  listings: readonly SitemapListing[];
};

function withDate(date: Date | null | undefined): Pick<SitemapEntry, "lastModified"> {
  return date && !Number.isNaN(date.getTime()) ? { lastModified: date } : {};
}

/** One entry per language for a path that is the same in every language. */
export function localizedEntries(path: string, extra: Omit<SitemapEntry, "url" | "alternates"> = {}): SitemapEntry[] {
  return entriesFor(Object.fromEntries(locales.map((locale) => [locale, path])) as Record<AppLocale, string>, extra);
}

/**
 * A URL as XML text: Next 16 writes the sitemap's <loc> and hreflang href="…" without escaping, so a
 * landing such as "/search?deal=rent&city=batumi" would make the whole file malformed (Google then
 * rejects all of it). Only here: pageMetadata's URLs go through React, which escapes them itself.
 */
export function xmlEscapeUrl(url: string): string {
  return url
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** One entry per language, each listing all five (and x-default) as alternates (URLs XML-escaped). */
function entriesFor(paths: Record<AppLocale, string>, extra: Omit<SitemapEntry, "url" | "alternates">): SitemapEntry[] {
  const languages: Record<string, string> = Object.fromEntries(
    locales.map((locale) => [locale, xmlEscapeUrl(absoluteUrl(localizedPath(locale, paths[locale])))]),
  );
  languages["x-default"] = languages[X_DEFAULT_LOCALE];
  return locales.map((locale) => ({ url: languages[locale], alternates: { languages }, ...extra }));
}

/** Every entry except the listings, in order. */
export function pageEntries(input: Omit<SitemapInput, "listings">): SitemapEntry[] {
  const indexable = input.cityPages.filter((page) => page.indexable);
  return [
    ...STATIC_SITEMAP_PAGES.flatMap(({ path, priority, changeFrequency }) => localizedEntries(path, { priority, changeFrequency })),
    ...input.searchPaths.map((path) => ({ path, priority: path === "/search" ? 0.9 : 0.7 })).flatMap(({ path, priority }) =>
      localizedEntries(path, { priority, changeFrequency: "daily" }),
    ),
    ...indexableCityOverviews(indexable).flatMap((city) =>
      localizedEntries(cityOverviewPath(city.citySlug), { ...withDate(city.updatedAt), changeFrequency: "daily", priority: 0.8 }),
    ),
    ...indexable.flatMap((page) =>
      localizedEntries(cityPagePath(page.citySlug, page.type), { ...withDate(page.updatedAt), changeFrequency: "daily", priority: 0.8 }),
    ),
    ...input.guides.flatMap((guide) =>
      localizedEntries(`/jewish-life/guides/${guide.slug}`, { ...withDate(guide.updatedAt), changeFrequency: "monthly", priority: 0.5 }),
    ),
  ];
}

/** How many listings fit next to `otherEntries` URLs (each listing takes one URL per language). */
export function listingCapacity(otherEntries: number, limit: number = SITEMAP_URL_LIMIT): number {
  return Math.max(0, Math.floor((limit - otherEntries) / locales.length));
}

/** The whole sitemap, never more than SITEMAP_URL_LIMIT URLs (the newest listings first, as given). */
export function buildSitemap(input: SitemapInput, limit: number = SITEMAP_URL_LIMIT): MetadataRoute.Sitemap {
  const pages = pageEntries(input);
  const listings = input.listings
    .slice(0, listingCapacity(pages.length, limit))
    .flatMap((listing) => entriesFor(listing.paths, { ...withDate(listing.lastModified), changeFrequency: "weekly", priority: 0.6 }));
  return [...pages, ...listings].slice(0, limit);
}
