/**
 * Round 3 phase 5 hardening, against the local database (DATABASE_URL in .env):
 * - reviews-4: a host who switches a stay to a monthly rental (or a sale) cannot block the
 *   reviews of real stays: the booking was made as a stay, so it can still be reviewed.
 * - reviews-5: the daily repair of Listing.reviewCount / ratingSum (reconcileReviewCounters):
 *   counters that drifted from the visible reviews (a hard-deleted account cascades its reviews)
 *   are recounted; and the demo reseed never deletes an account that holds bookings, reviews or
 *   listings (releaseDemoPhone).
 * Creates its own users (fake @example.com addresses), listings and bookings with a unique prefix
 * and removes them afterwards. Emails are recorded, not sent. No review is seeded or invented:
 * the rows are test-only and deleted.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createTranslator } from "use-intl/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sealGuestPhone } from "@/lib/field-crypto";

process.env.TWILIO_ACCOUNT_SID = "";
process.env.RESEND_API_KEY = "";
process.env.HASH_SALT ||= "test-salt-reviews";
delete process.env.TELEGRAM_BOT_TOKEN;

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const root = namespace.split(".")[0];
    const file = path.join(process.cwd(), "messages", locale, `${root}.json`);
    return createTranslator({ locale, messages: { [root]: JSON.parse(fs.readFileSync(file, "utf8")) }, namespace });
  },
}));
vi.mock("@/lib/request", () => ({ getIpHash: async () => "test-ip" }));
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return { ...real, sendEmail: vi.fn(async () => ({ ok: true, delivery: "logged" as const })) };
});
vi.mock("@/lib/sms", () => ({ isSmsConfigured: () => false, sendSms: vi.fn(async () => ({ ok: true, delivered: false })) }));
vi.mock("@/lib/translate", () => ({ isTranslationEnabled: () => false, translateTextInto: vi.fn(async () => ({})) }));

const { db } = await import("@/lib/db");
const { Prisma } = await import("@/generated/prisma/client");
const { addDays, tbilisiToday } = await import("@/lib/booking/dates");
const service = await import("@/lib/reviews/service");
const { reconcileReviewCounters } = await import("@/lib/reviews/reconcile");
const { releaseDemoPhone } = await import("../../prisma/seed/users");

const prefix = `rvc${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { host: `${prefix}-host`, guest: `${prefix}-guest`, listing: "", empty: "" };
const today = tbilisiToday();
const dayDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TEXT = "A quiet, clean flat. The host met us at the door with a map of the area.";
let seq = 0;

function booking(listingId: string, guestUserId = ids.guest) {
  seq += 1;
  const checkOut = addDays(today, -2);
  return db.booking.create({
    data: {
      code: `${prefix}-${seq}`.toUpperCase(),
      listingId,
      guestUserId,
      hostUserId: ids.host,
      checkIn: dayDate(addDays(checkOut, -3)),
      checkOut: dayDate(checkOut),
      nights: 3,
      adults: 2,
      nightlyPrice: new Prisma.Decimal(55),
      subtotal: new Prisma.Decimal(165),
      total: new Prisma.Decimal(165),
      currency: "GEL",
      cancellationPolicy: "MODERATE",
      status: "COMPLETED",
      guestName: "Dana",
      ...sealGuestPhone("+995555990702"),
      locale: "en",
      rulesAcceptedAt: new Date(),
    },
  });
}

async function listing(title: string) {
  const row = await db.listing.create({
    data: { ownerId: ids.host, status: "LIVE", dealType: "SHORT_STAY", title, currency: "GEL", price: new Prisma.Decimal(55), pricePeriod: "NIGHT", publishedAt: new Date(), isDemo: false },
  });
  return row.id;
}

const counters = (id: string) => db.listing.findUniqueOrThrow({ where: { id }, select: { reviewCount: true, ratingSum: true } });

beforeAll(async () => {
  await db.user.createMany({
    data: [
      { id: ids.host, name: "Host Test", email: `${ids.host}@example.com` },
      { id: ids.guest, name: "Dana Levi", firstName: "Dana", email: `${ids.guest}@example.com`, locale: "en" },
    ],
  });
  ids.listing = await listing(`${prefix} flat`);
  ids.empty = await listing(`${prefix} no reviews`);
});

afterAll(async () => {
  await db.review.deleteMany({ where: { hostUserId: ids.host } });
  await db.booking.deleteMany({ where: { hostUserId: ids.host } });
  await db.listing.deleteMany({ where: { ownerId: ids.host } });
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
});

describe("a stay switched to a monthly rental or a sale (reviews-4)", () => {
  it("can still be reviewed by the guest of a real stay", async () => {
    const stay = await booking(ids.listing);
    await db.listing.update({ where: { id: ids.listing }, data: { dealType: "MONTHLY_RENT", pricePeriod: "MONTH" } });
    try {
      const review = await service.createReviewForBooking({
        guestId: ids.guest,
        bookingCode: stay.code,
        rating: 4,
        quick: { cleanliness: null, accuracy: null, checkIn: null, communication: null, location: null, value: null },
        text: TEXT,
        pageLocale: "en",
      });
      expect(review.id).toBeTruthy();
      expect(await counters(ids.listing)).toEqual({ reviewCount: 1, ratingSum: 4 });
    } finally {
      await db.listing.update({ where: { id: ids.listing }, data: { dealType: "SHORT_STAY", pricePeriod: "NIGHT" } });
    }
  });
});

describe("the daily repair of the review counters (reviews-5)", () => {
  it("recounts listings whose counters drifted from their visible reviews", async () => {
    // A cascade (a hard-deleted account) took reviews away without the counters.
    await db.$executeRaw`UPDATE "Listing" SET "reviewCount" = 3, "ratingSum" = 14 WHERE "id" = ${ids.listing}`;
    await db.$executeRaw`UPDATE "Listing" SET "reviewCount" = 2, "ratingSum" = 9 WHERE "id" = ${ids.empty}`;
    const result = await reconcileReviewCounters();
    expect(result.fixed).toBeGreaterThanOrEqual(2);
    expect(await counters(ids.listing)).toEqual({ reviewCount: 1, ratingSum: 4 });
    expect(await counters(ids.empty)).toEqual({ reviewCount: 0, ratingSum: 0 });
  });
});

describe("the demo reseed and a real account holding a demo number (reviews-5)", () => {
  const PHONE = "+995555990799";

  it("detaches the number from an account with bookings, never deletes it", async () => {
    const holder = `${prefix}-holder`;
    await db.user.create({ data: { id: holder, name: "Phone User", email: `${holder}@phone.bayit.invalid`, phoneNumber: PHONE, phoneNumberVerified: true } });
    await booking(ids.listing, holder);
    await releaseDemoPhone(db, `${prefix}-demo`, PHONE);
    expect(await db.user.findUnique({ where: { id: holder }, select: { phoneNumber: true } })).toEqual({ phoneNumber: null });
  });

  it("still removes an empty account created by logging in with the number", async () => {
    const holder = `${prefix}-empty-holder`;
    await db.user.create({ data: { id: holder, name: "Phone User", email: `${holder}@phone.bayit.invalid`, phoneNumber: PHONE, phoneNumberVerified: true } });
    await releaseDemoPhone(db, `${prefix}-demo`, PHONE);
    expect(await db.user.findUnique({ where: { id: holder } })).toBeNull();
  });
});
