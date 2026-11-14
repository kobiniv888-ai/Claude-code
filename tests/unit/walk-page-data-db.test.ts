/**
 * Founder's answers (2) and (3), 9 Nov 2026 (SECURITY_REPORT 6.d) against the local database:
 * what the listing page, the cards (search, map list, city and owner pages, shared lists) and the
 * compare page get from the server.
 *
 * A test listing in Mestia (a ski town) carries exact walking times computed from its pin: the
 * lifts 12 minutes, the synagogue 7 (column and Listing.nearby, 520 m), a legacy Chabad house 4
 * (chabadWalkMin 13 and nearby.chabad), and around the PUBLIC map point the stop 8 and the
 * supermarket 3. The page data must hold:
 * - only rounded "up to N" values (multiples of 5): lifts 15, synagogue 10, stop 10;
 * - no meters, no exact minute (12, 7, 8, 3), no Chabad house (answer (2));
 * - at most 3 walking times (answer (3)): the supermarket, 4th in PUBLIC_WALK_ORDER, is left out;
 * - the cards: a subset of the page's (lifts and synagogue).
 *
 * This is the server half of the check; tests/e2e/data-exposure.spec.ts fetches the same values
 * as HTML and RSC page data from a production build. Creates its own user and listing and deletes
 * them afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sealAddress, sealPin } from "@/lib/field-crypto";

const viewer = vi.hoisted(() => ({ id: "" }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn, updateTag: () => {} }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "he", getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/settings", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/settings")>();
  return { ...real, getSettings: async () => ({ ...(await real.getSettings()), demoDataVisible: false }) };
});
vi.mock("@/lib/auth/session", () => ({
  hasStaffRights: () => false,
  requireUserForAction: async () => ({ id: viewer.id, role: "USER" }),
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...real, assertRateLimit: async () => {} };
});

const { db } = await import("@/lib/db");
const { getListingPage } = await import("@/lib/listing-page/load");
const { getListingCards } = await import("@/lib/listing/queries");
const { listingMapSelect } = await import("@/lib/listing/mappers");
const { getCompareItems } = await import("@/lib/account/compare-actions");
const { MAX_PUBLIC_WALKS, countPublicWalks } = await import("@/lib/geo/public-walk");

const prefix = `wpd${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { host: `${prefix}-host`, viewer: `${prefix}-viewer`, listing: "", publicId: 0 };
const EXACT_MINUTES = [12, 7, 8, 3, 4, 13];

/**
 * Every walking value a payload holds that is not public: a meters field, a Chabad entry, an
 * exact minute under a walk key, a minute that is not a multiple of 5.
 */
function exactWalkValues(payload: unknown): string[] {
  const problems: string[] = [];
  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) return value.forEach((item, i) => visit(item, `${path}[${i}]`));
    if (!value || typeof value !== "object") return;
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      const here = `${path}.${key}`;
      if (key === "meters") problems.push(`${here} (meters)`);
      if (/chabad/i.test(key) && inner !== null && inner !== undefined) problems.push(`${here} (a Chabad walk)`);
      const isWalkKey = /WalkMin$|WalkMinutes$/.test(key) || (key === "minutes" && /\.(synagogue|transport|supermarket|chabad|walk|places\[\d+\])$/.test(path));
      if (isWalkKey && typeof inner === "number") {
        if (inner % 5 !== 0) problems.push(`${here}=${inner} (not rounded)`);
        if (EXACT_MINUTES.includes(inner)) problems.push(`${here}=${inner} (exact)`);
      }
      visit(inner, here);
    }
  };
  visit(payload, "$");
  return problems;
}

