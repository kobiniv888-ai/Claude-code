/**
 * Round 3, brief 10 ("a unique title and description for every page, in every language;
 * hreflang between the languages, and canonical links"): calls the real generateMetadata of the
 * public pages in all five languages, against the local database (DATABASE_URL in .env):
 *
 * - the static pages, the search landings (with and without a city), a sample of listings, the
 *   city pages and overviews from listCityPages() (when their route exists)
 * - every title and description is non-empty and not a message key
 * - among the pages that can be indexed on their own (not noindex, their own canonical), no two
 *   pages of a language share a title or a description; each has a self canonical and hreflang for
 *   the five languages + x-default
 * - the private pages (login, saved, unsubscribe, shared lists, the post form, account and trip
 *   pages, admin) are noindex
 *
 * listCityPages() and the city pages' counts are replaced by "every city × type has 5 real
 * listings", so the city landings and city pages are judged as they will be on a full site (the
 * local database has demo data only).
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sealPin } from "@/lib/field-crypto";

vi.mock("server-only", () => ({}));
// next-intl's navigation build does not load under vitest; metadata never renders a link.
vi.mock("@/i18n/navigation", () => ({
  Link: () => null,
  redirect: () => {
    throw new Error("redirect");
  },
  permanentRedirect: () => null,
  useRouter: () => ({}),
  usePathname: () => "/",
  getPathname: () => "/",
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (arg: string | { locale?: string; namespace?: string }) => {
    const { locale = "he", namespace = "" } = typeof arg === "string" ? { namespace: arg } : arg;
    const [ns] = namespace.split(".");
    const messages = JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, `${ns}.json`), "utf8"));
    return createTranslator({ locale, messages: { [ns]: messages }, namespace: namespace as never });
  },
  setRequestLocale: () => {},
  getLocale: async () => "he",
}));
// Signed out: what search engines see.
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => null,
  getSession: async () => null,
  requireUser: async () => {
    throw new Error("signed out");
  },
}));
// The city pages decide their own indexing from these counts, the search and the sitemap from
// listCityPages(): 5 real listings of each type in every city.
vi.mock("@/lib/city-pages/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/city-pages/server")>();
  const { CITY_PAGE_TYPES } = await import("@/lib/city-pages/core");
  return {
    ...actual,
    getCityTypeCounts: async () => Object.fromEntries(CITY_PAGE_TYPES.map((type) => [type, { count: 5, realCount: 5 }])),
    listCityPages: async () => {
      const { getCities } = await import("@/lib/places");
      return (await getCities()).flatMap((city) =>
        CITY_PAGE_TYPES.map((type) => ({ citySlug: city.slug, type, realCount: 5, indexable: true, updatedAt: null })),
      );
    },
  };
});

const { locales } = await import("@/config/site");
const { siteUrl } = await import("@/lib/site-url");
const { db } = await import("@/lib/db");
const { getCities } = await import("@/lib/places");
const { DEAL_FILTERS } = await import("@/lib/listing/search-params");
const { CITY_PAGE_TYPES } = await import("@/lib/city-pages/core");

const origin = siteUrl();
const SITE = path.join(process.cwd(), "src/app/[locale]/(site)");
const LISTING_SAMPLE = 12;
const CITY_SAMPLE = 3;

type Params = Record<string, string>;
type MetadataFn = (props: { params: Promise<Params>; searchParams: Promise<Record<string, string>> }) => Promise<Metadata>;

async function metadataOf(route: string): Promise<MetadataFn | null> {
  const file = path.join(SITE, route, "page.tsx");
  if (!fs.existsSync(file)) return null;
  const mod = (await import(/* @vite-ignore */ file)) as { generateMetadata?: MetadataFn };
  return mod.generateMetadata ?? null;
}

type Entry = { locale: string; url: string; title: string; description: string; meta: Metadata };

function titleOf(meta: Metadata): string {
  const title = meta.title as Metadata["title"];
  if (typeof title === "string") return title;
  if (title && typeof title === "object" && "absolute" in title) return String(title.absolute ?? "");
  return "";
}

