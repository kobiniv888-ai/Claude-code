import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { laterDate } from "@/lib/city-pages/core";
import { listCityPages } from "@/lib/city-pages";
import { db } from "@/lib/db";
import { listingPathsByLocale } from "@/lib/listing-page/load";
import { publicListingWhere } from "@/lib/listing/where";
import { indexableSearchPaths } from "@/lib/search/seo";
import { buildSitemap, listingCapacity, pageEntries, type SitemapGuide } from "@/lib/seo-sitemap";

/**
 * /sitemap.xml (round 3, brief 10): only pages that may be indexed, in the five languages with
 * hreflang alternates. The static pages, the indexed search landings, the INDEXABLE city pages
 * (at least 3 real listings) and their overviews, the guides, and the real published listings:
 * LIVE, public and NEVER demo, whatever the "demo data" setting says (demo listing pages are
 * noindex). lastmod: when a listing's content last changed (contentUpdatedAt, or its publishing).
 * At most 50,000 URLs (src/lib/seo-sitemap.ts). robots.txt names it only on the real site.
 */

// Read the database on request (not at build time).
export const dynamic = "force-dynamic";

/** The most listings ever asked for (× 5 languages): the page entries take the rest of the 50,000. */
const MAX_LISTINGS = 9_800;

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
  const [cityPages, guides] = await Promise.all([
    safely("city pages", listCityPages, []),
    siteConfig.features.articles
      ? safely<SitemapGuide[]>(
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
  const pages = { searchPaths: indexableSearchPaths(cityPages), cityPages, guides };
  const take = Math.min(MAX_LISTINGS, listingCapacity(pageEntries(pages).length));

  const listings = await safely(
    "listings",
    () =>
      db.listing.findMany({
        // demoVisible: false: demo listings never, even while the demo data is shown.
        where: publicListingWhere({ demoVisible: false, now }),
        orderBy: [{ contentUpdatedAt: "desc" }, { publicId: "desc" }],
        take,
        select: {
          publicId: true,
          title: true,
          originalLocale: true,
          contentUpdatedAt: true,
          publishedAt: true,
          translations: { select: { locale: true, title: true } },
        },
      }),
    [],
  );

  return buildSitemap({
    ...pages,
    // Each language has its own address (the slug of the title in that language); the page
    // redirects any other slug to it, so the sitemap lists exactly those.
    listings: listings.map((listing) => ({
      paths: listingPathsByLocale(listing),
      lastModified: laterDate(listing.contentUpdatedAt, listing.publishedAt),
    })),
  });
}
