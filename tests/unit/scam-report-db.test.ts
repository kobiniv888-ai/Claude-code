/**
 * The scam report (/help/report-scam, SECURITY_REPORT 14.2.c) against the local database, for the
 * S2 review TS-9: parallel submits from one account give ONE open report (the check and the insert
 * are serialised per reporter), and a booking code of another listing is never attached to the
 * report. The session, CAPTCHA, rate limits, translations, the founder email and auto-hide are
 * stand-ins; the queries and the transaction are the real code. Fake @example.com rows, removed
 * afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sealGuestPhone } from "@/lib/field-crypto";

const state = vi.hoisted(() => ({ user: null as null | { id: string; twoFactorVerified: boolean } }));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => undefined }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/auth/hooks", () => ({ linkDevice: async () => undefined }));
vi.mock("@/lib/turnstile", () => ({ assertTurnstile: async () => undefined }));
vi.mock("@/lib/rate-limit", () => ({ assertRateLimit: async () => undefined, assertRateLimitByIp: async () => undefined }));
vi.mock("@/lib/listing/lifecycle", () => ({ applyReport: async () => undefined }));
vi.mock("@/lib/reports/notify", () => ({ notifyFounderOfReport: async () => undefined }));
vi.mock("@/lib/tickets/server", () => ({ createTicketRecord: async () => ({ id: "t", number: 1 }), sendTicketCreatedEmail: async () => undefined }));

const { db } = await import("@/lib/db");
const { Prisma } = await import("@/generated/prisma/client");
const { createScamReport } = await import("@/lib/reports/scam-actions");

const prefix = `scm${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { host: `${prefix}-host`, guest: `${prefix}-guest`, city: "", x: "", y: "", xPublic: 0, bookingY: "" };

beforeAll(async () => {
  await db.user.createMany({ data: [ids.host, ids.guest].map((id) => ({ id, name: `${id} Name`, email: `${id}@example.com` })) });
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names: { he: "ע", en: "C", ru: "Г", ar: "م", ka: "ქ" }, searchText: "c", lat: 41.6, lng: 41.6 } });
  ids.city = city.id;
  const x = await db.listing.create({ data: { ownerId: ids.host, status: "LIVE", dealType: "SHORT_STAY", cityId: city.id, title: `${prefix} x` } });
  const y = await db.listing.create({ data: { ownerId: ids.host, status: "LIVE", dealType: "SHORT_STAY", cityId: city.id, title: `${prefix} y` } });
  ids.x = x.id;
  ids.y = y.id;
  ids.xPublic = x.publicId;
  const booking = await db.booking.create({
    data: {
      code: `${prefix}-y`.toUpperCase(),
      listingId: y.id,
      guestUserId: ids.guest,
      hostUserId: ids.host,
      checkIn: new Date("2026-12-04T00:00:00Z"),
      checkOut: new Date("2026-12-06T00:00:00Z"),
      nights: 2,
      adults: 1,
      nightlyPrice: new Prisma.Decimal(50),
      subtotal: new Prisma.Decimal(100),
      total: new Prisma.Decimal(100),
      currency: "USD",
      cancellationPolicy: "MODERATE",
      guestName: "Guest",
      ...sealGuestPhone("+995500000009"),
      locale: "en",
      rulesAcceptedAt: new Date(),
    },
  });
  ids.bookingY = booking.code;
  state.user = { id: ids.guest, twoFactorVerified: true };
});

afterAll(async () => {
  await db.report.deleteMany({ where: { listingId: { in: [ids.x, ids.y] } } });
  await db.booking.deleteMany({ where: { hostUserId: ids.host } });
  await db.listing.deleteMany({ where: { ownerId: ids.host } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { in: [ids.host, ids.guest] } } });
});

const input = (extra: Record<string, unknown> = {}) => ({
  kind: "asked_to_pay",
  listing: ids.xPublic,
  details: "The host asked me to pay a deposit by card before arrival.",
  website: "",
  locale: "en",
  ...extra,
});

describe("createScamReport (S2 review TS-9)", () => {
  it("gives one open report for three parallel submits, without a booking of another listing", async () => {
    const results = await Promise.all([1, 2, 3].map(() => createScamReport(input({ booking: ids.bookingY }))));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => (r as { error: string }).error)).toEqual(["already_reported", "already_reported"]);
    const reports = await db.report.findMany({ where: { listingId: ids.x, reporterId: ids.guest } });
    expect(reports).toHaveLength(1);
    expect(reports[0].bookingId).toBeNull();
    expect(reports[0].details).not.toContain(ids.bookingY);
  });

  it("attaches the guest's booking when it is of the reported listing", async () => {
    const result = await createScamReport(input({ listing: null, booking: ids.bookingY }));
    expect(result.ok).toBe(true);
    const report = await db.report.findFirstOrThrow({ where: { listingId: ids.y, reporterId: ids.guest } });
    expect(report.bookingId).not.toBeNull();
  });
});