function isNoIndex(meta: Metadata): boolean {
  const robots = meta.robots;
  return !!robots && typeof robots === "object" && robots.index === false;
}

const entries: Entry[] = [];
let sampleCities: string[] = [];
const privates: { route: string; meta: Metadata }[] = [];

async function collect(route: string, params: Params, url: string, query: Record<string, string> = {}) {
  const fn = await metadataOf(route);
  if (!fn) return;
  for (const locale of locales) {
    const meta = await fn({ params: Promise.resolve({ locale, ...params }), searchParams: Promise.resolve(query) });
    entries.push({ locale, url: `${origin}/${locale}${url === "/" ? "" : url}`, title: titleOf(meta), description: String(meta.description ?? ""), meta });
  }
}

const STATIC_ROUTES: { route: string; url: string }[] = [
  { route: "", url: "/" },
  { route: "about", url: "/about" },
  { route: "how-it-works", url: "/how-it-works" },
  { route: "safety", url: "/safety" },
  { route: "help", url: "/help" },
  { route: "contact", url: "/contact" },
  { route: "jewish-life", url: "/jewish-life" },
  { route: "legal", url: "/legal" },
  { route: "legal/terms", url: "/legal/terms" },
  { route: "legal/privacy", url: "/legal/privacy" },
  { route: "legal/cookies", url: "/legal/cookies" },
  { route: "legal/accessibility", url: "/legal/accessibility" },
  { route: "legal/listing-rules", url: "/legal/listing-rules" },
  { route: "photo-credits", url: "/photo-credits" },
];

const PRIVATE_ROUTES: { route: string; params?: Params; query?: Record<string, string> }[] = [
  { route: "login" },
  { route: "two-factor" },
  { route: "two-factor/setup" },
  { route: "verify-phone" },
  { route: "saved" },
  { route: "unsubscribe", query: { token: "x" } },
  { route: "lists/[token]", params: { token: "not-a-real-token" } },
  { route: "post" },
  { route: "help/new-ticket" },
  { route: "account" },
  { route: "account/trips" },
  { route: "account/trips/[code]", params: { code: "ABC123" } },
  { route: "account/favorites" },
  { route: "account/settings" },
];

beforeAll(async () => {
  for (const { route, url } of STATIC_ROUTES) await collect(route, {}, url);

  // Search: /search, each deal, and a few cities with each deal.
  const cities = (await getCities()).slice(0, CITY_SAMPLE);
  sampleCities = cities.map((c) => c.slug);
  for (const deal of [null, ...DEAL_FILTERS]) {
    for (const city of [null, ...cities.map((c) => c.slug)]) {
      const query: Record<string, string> = { ...(deal ? { deal } : {}), ...(city ? { city } : {}) };
      const qs = new URLSearchParams(query).toString();
      await collect("search", {}, qs ? `/search?${qs}` : "/search", query);
    }
  }

  // City pages and overviews (src/lib/city-pages), when their routes exist.
  for (const city of cities) {
    await collect("[city]", { city: city.slug }, `/${city.slug}`);
    for (const type of CITY_PAGE_TYPES) await collect("[city]/[type]", { city: city.slug, type }, `/${city.slug}/${type}`);
  }

  // A sample of listings (demo ones are noindex, but their titles and descriptions follow the same rule).
  const listings = await db.listing.findMany({
    where: { status: "LIVE", deletedAt: null },
    orderBy: { publicId: "asc" },
    take: LISTING_SAMPLE,
    select: { publicId: true },
  });
  for (const { publicId } of listings) {
    const fn = await metadataOf("listing/[id]");
    for (const locale of locales) {
      const meta = await fn!({ params: Promise.resolve({ locale, id: String(publicId) }), searchParams: Promise.resolve({}) });
      const canonical = String((meta.alternates as { canonical?: string } | undefined)?.canonical ?? "");
      entries.push({ locale, url: canonical, title: titleOf(meta), description: String(meta.description ?? ""), meta });
    }
  }

  for (const { route, params = {}, query = {} } of PRIVATE_ROUTES) {
    const fn = await metadataOf(route);
    if (!fn) continue;
    const meta = await fn({ params: Promise.resolve({ locale: "he", ...params }), searchParams: Promise.resolve(query) });
    privates.push({ route, meta });
  }
}, 240_000);

