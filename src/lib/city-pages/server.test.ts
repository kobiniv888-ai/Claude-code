/**
 * City pages against the local database (DATABASE_URL in .env): which listings count for a page
 * and for indexing. Creates its own owners, city and listings with a unique prefix and removes
 * them afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { clearPlacesCache } = await import("@/lib/places");
const { getSettings } = await import("@/lib/settings");
const { findCityPageCity, getCityTypeCounts, listCityPages } = await import("./server");

const prefix = `cp${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { city: "", owner: "", suspended: "", listings: [] as string[] };
const slug = `${prefix}-city`;

async function makeUser(name: string, n: number, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  const id = `${prefix}-${name}`;
  const digits = `${(Date.now() + n * 7919) % 10_000_000}`.padStart(7, "0");
  await db.user.create({
    data: { id, name, firstName: name, email: `${id}@example.com`, phoneNumber: `+99559${digits}`, phoneNumberVerified: true, locale: "en", status },
  });
  return id;
}

type Extra = {
  dealType?: "SHORT_STAY" | "MONTHLY_RENT" | "SALE" | "HOTEL_ROOM";
  status?: "LIVE" | "IN_REVIEW" | "PAUSED";
  isDemo?: boolean;
  ownerId?: string;
  expiresAt?: Date | null;
  deletedAt?: Date | null;
  publishedAt?: Date | null;
};

async function listing(extra: Extra = {}) {
  const row = await db.listing.create({
    data: {
      ownerId: extra.ownerId ?? ids.owner,
      status: extra.status ?? "LIVE",
      dealType: extra.dealType ?? "SHORT_STAY",
      propertyType: "APARTMENT",
      pricePeriod: "NIGHT",
      price: 100,
      currency: "GEL",
      cityId: ids.city,
      lat: 41.6,
      lng: 41.6,
      originalLocale: "en",
      title: `${prefix} city page listing`,
      description: "A test listing.",
      isDemo: extra.isDemo ?? false,
      expiresAt: extra.expiresAt ?? null,
      deletedAt: extra.deletedAt ?? null,
      publishedAt: extra.publishedAt ?? new Date("2026-10-01T00:00:00Z"),
    },
  });
  ids.listings.push(row.id);
  return row;
}

beforeAll(async () => {
  const city = await db.city.create({
    data: { slug, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.6, lng: 41.6, sortOrder: 999 },
  });
  ids.city = city.id;
  ids.owner = await makeUser("owner", 1);
  ids.suspended = await makeUser("suspended", 2, "SUSPENDED");
  clearPlacesCache();

  // Short stays: 3 real live ones count; these don't: a demo one, one in review, a paused one,
  // an expired one, a deleted one and one of a suspended owner.
  await listing();
  await listing();
  await listing({ publishedAt: new Date("2026-11-05T00:00:00Z") });
  await listing({ isDemo: true });
  await listing({ status: "IN_REVIEW" });
  await listing({ status: "PAUSED" });
  await listing({ expiresAt: new Date("2020-01-01T00:00:00Z") });
  await listing({ deletedAt: new Date() });
  await listing({ ownerId: ids.suspended });
  // Monthly: two real ones (not enough). Hotels: demo only. Sales: none.
  await listing({ dealType: "MONTHLY_RENT" });
  await listing({ dealType: "MONTHLY_RENT" });
  await listing({ dealType: "HOTEL_ROOM", isDemo: true });
  await listing({ dealType: "HOTEL_ROOM", isDemo: true });
  await listing({ dealType: "HOTEL_ROOM", isDemo: true });
});

afterAll(async () => {
  await db.listing.deleteMany({ where: { id: { in: ids.listings } } });
  await db.user.deleteMany({ where: { id: { in: [ids.owner, ids.suspended].filter(Boolean) } } });
  await db.city.deleteMany({ where: { id: ids.city } });
  clearPlacesCache();
});

describe("city pages (database)", () => {
  it("finds an active city by its slug and nothing else", async () => {
    expect((await findCityPageCity(slug))?.id).toBe(ids.city);
    expect(await findCityPageCity(`${slug}-nope`)).toBeNull();
    expect(await findCityPageCity(slug.toUpperCase())).toBeNull();
    expect(await findCityPageCity("../admin")).toBeNull();
  });

  it("listCityPages counts only live, public, non-demo listings and indexes from 3", async () => {
    const pages = (await listCityPages()).filter((page) => page.citySlug === slug);
    expect(pages.map((page) => page.type)).toEqual(["short-stays", "monthly", "sale", "hotels"]);
    const byType = Object.fromEntries(pages.map((page) => [page.type, page]));
    expect(byType["short-stays"]).toMatchObject({ realCount: 3, indexable: true });
    expect(byType.monthly).toMatchObject({ realCount: 2, indexable: false });
    expect(byType.sale).toMatchObject({ realCount: 0, indexable: false, updatedAt: null });
    // Three demo hotels never make a page indexable.
    expect(byType.hotels).toMatchObject({ realCount: 0, indexable: false, updatedAt: null });
    // The newest change or publication of the counted listings.
    expect(byType["short-stays"].updatedAt).toBeInstanceOf(Date);
    expect(byType["short-stays"].updatedAt!.getTime()).toBeGreaterThanOrEqual(new Date("2026-11-05T00:00:00Z").getTime());
  });

  it("the page's counts show demo listings only while the demo data is on, never as real", async () => {
    const { demoDataVisible } = await getSettings();
    const counts = await getCityTypeCounts(ids.city);
    expect(counts["short-stays"]).toEqual({ count: demoDataVisible ? 4 : 3, realCount: 3 });
    expect(counts.monthly).toEqual({ count: 2, realCount: 2 });
    expect(counts.hotels).toEqual({ count: demoDataVisible ? 3 : 0, realCount: 0 });
    expect(counts.sale).toEqual({ count: 0, realCount: 0 });
  });

  it("an inactive city has no pages", async () => {
    await db.city.update({ where: { id: ids.city }, data: { active: false } });
    clearPlacesCache();
    try {
      expect(await findCityPageCity(slug)).toBeNull();
      expect((await listCityPages()).some((page) => page.citySlug === slug)).toBe(false);
    } finally {
      await db.city.update({ where: { id: ids.city }, data: { active: true } });
      clearPlacesCache();
    }
  });
});
