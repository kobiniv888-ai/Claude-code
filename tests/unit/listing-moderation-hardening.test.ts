/**
 * Phase 3 hardening of the listing lifecycle against the local database (DATABASE_URL in .env):
 *
 * - approve and restore put a listing on the site only as the moderator saw it: an edit saved
 *   while waiting (auto-save) or while hidden runs the automatic checks again first, and a stale
 *   page is refused ("content_changed");
 * - a live listing's auto-saved edit is checked at once even when the publishing requirements no
 *   longer hold (a cleared price, an old pledge): a seeded BLOCK phrase takes it off the site;
 * - banning a host leaves HIDDEN listings HIDDEN (only a moderator restores them), so after a
 *   reactivation the owner can't turn them back on.
 *
 * The session, emails and founder alerts are stand-ins; everything else is the real code. Rows use
 * fake @example.com addresses and are removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as null | { id: string; role: string },
  staff: null as null | { id: string; role: "ADMIN" | "MODERATOR" },
  emails: [] as { to: string; template: string }[],
  founder: [] as { id: string; why: string[] }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => undefined,
}));
vi.mock("@/lib/auth/session", async () => {
  const { can } = await import("@/lib/auth/permissions");
  const { AppError } = await import("@/lib/errors");
  return {
    requireUserForAction: async () => {
      if (!state.user) throw new AppError("auth_required", "Sign-in required", { status: 401 });
      return state.user;
    },
    requireStaffForAction: async (permission: Parameters<typeof can>[1]) => {
      if (!state.staff || !can(state.staff.role, permission)) throw new AppError("forbidden", "Forbidden", { status: 403 });
      return state.staff;
    },
  };
});
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: async (input: { to: string; template: string }) => {
    state.emails.push({ to: input.to, template: input.template });
    return { ok: true, delivery: "logged" };
  },
}));
vi.mock("@/lib/alerts/founder-admin", () => ({
  notifyFounderListingInReview: async (id: string, why: string[]) => void state.founder.push({ id, why }),
}));
vi.mock("@/lib/alerts/listing-decision", () => ({ notifyListingDecision: async () => ({ email: true, telegram: false, push: false }) }));
vi.mock("@/lib/admin/server/common", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/server/common")>()),
  userReasonText: async (code: string, _locale: string, note?: string | null) => ({ reasonText: `reason:${code}`, note: note ?? null }),
}));

const { db } = await import("@/lib/db");
const lifecycle = await import("@/lib/listing/lifecycle");
const { approveListingAction } = await import("@/lib/admin/actions/moderation");
const { banUser, reactivateUser } = await import("@/lib/admin/server/user-moderation");
const { updateDraft } = await import("@/lib/wizard/actions");

const prefix = `p3l${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const id = (name: string) => `${prefix}-${name}`;
const users = { admin: id("admin"), owner: id("owner"), banned: id("banned") };
/** A BLOCK phrase seeded by `npm run db:seed` (Admin → Banned words). */
const BLOCK_TEXT = "A quiet flat near the old town. I will mail you the keys after the deposit.";
const CLEAN_TEXT = "A quiet flat near the old town, five minutes from the synagogue.";
let cityId = "";
const DAY = 86_400_000;

async function listing(ownerId: string, status: string, extra: Record<string, unknown> = {}) {
  const row = await db.listing.create({
    data: {
      ownerId,
      status,
      dealType: "SHORT_STAY",
      cityId,
      title: `${prefix} flat`,
      description: CLEAN_TEXT,
      originalLocale: "en",
      price: 80,
      currency: "USD",
      ...extra,
    } as Parameters<typeof db.listing.create>[0]["data"],
  });
  return row.id;
}

/** What the wizard's auto-save writes: the new text and a new content version. */
async function autoSave(listingId: string, data: Record<string, unknown>) {
  await db.listing.update({ where: { id: listingId }, data: { ...data, contentUpdatedAt: new Date() } });
}

const reasonCodes = (value: unknown) => (Array.isArray(value) ? value.map((r) => (r as { code: string }).code) : []);

beforeAll(async () => {
  await db.user.createMany({
    data: Object.entries(users).map(([name, userId]) => ({
      id: userId,
      name: `${name} Test`,
      email: `${userId}@example.com`,
      role: name === "admin" ? "ADMIN" : "USER",
      locale: "en",
      phoneNumber: name === "owner" ? "+995555000111" : null,
      phoneNumberVerified: name === "owner",
    })),
  });
  const city = await db.city.create({
    data: { slug: id("city"), names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.6, lng: 41.6 },
  });
  cityId = city.id;
});

afterAll(async () => {
  const ids = Object.values(users);
  const listingIds = (await db.listing.findMany({ where: { ownerId: { in: ids } }, select: { id: true } })).map((l) => l.id);
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: [...ids, ...listingIds] } }] } });
  await db.rateLimit.deleteMany({ where: { OR: ids.map((userId) => ({ key: { contains: userId } })) } });
  await db.priceChange.deleteMany({ where: { listingId: { in: listingIds } } });
  await db.listing.deleteMany({ where: { id: { in: listingIds } } });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
});

beforeEach(() => {
  state.user = null;
  state.staff = null;
  state.emails.length = 0;
  state.founder.length = 0;
});