/** Pages that may be indexed on their own: not noindex and their own canonical page. */
function standalone(entry: Entry): boolean {
  const canonical = (entry.meta.alternates as { canonical?: string } | undefined)?.canonical;
  return !isNoIndex(entry.meta) && canonical === entry.url;
}

describe("titles and descriptions", () => {
  it("covers the public pages in all five languages", () => {
    expect(entries.length).toBeGreaterThan(STATIC_ROUTES.length * 5);
    // The city pages and overviews (src/lib/city-pages) are among them once their routes exist.
    if (fs.existsSync(path.join(SITE, "[city]/[type]/page.tsx"))) {
      expect(entries.some((e) => standalone(e) && /\/[a-z-]+\/short-stays$/.test(e.url))).toBe(true);
    }
    expect(new Set(entries.map((e) => e.locale))).toEqual(new Set(locales));
  });

  it("are never empty and never a raw message key", () => {
    for (const entry of entries) {
      expect(entry.title.trim(), `title of ${entry.url}`).not.toBe("");
      expect(entry.description.trim(), `description of ${entry.url}`).not.toBe("");
      for (const text of [entry.title, entry.description]) {
        expect(text, entry.url).not.toMatch(/^[a-z]+(\.[a-zA-Z]+)+$/);
        expect(text, entry.url).not.toMatch(/\{[a-zA-Z]+\}/);
      }
    }
  });

  it("are unique among the pages of a language that can be indexed", () => {
    for (const locale of locales) {
      const pages = entries.filter((e) => e.locale === locale && standalone(e));
      expect(pages.length, locale).toBeGreaterThan(STATIC_ROUTES.length);
      for (const field of ["title", "description"] as const) {
        const seen = new Map<string, string>();
        for (const page of pages) {
          const value = page[field].trim();
          expect(seen.get(value), `${locale} ${field} "${value}" on ${page.url} and ${seen.get(value)}`).toBeUndefined();
          seen.set(value, page.url);
        }
      }
    }
  });

  it("give listings different titles and descriptions (demo ones included)", () => {
    for (const locale of locales) {
      const listings = entries.filter((e) => e.locale === locale && e.url.includes("/listing/"));
      expect(new Set(listings.map((e) => e.title)).size, locale).toBe(listings.length);
      expect(new Set(listings.map((e) => e.description)).size, locale).toBe(listings.length);
    }
  });
});

describe("canonical and hreflang", () => {
  it("every page that can be indexed has a self canonical and the five languages + x-default", () => {
    for (const entry of entries.filter(standalone)) {
      const alternates = entry.meta.alternates as { canonical: string; languages: Record<string, string> };
      expect(alternates.canonical, entry.url).toBe(entry.url);
      expect(Object.keys(alternates.languages).sort(), entry.url).toEqual([...locales, "x-default"].sort());
      expect(alternates.languages[entry.locale], entry.url).toBe(entry.url);
      for (const href of Object.values(alternates.languages)) expect(href.startsWith(origin), href).toBe(true);
    }
  });

  it("points a city + deal search to its city page, and filtered searches to their landing", async () => {
    const city = { slug: sampleCities[0] };
    expect(city.slug).toBeTruthy();
    const landing = entries.find((e) => e.locale === "he" && e.url === `${origin}/he/search?deal=short-stay&city=${city.slug}`)!;
    expect((landing.meta.alternates as { canonical: string }).canonical).toBe(`${origin}/he/${city.slug}/short-stays`);
    const fn = await metadataOf("search");
    const filtered = await fn!({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ deal: "monthly", city: city.slug, bedrooms: "2", sort: "newest", page: "2" }),
    });
    expect(isNoIndex(filtered)).toBe(true);
    expect((filtered.alternates as { canonical: string }).canonical).toBe(`${origin}/en/search?deal=monthly&city=${city.slug}`);
  });
});

