import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { BannedWordAction, BannedWordCategory, EmailStatus, JewishPlaceType, Locale } from "@/generated/prisma/enums";
import { pickLocalized } from "@/i18n/locale";
import { db } from "@/lib/db";
import { photoUrl } from "@/lib/media";
import { getSettings } from "@/lib/settings";
import { extractAliases } from "../localized";
import { FAQ_CATEGORIES } from "../schemas";

/** Data for the admin content, settings and outbox pages (server-only). */

// ─── Hub ─────────────────────────────────────────────────────

export type ContentHubCounts = {
  cities: number;
  neighborhoods: number;
  places: number;
  demoPlaces: number;
  articles: number;
  publishedArticles: number;
  faq: number;
  activeAlerts: number;
  bannedWords: number;
  overrides: number;
  featured: number;
  homeSectionsOn: number;
  homeSectionsTotal: number;
};

export async function contentHubCounts(): Promise<ContentHubCounts> {
  const now = new Date();
  const [cities, neighborhoods, places, demoPlaces, articles, publishedArticles, faq, activeAlerts, bannedWords, overrides, settings] =
    await Promise.all([
      db.city.count(),
      db.neighborhood.count(),
      db.jewishPlace.count(),
      db.jewishPlace.count({ where: { isDemo: true } }),
      db.article.count(),
      db.article.count({ where: { status: "PUBLISHED" } }),
      db.faqItem.count(),
      db.scamAlert.count({ where: { active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } }),
      db.bannedWord.count(),
      db.translationOverride.count(),
      getSettings(),
    ]);
  const featured = await db.listing.count({
    where: { status: "LIVE", OR: [{ id: { in: settings.featuredListingIds } }, { featuredUntil: { gt: now } }] },
  });
  return {
    cities,
    neighborhoods,
    places,
    demoPlaces,
    articles,
    publishedArticles,
    faq,
    activeAlerts,
    bannedWords,
    overrides,
    featured,
    homeSectionsOn: settings.homeSections.filter((s) => s.enabled).length,
    homeSectionsTotal: settings.homeSections.length,
  };
}

// ─── Featured listings ───────────────────────────────────────

export type FeaturedRow = {
  id: string;
  publicId: number;
  title: string;
  city: string;
  status: string;
  photo: string | null;
  featuredUntil: Date | null;
  inSettings: boolean;
  isDemo: boolean;
  /** Ended = date passed or not LIVE any more. */
  ended: boolean;
};

