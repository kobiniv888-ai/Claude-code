/**
 * The copied-description check (SECURITY_REPORT 14.1.f, S2 review TS-13) against the local
 * database: a description copied from the text another listing's page shows in another language
 * (its machine translation) is found, like a copy of the original. Fake rows, removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { findCopiedDescriptions } = await import("@/lib/risk/review-warnings");

const prefix = `cpt${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { a: `${prefix}-a`, b: `${prefix}-b`, city: "", original: "", copy: "" };
const ENGLISH =
  "A bright two bedroom flat on the fourth floor with a large balcony facing the sea, a quiet street behind the boulevard, a full kitchen with an oven, a washing machine and fast internet for remote work.";

beforeAll(async () => {
  await db.user.createMany({ data: [ids.a, ids.b].map((id) => ({ id, name: `${id} Name`, email: `${id}@example.com` })) });
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names: { he: "ע", en: "C", ru: "Г", ar: "م", ka: "ქ" }, searchText: "c", lat: 41.6, lng: 41.6 } });
  ids.city = city.id;
  const original = await db.listing.create({
    data: { ownerId: ids.a, status: "LIVE", dealType: "SHORT_STAY", cityId: city.id, title: `${prefix} original`, originalLocale: "he", description: "דירה מוארת עם שני חדרי שינה בקומה הרביעית, מרפסת גדולה מול הים ורחוב שקט." },
  });
  await db.listingTranslation.create({ data: { listingId: original.id, locale: "en", title: "Bright flat", description: ENGLISH, isAuto: true } });
  ids.original = original.id;
  const copy = await db.listing.create({ data: { ownerId: ids.b, status: "IN_REVIEW", dealType: "SHORT_STAY", cityId: city.id, title: `${prefix} copy`, originalLocale: "en", description: ENGLISH } });
  ids.copy = copy.id;
});

afterAll(async () => {
  await db.listing.deleteMany({ where: { ownerId: { in: [ids.a, ids.b] } } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { in: [ids.a, ids.b] } } });
});

describe("findCopiedDescriptions compares translations too (TS-13)", () => {
  it("finds a description copied from another listing's English translation", async () => {
    const matches = await findCopiedDescriptions({ id: ids.copy, ownerId: ids.b, cityId: ids.city, isDemo: false, description: ENGLISH });
    expect(matches.map((m) => m.listingId)).toContain(ids.original);
    expect(matches.find((m) => m.listingId === ids.original)?.percent).toBe(100);
  });
});