describe("private pages", () => {
  it("are never indexed", () => {
    expect(privates.length).toBeGreaterThanOrEqual(PRIVATE_ROUTES.length - 2);
    for (const { route, meta } of privates) {
      const ownNoIndex = isNoIndex(meta);
      // Account pages without their own robots inherit the account layout's noindex.
      const layout = route.startsWith("account") ? fs.readFileSync(path.join(SITE, "account/layout.tsx"), "utf8") : "";
      expect(ownNoIndex || /robots:\s*\{\s*index:\s*false/.test(layout), route).toBe(true);
    }
  });

  it("demo listing pages say noindex, nofollow", async () => {
    const demo = await db.listing.findFirst({ where: { status: "LIVE", deletedAt: null, isDemo: true }, select: { publicId: true } });
    if (!demo) return;
    const meta = entries.find((e) => e.url.includes(`/listing/${demo.publicId}-`) || e.url.endsWith(`/listing/${demo.publicId}`));
    if (!meta || !meta.meta.robots) return; // The demo data is hidden: the page is a 404 (noindex) for visitors.
    expect(meta.meta.robots).toEqual({ index: false, follow: false });
  });
});

describe("two listings with the same title (seo-10)", () => {
  // Their own city, owner and two live real listings that share a generic title, removed afterwards.
  const prefix = `p6fix${Date.now().toString(36)}`;
  const ids = { city: "", owner: "", listings: [] as { id: string; publicId: number }[] };

  beforeAll(async () => {
    const city = await db.city.create({
      data: { slug: `${prefix}-city`, names: { he: "עיר בדיקה", en: "Test City", ru: "Тестгород", ar: "مدينة اختبار", ka: "სატესტო ქალაქი" }, searchText: "test city", lat: 41.6, lng: 41.6, sortOrder: 999 },
    });
    ids.city = city.id;
    const owner = await db.user.create({
      data: { id: `${prefix}-owner`, name: "Owner", firstName: "Owner", email: `${prefix}@example.com`, locale: "en", status: "ACTIVE" },
    });
    ids.owner = owner.id;
    for (let i = 0; i < 2; i++) {
      const row = await db.listing.create({
        data: {
          ownerId: owner.id,
          status: "LIVE",
          dealType: "SHORT_STAY",
          propertyType: "APARTMENT",
          pricePeriod: "NIGHT",
          price: 100,
          currency: "GEL",
          cityId: city.id,
          pinEnc: sealPin({ lat: 41.6, lng: 41.6 }),
          originalLocale: "en",
          title: i === 0 ? "Apartment near the sea" : "apartment near the Sea",
          description: "The same words from one agency, for two different flats.",
          isDemo: false,
          publishedAt: new Date(),
        },
        select: { id: true, publicId: true },
      });
      ids.listings.push(row);
    }
    const { clearPlacesCache } = await import("@/lib/places");
    clearPlacesCache();
  }, 60_000);

  afterAll(async () => {
    await db.listing.deleteMany({ where: { id: { in: ids.listings.map((l) => l.id) } } });
    await db.user.deleteMany({ where: { id: ids.owner } });
    await db.city.deleteMany({ where: { id: ids.city } });
    const { clearPlacesCache } = await import("@/lib/places");
    clearPlacesCache();
  });

  it("get different titles: the public ID is added to each", async () => {
    const fn = (await metadataOf("listing/[id]"))!;
    for (const locale of locales) {
      const titles: string[] = [];
      for (const { publicId } of ids.listings) {
        const meta = await fn({ params: Promise.resolve({ locale, id: String(publicId) }), searchParams: Promise.resolve({}) });
        expect(isNoIndex(meta), `${locale} ${publicId}`).toBe(false);
        titles.push(titleOf(meta));
        expect(titleOf(meta), locale).toContain(`#${publicId}`);
      }
      expect(new Set(titles).size, locale).toBe(2);
    }
  });
});