export async function listFeatured(locale: string): Promise<FeaturedRow[]> {
  const settings = await getSettings();
  const now = new Date();
  const rows = await db.listing.findMany({
    where: { OR: [{ id: { in: settings.featuredListingIds } }, { featuredUntil: { gt: now } }] },
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
  const order = new Map(settings.featuredListingIds.map((id, i) => [id, i]));
  return rows
    .map((row) => ({
      id: row.id,
      publicId: row.publicId,
      title: row.title,
      city: row.city ? pickLocalized(row.city.names, locale) : "",
      status: row.status,
      photo: row.photos[0] ? photoUrl(row.photos[0], "sm") : null,
      featuredUntil: row.featuredUntil,
      inSettings: order.has(row.id),
      isDemo: row.isDemo,
      ended: row.status !== "LIVE" || !row.featuredUntil || row.featuredUntil.getTime() <= now.getTime(),
    }))
    .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
}

// ─── Cities ──────────────────────────────────────────────────

export async function listCities(locale: string) {
  const rows = await db.city.findMany({
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
    select: {
      id: true,
      slug: true,
      names: true,
      isPopular: true,
      active: true,
      sortOrder: true,
      photoUrl: true,
      airportCode: true,
      _count: { select: { neighborhoods: true, listings: true, places: true } },
    },
  });
  return rows.map((row) => ({ ...row, name: pickLocalized(row.names, locale) }));
}

export async function getCity(id: string) {
  const city = await db.city.findUnique({
    where: { id },
    include: {
      neighborhoods: {
        orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
        include: { _count: { select: { listings: true } } },
      },
      _count: { select: { listings: true, places: true } },
    },
  });
  if (!city) return null;
  return {
    ...city,
    aliases: extractAliases(city.searchText, city.names),
    neighborhoods: city.neighborhoods.map((n) => ({ ...n, aliases: extractAliases(n.searchText, n.names) })),
  };
}
export type AdminCity = NonNullable<Awaited<ReturnType<typeof getCity>>>;

export async function cityOptions(locale: string) {
  const rows = await db.city.findMany({
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
    select: { id: true, names: true, lat: true, lng: true, active: true },
  });
  return rows.map((r) => ({ id: r.id, name: pickLocalized(r.names, locale), lat: r.lat, lng: r.lng, active: r.active }));
}
export type CityOption = Awaited<ReturnType<typeof cityOptions>>[number];

// ─── Jewish places ───────────────────────────────────────────

export async function listPlaces(
  locale: string,
  filters: { type?: JewishPlaceType; cityId?: string; q?: string; show?: "active" | "hidden" | "demo" | "real" | "verified" | "unverified" },
) {
  const where: Prisma.JewishPlaceWhereInput = {
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.cityId ? { cityId: filters.cityId } : {}),
    ...(filters.show === "active" ? { active: true } : {}),
    ...(filters.show === "hidden" ? { active: false } : {}),
    ...(filters.show === "demo" ? { isDemo: true } : {}),
    ...(filters.show === "real" ? { isDemo: false } : {}),
    ...(filters.show === "verified" ? { isDemo: false, verifiedAt: { not: null } } : {}),
    ...(filters.show === "unverified" ? { isDemo: false, verifiedAt: null } : {}),
  };
  const rows = await db.jewishPlace.findMany({
    where,
    orderBy: [{ isDemo: "asc" }, { type: "asc" }, { createdAt: "asc" }],
    take: 500,
    select: {
      id: true,
      type: true,
      names: true,
      address: true,
      active: true,
      isDemo: true,
      verifiedAt: true,
      phone: true,
      updatedAt: true,
      city: { select: { names: true } },
    },
  });
  const q = filters.q?.trim().toLowerCase();
  return rows
    .map((row) => ({
      ...row,
      name: pickLocalized(row.names, locale),
      cityName: row.city ? pickLocalized(row.city.names, locale) : "",
      addressText: pickLocalized(row.address, locale),
    }))
    .filter((row) => !q || JSON.stringify(row.names).toLowerCase().includes(q) || row.addressText.toLowerCase().includes(q));
}

export async function getPlace(id: string) {
  return db.jewishPlace.findUnique({ where: { id } });
}

// ─── Articles ────────────────────────────────────────────────

export async function listArticles(locale: string) {
  const rows = await db.article.findMany({
    orderBy: [{ updatedAt: "desc" }],
    take: 300,
    select: { id: true, slug: true, category: true, title: true, status: true, reviewedByLawyer: true, publishedAt: true, updatedAt: true },
  });
  return rows.map((r) => ({ ...r, titleText: pickLocalized(r.title, locale) }));
}

export async function getArticle(id: string) {
  return db.article.findUnique({ where: { id } });
}

// ─── FAQ ─────────────────────────────────────────────────────

export async function listFaqByCategory() {
  const rows = await db.faqItem.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] });
  return FAQ_CATEGORIES.map((category) => ({ category, items: rows.filter((r) => r.category === category) }));
}
export type AdminFaqItem = Awaited<ReturnType<typeof listFaqByCategory>>[number]["items"][number];

// ─── Scam alerts ─────────────────────────────────────────────

export async function listAlerts() {
  return db.scamAlert.findMany({ orderBy: [{ active: "desc" }, { startsAt: "desc" }], take: 200 });
}
export type AdminScamAlert = Awaited<ReturnType<typeof listAlerts>>[number];

// ─── Banned words ────────────────────────────────────────────

export const BANNED_WORDS_PAGE_SIZE = 50;

export async function listBannedWords(
  filters: { q?: string; action?: BannedWordAction; category?: BannedWordCategory; locale?: Locale | "all" },
  page: number,
) {
  const where: Prisma.BannedWordWhereInput = {
    ...(filters.q ? { phrase: { contains: filters.q, mode: "insensitive" } } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.locale ? { locale: filters.locale === "all" ? null : filters.locale } : {}),
  };
  const [rows, total] = await Promise.all([
    db.bannedWord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { phrase: "asc" }],
      skip: (page - 1) * BANNED_WORDS_PAGE_SIZE,
      take: BANNED_WORDS_PAGE_SIZE,
    }),
    db.bannedWord.count({ where }),
  ]);
  return { rows, total, page };
}
export type AdminBannedWord = Awaited<ReturnType<typeof listBannedWords>>["rows"][number];

// ─── Email outbox ────────────────────────────────────────────

export const OUTBOX_PAGE_SIZE = 30;

export async function listOutbox(filters: { status?: EmailStatus; template?: string; to?: string }, page: number) {
  const where: Prisma.EmailOutboxWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.template ? { template: filters.template } : {}),
    ...(filters.to ? { to: { contains: filters.to, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.emailOutbox.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * OUTBOX_PAGE_SIZE,
      take: OUTBOX_PAGE_SIZE,
      select: { id: true, to: true, template: true, locale: true, subject: true, status: true, createdAt: true, sentAt: true, error: true },
    }),
    db.emailOutbox.count({ where }),
  ]);
  return { rows, total, page };
}

export async function outboxTemplates(): Promise<string[]> {
  const rows = await db.emailOutbox.findMany({ distinct: ["template"], select: { template: true }, orderBy: { template: "asc" }, take: 100 });
  return rows.map((r) => r.template);
}

export async function getOutboxEmail(id: string) {
  return db.emailOutbox.findUnique({ where: { id } });
}