beforeAll(async () => {
  const stamp = `${Date.now() % 100_000}`.padStart(5, "0");
  const city = await db.city.findUniqueOrThrow({ where: { slug: "mestia" }, select: { id: true, lat: true, lng: true } });
  await db.user.create({
    data: { id: ids.host, name: "Walk Host", email: `${ids.host}@example.com`, phoneNumber: `+99559${stamp}1`, phoneNumberVerified: true, welcomePledgeVersion: 99 },
  });
  await db.user.create({ data: { id: ids.viewer, name: "Walk Viewer", email: `${ids.viewer}@example.com` } });
  viewer.id = ids.viewer;
  const listing = await db.listing.create({
    data: {
      ownerId: ids.host,
      status: "LIVE",
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
      pricePeriod: "NIGHT",
      price: 80,
      currency: "USD",
      cityId: city.id,
      pinEnc: sealPin({ lat: Number(city.lat) + 0.001, lng: Number(city.lng) + 0.001 }),
      addressEnc: sealAddress(`${prefix} Walk Lane 3, Mestia`),
      approxLat: Number(city.lat),
      approxLng: Number(city.lng),
      originalLocale: "en",
      title: "Walk page data flat",
      description: "A test listing for the walking-time page data.",
      synagogueWalkMin: 7,
      chabadWalkMin: 13,
      seaWalkMinutes: null,
      liftWalkMinutes: 12,
      nearby: {
        synagogue: { id: `${prefix}-synagogue`, name: { he: `${prefix} בית כנסת`, en: `${prefix} Synagogue` }, minutes: 7, meters: 520 },
        chabad: { id: `${prefix}-chabad`, name: { he: "בית חב״ד", en: `${prefix} Chabad House` }, minutes: 4, meters: 260 },
        supermarket: { minutes: 1, meters: 60, name: `${prefix} Pin Market` },
        transport: { kind: "tram", minutes: 2, meters: 110, name: `${prefix} Pin Stop` },
        public: {
          supermarket: { minutes: 3, meters: 210, name: `${prefix} Market` },
          transport: { kind: "bus", minutes: 8, meters: 590, name: `${prefix} Stop` },
        },
        airport: { code: "TBS", km: 23.4 },
      },
    },
    select: { id: true, publicId: true },
  });
  ids.listing = listing.id;
  ids.publicId = listing.publicId;
});

afterAll(async () => {
  if (ids.listing) await db.listing.deleteMany({ where: { id: ids.listing } });
  await db.user.deleteMany({ where: { id: { in: [ids.host, ids.viewer] } } });
});

describe("walking times in the page data (answers (2) and (3), 6.d)", () => {
  it("the listing page gets only rounded values, no meters, no Chabad house, at most 3 walks", async () => {
    const loaded = await getListingPage(ids.publicId, "he");
    expect(loaded).not.toBeNull();
    const data = loaded!.data;
    expect(exactWalkValues(data)).toEqual([]);
    const text = JSON.stringify(data);
    expect(text).not.toContain("Pin Market");
    expect(text).not.toContain("Pin Stop");
    expect(text).not.toContain("Chabad House");
    expect(text).not.toContain(`${prefix} Market`); // the 4th walk (supermarket) does not fit
    expect(data.liftWalkMinutes).toBe(15);
    expect(data.seaWalkMinutes).toBeNull();
    expect(data.synagogueWalkMin).toBe(10);
    expect(data.nearby.synagogue?.minutes).toBe(10);
    expect(data.nearby.transport).toMatchObject({ minutes: 10, kind: "bus" });
    expect(data.nearby.supermarket).toBeUndefined();
    expect(data.nearby.airport).toEqual({ code: "TBS", km: 23 });
    expect(countPublicWalks({ synagogueWalkMin: data.synagogueWalkMin, seaWalkMinutes: data.seaWalkMinutes ?? null, liftWalkMinutes: data.liftWalkMinutes ?? null, nearby: data.nearby })).toBeLessThanOrEqual(MAX_PUBLIC_WALKS);
  });

  it("a card (search, map list, city, owner and shared-list pages) gets a subset of the page's walks, rounded", async () => {
    const cards = await getListingCards([ids.publicId], { locale: "he", currency: "USD", rates: { USD: 1 } as never });
    expect(cards).toHaveLength(1);
    expect(exactWalkValues(cards)).toEqual([]);
    const card = cards[0]!;
    expect(card.badges.liftWalkMinutes).toBe(15);
    expect(card.badges.seaWalkMinutes).toBeNull();
    expect(card.badges.synagogueWalkMin).toBe(10);
    expect(JSON.stringify(card)).not.toMatch(/chabad/i);
  });

  it("a map marker (search map) carries no walking value at all", () => {
    expect(Object.keys(listingMapSelect("he")).filter((key) => /walk|nearby|chabad/i.test(key))).toEqual([]);
  });

  it("the compare page's action answer gets the same rounded walks and no Chabad row", async () => {
    const result = await getCompareItems([ids.publicId]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(exactWalkValues(result.data)).toEqual([]);
    expect(JSON.stringify(result.data)).not.toMatch(/chabad/i);
    expect(result.data[0]!.jewish.synagogueWalkMin).toBe(10);
  });
});
