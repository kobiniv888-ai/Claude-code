/**
 * The real site's behaviour (round 3, brief 10), with SITE_URL set to the test origin and the
 * request coming from that host, against the local database (DATABASE_URL in .env):
 *
 * - robots.txt opens the public site and names the sitemap (another host: open, so crawlers read
 *   its noindex, and no sitemap)
 * - the sitemap lists real published listings and never a demo one, even while demo data is shown
 * - a demo listing page is "noindex, nofollow"
 * - a city with fewer than 3 real listings of a type: its page and search landing are noindex and
 *   not in the sitemap; with the 3rd real listing they are indexable and listed
 *
 * Creates its own (inactive) city, a fake @example.com host and listings, and removes them.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ORIGIN = "http://localhost:4691";
vi.stubEnv("SITE_URL", ORIGIN);
// The real site: only SITE_ENV=production is ever indexed (src/lib/seo.ts).
vi.stubEnv("SITE_ENV", "production");

const state = vi.hoisted(() => ({ host: "localhost:4691", city: null as null | Record<string, unknown> }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: state.host }),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));
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
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => null, getSession: async () => null }));
// Only this test's city is a city of the site.
vi.mock("@/lib/places", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/places")>();
  return {
    ...actual,
    getCities: async () => (state.city ? [state.city] : []),
    getCityBySlug: async (slug: string) => (state.city && state.city.slug === slug ? state.city : null),
  };
});
// The demo data is shown: demo listings are public, and must still never be indexed or listed.
vi.mock("@/lib/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/settings")>();
  return { ...actual, getSettings: async () => ({ ...(await actual.getSettings()), demoDataVisible: true }) };
});

const { db } = await import("@/lib/db");
const { default: robots } = await import("@/app/robots");
const { default: sitemap } = await import("@/app/sitemap");
const { listCityPages } = await import("@/lib/city-pages");

const prefix = `seo${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const host = `${prefix}-host`;
const citySlug = `${prefix}-city`;
const ids = { city: "", real: [] as number[], demo: 0 };

type MetadataFn = (props: { params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }) => Promise<Metadata>;
const SITE = path.join(process.cwd(), "src/app/[locale]/(site)");
async function metadataOf(route: string): Promise<MetadataFn | null> {
  const file = path.join(SITE, route, "page.tsx");
  if (!fs.existsSync(file)) return null;
  return ((await import(/* @vite-ignore */ file)) as { generateMetadata?: MetadataFn }).generateMetadata ?? null;
}
const noIndex = (meta: Metadata) => !!meta.robots && typeof meta.robots === "object" && meta.robots.index === false;

async function addListing(isDemo: boolean, n: number): Promise<number> {
  const listing = await db.listing.create({
    data: {
      ownerId: host,
      status: "LIVE",
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
      cityId: ids.city,
      title: `${prefix} flat ${n}${isDemo ? " demo" : ""}`,
      description: `${prefix} test flat number ${n}.`,
      price: 100 + n,
      currency: "GEL",
      pricePeriod: "NIGHT",
      publishedAt: new Date(),
      isDemo,
    },
    select: { publicId: true },
  });
  return listing.publicId;
}