describe("approve and restore go live as the moderator saw it", () => {
  it("an edit auto-saved while waiting runs the checks again: a blocked phrase is shown first, not published", async () => {
    const past = new Date(Date.now() - DAY);
    const listingId = await listing(users.owner, "IN_REVIEW", { contentUpdatedAt: past, lastCheckedAt: past, riskScore: 0, riskReasons: [] });
    await autoSave(listingId, { description: BLOCK_TEXT });

    await expect(lifecycle.approveListing(listingId, users.admin)).rejects.toMatchObject({ code: "content_changed" });
    const held = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(held.status).toBe("IN_REVIEW");
    expect(reasonCodes(held.riskReasons)).toContain("blocked_phrase");

    // The moderator has now seen the fresh results: approving again is their decision.
    expect(await lifecycle.approveListing(listingId, users.admin)).toEqual({ status: "LIVE", changed: true });
  });

  it("a stale page (the content changed since it was opened) is refused", async () => {
    const listingId = await listing(users.owner, "IN_REVIEW", { lastCheckedAt: new Date(Date.now() + 60_000), riskScore: 0, riskReasons: [] });
    const seen = (await db.listing.findUniqueOrThrow({ where: { id: listingId } })).contentUpdatedAt;
    await autoSave(listingId, { title: `${prefix} flat, new title` });
    state.staff = { id: users.admin, role: "ADMIN" };
    expect(await approveListingAction({ listingId, contentUpdatedAt: seen.toISOString() })).toEqual({ ok: false, error: "content_changed" });
    expect((await db.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe("IN_REVIEW");
  });

  it("a hidden listing edited with a blocked phrase goes to review, not back online", async () => {
    const past = new Date(Date.now() - DAY);
    const listingId = await listing(users.owner, "HIDDEN", { publishedAt: past, contentUpdatedAt: past, lastCheckedAt: past, riskScore: 0, riskReasons: [] });
    await autoSave(listingId, { description: BLOCK_TEXT });
    expect(await lifecycle.restoreHiddenListing(listingId, users.admin)).toEqual({ status: "IN_REVIEW", changed: true });
    const row = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(row.status).toBe("IN_REVIEW");
    expect(reasonCodes(row.riskReasons)).toContain("blocked_phrase");
    expect(state.founder).toEqual([{ id: listingId, why: ["blocked"] }]);
  });
});

describe("a live listing's auto-saved edit is checked at once", () => {
  it("clearing the price first doesn't switch the check off: a blocked phrase takes it off the site", async () => {
    const past = new Date(Date.now() - DAY);
    const listingId = await listing(users.owner, "LIVE", { publishedAt: past, contentUpdatedAt: past, lastCheckedAt: past, riskScore: 0, riskReasons: [] });
    state.user = { id: users.owner, role: "USER" };
    expect((await updateDraft(listingId, "price", { price: null })).ok).toBe(true);
    expect((await db.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe("LIVE");
    expect((await updateDraft(listingId, "text", { description: BLOCK_TEXT })).ok).toBe(true);
    const row = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(row.status).toBe("IN_REVIEW");
    expect(reasonCodes(row.riskReasons)).toContain("blocked_phrase");
    expect(state.founder).toEqual([{ id: listingId, why: ["blocked"] }]);
  });

  it("an old pledge version doesn't switch it off either", async () => {
    const past = new Date(Date.now() - DAY);
    await db.user.update({ where: { id: users.owner }, data: { welcomePledgeVersion: 0 } });
    const listingId = await listing(users.owner, "LIVE", { publishedAt: past, contentUpdatedAt: past, lastCheckedAt: past, riskScore: 0, riskReasons: [] });
    state.user = { id: users.owner, role: "USER" };
    expect((await updateDraft(listingId, "text", { description: BLOCK_TEXT })).ok).toBe(true);
    expect((await db.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe("IN_REVIEW");
  });

  it("when the checks can't run, the listing waits for a person (fail closed)", async () => {
    const listingId = await listing(users.owner, "LIVE", { publishedAt: new Date() });
    expect(await lifecycle.holdLiveListingForReview(listingId, users.owner)).toBe(true);
    expect((await db.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe("IN_REVIEW");
    expect(state.founder).toEqual([{ id: listingId, why: ["recheck"] }]);
  });
});

describe("banning a host", () => {
  it("pauses live listings only; a hidden one stays hidden after a reactivation", async () => {
    const future = new Date(Date.now() + 60_000);
    const hidden = await listing(users.banned, "HIDDEN", { publishedAt: new Date(), lastCheckedAt: future });
    const live = await listing(users.banned, "LIVE", { publishedAt: new Date(), lastCheckedAt: future, expiresAt: new Date(Date.now() + 30 * DAY) });
    const staff = { id: users.admin, role: "ADMIN" } as Parameters<typeof banUser>[0];
    await banUser(staff, users.banned, "turned_away", null);
    expect((await db.listing.findUniqueOrThrow({ where: { id: hidden } })).status).toBe("HIDDEN");
    expect((await db.listing.findUniqueOrThrow({ where: { id: live } })).status).toBe("PAUSED");

    await reactivateUser(staff, users.banned, null);
    await expect(lifecycle.unpauseListing(hidden, users.banned)).rejects.toBeInstanceOf(lifecycle.ListingStatusError);
    expect((await lifecycle.unpauseListing(live, users.banned)).status).toBe("LIVE");
  });
});
