/**
 * translateListing against the local database (DATABASE_URL in .env) with a fake translation
 * service: one request for every language, emoji out of machine titles, owner-written versions
 * kept, stale rows removed when translation fails, and the deduplicated re-translation of
 * autosaved live listings. Creates its own user, city and listing and removes them afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppLocale } from "@/config/site";

vi.mock("server-only", () => ({}));
const afterQueue: (() => Promise<unknown>)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => Promise<unknown>) => afterQueue.push(fn) }));

type Call = { texts: readonly string[]; targets: readonly AppLocale[]; from?: AppLocale };
const calls: Call[] = [];
const fake: { fail: boolean } = { fail: false };
vi.mock("@/lib/translate/registry", () => ({
  activeTranslationProvider: () => ({
    id: "azure",
    async translate(texts: readonly string[], targets: readonly AppLocale[], from?: AppLocale) {
      calls.push({ texts, targets, from });
      if (fake.fail) return null;
      return new Map(targets.map((to) => [to, texts.map((text) => ({ text: text ? `[${to}] ${text} 🎉` : "" }))]));
    },
  }),
}));

const { db } = await import("@/lib/db");
const { translateListing, scheduleListingTranslation } = await import("./translate");

const prefix = `tr${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { user: "", city: "", listing: "" };

beforeAll(async () => {
  const user = await db.user.create({ data: { id: `${prefix}-owner`, name: "Owner", email: `${prefix}@example.com` } });
  ids.user = user.id;
  const city = await db.city.create({
    data: { slug: `${prefix}-city`, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.7, lng: 44.8 },
  });
  ids.city = city.id;
  const listing = await db.listing.create({
    data: {
      ownerId: user.id,
      status: "LIVE",
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
      cityId: city.id,
      originalLocale: "ka",
      title: "ბინა ზღვასთან",
      description: "ლამაზი ბინა.",
    },
  });
  ids.listing = listing.id;
});

beforeEach(() => {
  calls.length = 0;
  fake.fail = false;
  afterQueue.length = 0;
});

afterAll(async () => {
  await db.listing.deleteMany({ where: { id: ids.listing } });
  await db.city.deleteMany({ where: { id: ids.city } });
  await db.user.deleteMany({ where: { id: ids.user } });
});

const rowsOf = () => db.listingTranslation.findMany({ where: { listingId: ids.listing }, orderBy: { locale: "asc" } });

describe("translateListing", () => {
  it("translates title and description into the four other languages in one request, without emoji in titles", async () => {
    const result = await translateListing(ids.listing);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ texts: ["ბინა ზღვასთან", "ლამაზი ბინა."], from: "ka" });
    expect([...calls[0].targets].sort()).toEqual(["ar", "en", "he", "ru"]);
    expect(result.translated.sort()).toEqual(["ar", "en", "he", "ru"]);
    const he = (await rowsOf()).find((row) => row.locale === "he")!;
    expect(he).toMatchObject({ title: "[he] ბინა ზღვასთან", description: "[he] ლამაზი ბინა. 🎉", isAuto: true });
  });

  it("does nothing while the original is unchanged, and keeps versions the owner wrote", async () => {
    await translateListing(ids.listing);
    expect(calls).toHaveLength(0);
    await db.listingTranslation.update({
      where: { listingId_locale: { listingId: ids.listing, locale: "en" } },
      data: { title: "Flat by the sea", isAuto: false, editedByOwner: true },
    });
    await db.listing.update({ where: { id: ids.listing }, data: { title: "ბინა ზღვის პირას" } });
    const result = await translateListing(ids.listing);
    expect(calls).toHaveLength(1);
    expect([...calls[0].targets].sort()).toEqual(["ar", "he", "ru"]);
    expect(result.keptOwnerEdits).toEqual(["en"]);
    expect((await rowsOf()).find((row) => row.locale === "en")?.title).toBe("Flat by the sea");
  });

  it("removes outdated automatic rows when the service fails (the page then shows the original)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await db.listing.update({ where: { id: ids.listing }, data: { description: "ახალი ტექსტი." } });
    fake.fail = true;
    await translateListing(ids.listing);
    const locales = (await rowsOf()).map((row) => row.locale).sort();
    expect(locales).toEqual(["en", "ka"]);
  });
});

describe("scheduleListingTranslation (autosaved edits of live listings)", () => {
  it("runs after the response, once, and skips when a newer edit came in", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const stamp = new Date();
      await db.listing.update({ where: { id: ids.listing }, data: { contentUpdatedAt: stamp, title: "ბინა #1" } });
      scheduleListingTranslation(ids.listing, stamp);
      expect(afterQueue).toHaveLength(1);
      // A newer autosave arrived before the first one settled.
      const newer = new Date(stamp.getTime() + 1000);
      await db.listing.update({ where: { id: ids.listing }, data: { contentUpdatedAt: newer, title: "ბინა #2" } });
      scheduleListingTranslation(ids.listing, newer);
      const runs = afterQueue.map((fn) => fn());
      await vi.advanceTimersByTimeAsync(5000);
      await Promise.all(runs);
      expect(calls).toHaveLength(1);
      expect(calls[0].texts[0]).toBe("ბინა #2");
    } finally {
      vi.useRealTimers();
    }
  });
});