beforeAll(async () => {
  await db.user.create({ data: { id: host, name: "SEO Test", email: `${host}@example.com` } });
  const city = await db.city.create({
    data: { slug: citySlug, names: { he: "עיר בדיקה", en: "Test City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "test city", lat: 41.6, lng: 41.6, active: false },
  });
  ids.city = city.id;
  state.city = { id: city.id, slug: citySlug, countryCode: "GE", names: city.names, lat: 41.6, lng: 41.6, timezone: "Asia/Tbilisi", photoUrl: null, isPopular: true, sortOrder: 0, airportCode: null, airportLat: null, airportLng: null };
  ids.real.push(await addListing(false, 1), await addListing(false, 2));
  ids.demo = await addListing(true, 3);
}, 60_000);

afterAll(async () => {
  await db.listing.deleteMany({ where: { ownerId: host } });
  await db.city.deleteMany({ where: { id: ids.city } });
  await db.user.deleteMany({ where: { id: host } });
  vi.unstubAllEnvs();
});

describe("robots.txt on the real site", () => {
  it("opens the public site and names the sitemap", async () => {
    state.host = "localhost:4691";
    const result = await robots();
    const rule = (Array.isArray(result.rules) ? result.rules[0] : result.rules)!;
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(expect.arrayContaining(["/he/account/", "/he/admin$", "/api/"]));
    expect(result.sitemap).toBe(`${ORIGIN}/sitemap.xml`);
  });

  it("names no sitemap for any other host, and lets crawlers read its noindex (seo-4)", async () => {
    for (const other of ["127.0.0.1:4691", "localhost:3000", "preview-123.vercel.app"]) {
      state.host = other;
      const result = await robots();
      expect(result.rules, other).toEqual([{ userAgent: "*", allow: "/" }]);
      expect(result.sitemap, other).toBeUndefined();
    }
    state.host = "localhost:4691";
  });
});

describe("indexing with fewer than 3 real listings, then 3", () => {
  it("keeps the city page and its search landing out of the index and the sitemap", async () => {
    const pages = await listCityPages();
    expect(pages.find((p) => p.citySlug === citySlug && p.type === "short-stays")).toMatchObject({ realCount: 2, indexable: false });

    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((url) => url.includes(`/${citySlug}`))).toBe(false);

    const search = await metadataOf("search");
    const landing = await search!({ params: Promise.resolve({ locale: "he" }), searchParams: Promise.resolve({ deal: "short-stay", city: citySlug }) });
    expect(noIndex(landing)).toBe(true);

    const cityPage = await metadataOf("[city]/[type]");
    if (cityPage) {
      const meta = await cityPage({ params: Promise.resolve({ locale: "he", city: citySlug, type: "short-stays" }), searchParams: Promise.resolve({}) });
      expect(noIndex(meta)).toBe(true);
    }
  });

  it("indexes and lists them once the 3rd real listing is live (the demo one never counts)", async () => {
    ids.real.push(await addListing(false, 4));
    const pages = await listCityPages();
    expect(pages.find((p) => p.citySlug === citySlug && p.type === "short-stays")).toMatchObject({ realCount: 3, indexable: true });

    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain(`${ORIGIN}/he/${citySlug}/short-stays`);
    expect(urls).toContain(`${ORIGIN}/en/${citySlug}`);
    expect(urls.some((url) => url.includes(`/${citySlug}/monthly`))).toBe(false);

    const search = await metadataOf("search");
    const landing = await search!({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({ deal: "short-stay", city: citySlug }) });
    expect(noIndex(landing)).toBe(false);
    expect((landing.alternates as { canonical: string }).canonical).toBe(`${ORIGIN}/en/${citySlug}/short-stays`);

    const cityPage = await metadataOf("[city]/[type]");
    if (cityPage) {
      const meta = await cityPage({ params: Promise.resolve({ locale: "en", city: citySlug, type: "short-stays" }), searchParams: Promise.resolve({}) });
      expect(noIndex(meta)).toBe(false);
      expect((meta.alternates as { canonical: string }).canonical).toBe(`${ORIGIN}/en/${citySlug}/short-stays`);
    }
  });
});

describe("demo listings", () => {
  it("are never in the sitemap, whatever the demo setting; real ones are, in every language", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls.length).toBeLessThanOrEqual(50_000);
    const demoIds = (await db.listing.findMany({ where: { isDemo: true }, select: { publicId: true } })).map((l) => l.publicId);
    expect(demoIds).toContain(ids.demo);
    for (const id of demoIds) {
      expect(urls.some((url) => new RegExp(`/listing/${id}(-|$)`).test(url)), `demo listing ${id}`).toBe(false);
    }
    for (const id of ids.real) {
      for (const locale of ["he", "en", "ru", "ar", "ka"]) {
        expect(urls.some((url) => url.startsWith(`${ORIGIN}/${locale}/listing/${id}-`)), `listing ${id} in ${locale}`).toBe(true);
      }
    }
    const real = entries.find((entry) => entry.url.startsWith(`${ORIGIN}/he/listing/${ids.real[0]}-`))!;
    expect(real.lastModified).toBeInstanceOf(Date);
    expect(Object.keys(real.alternates?.languages ?? {}).sort()).toEqual(["ar", "en", "he", "ka", "ru", "x-default"]);
  });

  it("their page says noindex, nofollow while a real one may be indexed", async () => {
    const listing = await metadataOf("listing/[id]");
    const demo = await listing!({ params: Promise.resolve({ locale: "he", id: String(ids.demo) }), searchParams: Promise.resolve({}) });
    expect(demo.robots).toEqual({ index: false, follow: false });
    const real = await listing!({ params: Promise.resolve({ locale: "he", id: String(ids.real[0]) }), searchParams: Promise.resolve({}) });
    expect(real.robots).toBeUndefined();
    expect((real.alternates as { canonical: string }).canonical).toMatch(new RegExp(`^${ORIGIN}/he/listing/${ids.real[0]}-`));
  });
});
