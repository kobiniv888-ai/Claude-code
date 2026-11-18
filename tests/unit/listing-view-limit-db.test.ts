/**
 * The listing page's own rate limit against bulk copying (SECURITY_REPORT 14.5.d), against the real
 * RateLimit table: generous for a person (LISTING_VIEW_LIMIT per IP in 10 minutes on a real site),
 * refused beyond it, and a broken store never takes the public page down (the one fail-open limit).
 * The request's IP fingerprint is a stand-in; the rows are removed afterwards.
 */
import "dotenv/config";
import { afterAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ ip: `view-${Math.random().toString(36).slice(2)}`, broken: false }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/request", () => ({ getIpHash: async () => state.ip, getClientIp: async () => "203.0.113.10" }));

const { db } = await import("@/lib/db");
const rateLimit = await import("@/lib/rate-limit");
const { listingViewAllowed, listingViewLimit, LISTING_VIEW_LIMIT, DEV_LISTING_VIEW_LIMIT } = await import("@/lib/listing-page/view-limit");

const startedAt = new Date();

afterAll(async () => {
  // The test deletes its own window row; here only the "rate_limited" event the refused view
  // records. Other rows in the table are left alone.
  await db.securityEvent
    .deleteMany({ where: { type: "rate_limited", createdAt: { gte: startedAt }, meta: { path: ["scope"], equals: "listing:view" } } })
    .catch(() => undefined);
  await db.$disconnect();
});

describe("listing page views (14.5.d)", () => {
  it("is generous on a real site and looser on a development site", () => {
    expect(listingViewLimit({ SITE_ENV: "production" })).toEqual(LISTING_VIEW_LIMIT);
    expect(listingViewLimit({ SITE_ENV: "staging" })).toEqual(LISTING_VIEW_LIMIT);
    expect(listingViewLimit({ SITE_ENV: "development" })).toEqual(DEV_LISTING_VIEW_LIMIT);
    expect(LISTING_VIEW_LIMIT.limit).toBeGreaterThanOrEqual(200);
  });

  it("refuses an address past the limit, and shows the page when the store is broken", async () => {
    const previous = process.env.SITE_ENV;
    process.env.SITE_ENV = "production";
    try {
      // Fill the window to the limit straight in the table (the key the helper uses).
      const keys = (await db.rateLimit.findMany({ where: { key: { startsWith: "listing:view:ip:" } }, select: { key: true } })).length;
      expect(await listingViewAllowed()).toBe(true);
      const row = await db.rateLimit.findFirstOrThrow({ where: { key: { startsWith: "listing:view:ip:" } }, orderBy: { resetAt: "desc" } });
      expect((await db.rateLimit.findMany({ where: { key: { startsWith: "listing:view:ip:" } } })).length).toBeGreaterThanOrEqual(keys);
      await db.rateLimit.update({ where: { key: row.key }, data: { count: LISTING_VIEW_LIMIT.limit } });
      expect(await listingViewAllowed()).toBe(false);
      // The refusal's "rate_limited" event is written in the background: wait for it, so the
      // clean-up below finds it (it was left behind otherwise).
      await vi.waitFor(async () => {
        const events = await db.securityEvent.count({ where: { type: "rate_limited", createdAt: { gte: startedAt }, meta: { path: ["scope"], equals: "listing:view" } } });
        expect(events).toBeGreaterThan(0);
      });
      await db.rateLimit.delete({ where: { key: row.key } });

      const spy = vi.spyOn(rateLimit, "rateLimitByIp").mockResolvedValue({ ok: false, failed: true, remaining: 0, resetAt: new Date() });
      expect(await listingViewAllowed()).toBe(true);
      spy.mockRestore();
    } finally {
      process.env.SITE_ENV = previous;
    }
  });
});
