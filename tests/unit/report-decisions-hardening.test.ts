/**
 * Phase 3 hardening of the report decisions (round 3, brief 8.2; PLAN.md answer 10) against the
 * local database (DATABASE_URL in .env):
 *
 * - only an ADMIN tells the host who reported (a MODERATOR decides reports but never reveals),
 *   never for a guest who deleted their account, never when the host can't be emailed, never
 *   after a dismissal, and a revealed report can't be dismissed any more;
 * - every decision claims the report BEFORE the account is touched: two staff members deciding
 *   at once give exactly one decision, one warning, one email;
 * - staff other than an ADMIN never decide a report about themselves, nor approve their own listing;
 * - "hide all their listings" keeps the host under review (a paused listing waits for a person
 *   when turned back on) until staff mark the host reviewed;
 * - a turned-away report about a removed host can be resolved.
 *
 * Emails, the session and the warn/ban side effects are stand-ins; everything else is the real
 * code. Rows use fake @example.com addresses and are removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Role = "ADMIN" | "MODERATOR" | "SUPPORT" | "EDITOR" | "USER";

const state = vi.hoisted(() => ({
  staff: null as null | { id: string; role: Role },
  emails: [] as { to: string; template: string; data: Record<string, unknown> }[],
  warned: [] as string[],
  banned: [] as string[],
  founder: [] as { id: string; why: string[] }[],
  /** When set, warnUser waits for it (a slow translation or email). */
  warnGate: null as null | Promise<void>,
  warnFails: false,
}));

vi.mock("server-only", () => ({}));
// The fresh authenticator code of destructive staff actions (3.6.c) is granted here; its rule is
// tested in tests/unit/endpoints/staff-fresh-proof-db.test.ts and endpoint-registry.test.ts.
vi.mock("@/lib/admin/server/staff-proof", () => ({ requireFreshStaffProof: async () => {}, spendStaffProof: async () => {} }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => undefined,
}));
vi.mock("@/lib/auth/session", async () => {
  const { can } = await import("@/lib/auth/permissions");
  const { AppError } = await import("@/lib/errors");
  return {
    requireStaffForAction: async (permission: Parameters<typeof can>[1]) => {
      if (!state.staff || !can(state.staff.role, permission)) throw new AppError("forbidden", "Forbidden", { status: 403 });
      return state.staff;
    },
  };
});
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: async (input: { to: string; template: string; data: Record<string, unknown> }) => {
    state.emails.push({ to: input.to, template: input.template, data: input.data });
    return { ok: true, delivery: "logged" };
  },
}));
vi.mock("@/lib/alerts/founder-admin", () => ({
  notifyFounderListingInReview: async (id: string, why: string[]) => void state.founder.push({ id, why }),
}));
vi.mock("@/lib/alerts/listing-decision", () => ({ notifyListingDecision: async () => ({ email: true, telegram: false, push: false }) }));
vi.mock("@/lib/admin/server/user-moderation", () => ({
  warnUser: async (_staff: unknown, userId: string) => {
    if (state.warnGate) await state.warnGate;
    if (state.warnFails) throw new Error("translation service down");
    state.warned.push(userId);
  },
  banUser: async (_staff: unknown, userId: string) => {
    state.banned.push(userId);
    return { sessionsRevoked: 0, listingsPaused: 0 };
  },
}));
vi.mock("@/lib/admin/server/common", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/server/common")>()),
  userReasonText: async (code: string, _locale: string, note?: string | null) => ({ reasonText: `reason:${code}`, note: note ?? null }),
}));

const { db } = await import("@/lib/db");
const admin = await import("@/lib/admin/actions/reports");
const { approveListingAction } = await import("@/lib/admin/actions/moderation");
const { markBookingFlagReviewedAction, markHostFlagReviewedAction } = await import("@/lib/admin/actions/flags");
const { Prisma } = await import("@/generated/prisma/client");
const { hostFlagSummary, isHostFlagged } = await import("@/lib/admin/server/flags");
const { unpauseListing } = await import("@/lib/listing/lifecycle");
const { canRevealReporter } = await import("@/lib/reports/turned-away");

const prefix = `p3d${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const id = (name: string) => `${prefix}-${name}`;
const users = {
  admin: id("admin"),
  moderator: id("moderator"),
  host: id("host"),
  phoneHost: id("phonehost"),
  modHost: id("modhost"),
  guest: id("guest"),
  goneGuest: id("goneguest"),
  hideHost: id("hidehost"),
  bannedHost: id("bannedhost"),
  flaggedHost: id("flaggedhost"),
};
let cityId = "";
const listingIds: string[] = [];
const reportIds: string[] = [];

async function listing(ownerId: string, status: "LIVE" | "PAUSED" | "DRAFT" | "IN_REVIEW", extra: Record<string, unknown> = {}) {
  // Complete enough to go (back) on the site: unpause checks the publishing requirements and the
  // mistake check's errors (round 3, brief 6.1) before the review rules.
  const row = await db.listing.create({
    data: {
      ownerId,
      status,
      dealType: "SHORT_STAY",
      cityId,
      title: `${prefix} listing`,
      lat: 41.64,
      lng: 41.62,
      address: "Fake street 1, apt 2",
      price: 80,
      currency: "USD",
      pricePeriod: "NIGHT",
      contactMethods: [{ channel: "WHATSAPP", value: "+995555990002", order: 0 }],
      ...extra,
    } as Parameters<typeof db.listing.create>[0]["data"],
  });
  await db.listingPhoto.createMany({ data: Array.from({ length: 5 }, (_, i) => ({ listingId: row.id, url: `/photos/cities/batumi.webp`, sortOrder: i, isCover: i === 0 })) });
  listingIds.push(row.id);
  return row.id;
}

async function turnedAway(hostId: string, reporterId = users.guest, extra: Record<string, unknown> = {}) {
  const row = await db.report.create({
    data: {
      kind: "TURNED_AWAY",
      priority: "URGENT",
      targetType: "USER",
      targetUserId: hostId,
      reporterId,
      reason: "CANCELLED_FOR_IDENTITY",
      ...extra,
    } as Parameters<typeof db.report.create>[0]["data"],
  });
  reportIds.push(row.id);
  return row.id;
}

const asAdmin = () => (state.staff = { id: users.admin, role: "ADMIN" });
const asModerator = () => (state.staff = { id: users.moderator, role: "MODERATOR" });
const reason = { resolution: "Checked the messages with the guest." };

beforeAll(async () => {
  await db.user.createMany({
    data: Object.entries(users).map(([name, userId]) => ({
      id: userId,
      name: `${name} Test`,
      firstName: name === "guest" ? "Noa" : null,
      email: name === "phoneHost" ? `${userId}@phone.bayit.invalid` : `${userId}@example.com`,
      role: name === "admin" ? "ADMIN" : name === "moderator" || name === "modHost" ? "MODERATOR" : "USER",
      status: name === "bannedHost" ? "BANNED" : "ACTIVE",
      locale: "en",
    })),
  });
  const city = await db.city.create({
    data: { slug: id("city"), names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.6, lng: 41.6 },
  });
  cityId = city.id;
});

afterAll(async () => {
  const ids = Object.values(users);
  const reports = await db.report.findMany({ where: { OR: [{ id: { in: reportIds } }, { reporterId: { in: ids } }, { targetUserId: { in: ids } }] }, select: { id: true } });
  const allReports = reports.map((r) => r.id);
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: [...allReports, ...ids, ...listingIds] } }] } });
  await db.report.deleteMany({ where: { id: { in: allReports } } });
  await db.rateLimit.deleteMany({ where: { OR: ids.map((userId) => ({ key: { contains: userId } })) } });
  await db.booking.deleteMany({ where: { hostUserId: { in: ids } } });
  await db.listing.deleteMany({ where: { ownerId: { in: ids } } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
});

beforeEach(() => {
  state.staff = null;
  state.emails.length = 0;
  state.warned.length = 0;
  state.banned.length = 0;
  state.founder.length = 0;
  state.warnGate = null;
  state.warnFails = false;
});

async function revealAudits(reportId: string) {
  return db.auditLog.count({ where: { action: "report.reveal_reporter", targetId: reportId } });
}

describe("telling the host who reported", () => {
  it("is the founder's decision: ADMIN only", () => {
    expect(canRevealReporter("ADMIN")).toBe(true);
    for (const role of ["MODERATOR", "SUPPORT", "EDITOR", "USER", null, undefined]) expect(canRevealReporter(role)).toBe(false);
  });

  it("a MODERATOR can decide reports but not reveal", async () => {
    const reportId = await turnedAway(users.host);
    asModerator();
    expect(await admin.revealReporter({ reportId, ...reason })).toEqual({ ok: false, error: "forbidden" });
    expect((await db.report.findUniqueOrThrow({ where: { id: reportId } })).reporterRevealedAt).toBeNull();
    expect(state.emails).toEqual([]);
    expect(await revealAudits(reportId)).toBe(0);

    asAdmin();
    expect(await admin.revealReporter({ reportId, ...reason })).toEqual({ ok: true });
    expect((await db.report.findUniqueOrThrow({ where: { id: reportId } })).reporterRevealedAt).not.toBeNull();
    expect(state.emails.map((e) => [e.template, e.data.reporterName])).toEqual([["report_reporter_revealed", "Noa"]]);
  });

  it("never for a guest who deleted their account (no name is left to tell)", async () => {
    const reportId = await turnedAway(users.host, users.goneGuest);
    await db.user.update({ where: { id: users.goneGuest }, data: { status: "DELETED", name: "Deleted user", firstName: null, deletedAt: new Date() } });
    asAdmin();
    expect(await admin.revealReporter({ reportId, ...reason })).toEqual({ ok: false, error: "invalid_status" });
    expect((await db.report.findUniqueOrThrow({ where: { id: reportId } })).reporterRevealedAt).toBeNull();
    expect(state.emails).toEqual([]);
  });

  it("never when the host can't be emailed: nothing is recorded, so it can be tried again", async () => {
    const reportId = await turnedAway(users.phoneHost);
    asAdmin();
    expect(await admin.revealReporter({ reportId, ...reason })).toEqual({ ok: false, error: "no_channel" });
    expect((await db.report.findUniqueOrThrow({ where: { id: reportId } })).reporterRevealedAt).toBeNull();
    expect(await revealAudits(reportId)).toBe(0);
    expect(state.emails).toEqual([]);
  });

  it("a revealed report can't be dismissed (the host did learn of it), and a dismissed one is never revealed", async () => {
    const revealed = await turnedAway(users.host);
    asAdmin();
    expect(await admin.revealReporter({ reportId: revealed, ...reason })).toEqual({ ok: true });
    expect(await admin.dismissReport({ reportId: revealed, ...reason })).toEqual({ ok: false, error: "invalid_status" });
    expect((await db.report.findUniqueOrThrow({ where: { id: revealed } })).status).toBe("OPEN");
    // Resolve closes it properly.
    expect(await admin.resolveReport({ reportId: revealed, ...reason })).toEqual({ ok: true, data: { status: "RESOLVED" } });

    const dismissed = await turnedAway(users.host);
    expect(await admin.dismissReport({ reportId: dismissed, ...reason })).toEqual({ ok: true, data: { status: "DISMISSED" } });
    state.emails.length = 0;
    expect(await admin.revealReporter({ reportId: dismissed, ...reason })).toEqual({ ok: false, error: "invalid_status" });
    expect(state.emails).toEqual([]);
  });

  it("a dismissal that lands while the reveal is under way wins: nothing is revealed or emailed", async () => {
    const reportId = await turnedAway(users.host);
    asAdmin();
    // Pause the reveal at its host lookup (after its own status check), dismiss meanwhile. The
    // stand-in passes every other call through (and stays in place: the model delegate can't be
    // restored once replaced).
    let release!: () => void;
    const paused = new Promise<void>((resolve) => (release = resolve));
    let reached!: () => void;
    const atLookup = new Promise<void>((resolve) => (reached = resolve));
    const original = db.user.findUnique.bind(db.user);
    let pause = true;
    vi.spyOn(db.user, "findUnique").mockImplementation(((args: Parameters<typeof db.user.findUnique>[0]) => {
      if (pause && args.where.id === users.host) {
        pause = false;
        reached();
        return paused.then(() => original(args));
      }
      return original(args);
    }) as unknown as typeof db.user.findUnique);
    const reveal = admin.revealReporter({ reportId, ...reason });
    await atLookup;
    expect(await admin.dismissReport({ reportId, ...reason })).toEqual({ ok: true, data: { status: "DISMISSED" } });
    release();
    expect(await reveal).toEqual({ ok: false, error: "invalid_status" });
    const row = await db.report.findUniqueOrThrow({ where: { id: reportId } });
    expect(row).toMatchObject({ status: "DISMISSED", reporterRevealedAt: null });
    expect(state.emails.filter((e) => e.template === "report_reporter_revealed")).toEqual([]);
  });
});

describe("one decision per report, claimed before the account is touched", () => {
  it("a warning racing a dismissal: exactly one goes through, and what is stored is what happened", async () => {
    const reportId = await turnedAway(users.host);
    asAdmin();
    let open!: () => void;
    state.warnGate = new Promise<void>((resolve) => (open = resolve));
    const warn = admin.warnReportedUser({ reportId, reason: "turned_away", note: "" });
    // The warning has claimed the report and waits in warnUser; the dismissal comes second.
    await vi.waitFor(async () => expect((await db.report.findUniqueOrThrow({ where: { id: reportId } })).status).toBe("RESOLVED"));
    const dismiss = await admin.dismissReport({ reportId, ...reason });
    open();
    const results = [await warn, dismiss];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(dismiss).toEqual({ ok: false, error: "already_decided" });
    expect(state.warned).toEqual([users.host]);
    expect(await db.report.findUniqueOrThrow({ where: { id: reportId } })).toMatchObject({ status: "RESOLVED", actionTaken: "warned" });
  });

  it("two warnings at once: one warning, one already_decided", async () => {
    const reportId = await turnedAway(users.host);
    asAdmin();
    const results = await Promise.all([
      admin.warnReportedUser({ reportId, reason: "turned_away", note: "" }),
      admin.warnReportedUser({ reportId, reason: "turned_away", note: "" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "already_decided" }]);
    expect(state.warned).toHaveLength(1);
  });

  it("a warning that fails puts the report back to open", async () => {
    const reportId = await turnedAway(users.host);
    asAdmin();
    state.warnFails = true;
    const result = await admin.warnReportedUser({ reportId, reason: "turned_away", note: "" });
    expect(result.ok).toBe(false);
    expect(await db.report.findUniqueOrThrow({ where: { id: reportId } })).toMatchObject({ status: "OPEN", actionTaken: null, handledById: null });
  });

  it("two 'hide all' at once: one email, one already_decided", async () => {
    const hideHost = users.hideHost;
    await listing(hideHost, "LIVE");
    const reportId = await turnedAway(hideHost);
    asAdmin();
    const results = await Promise.all([
      admin.hideHostListings({ reportId, reason: "turned_away", note: "" }),
      admin.hideHostListings({ reportId, reason: "turned_away", note: "" }),
    ]);
    expect(results.filter((r) => r.ok)).toEqual([{ ok: true, data: { hidden: 1 } }]);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "already_decided" }]);
    expect(state.emails.filter((e) => e.template === "report_host_listings_hidden")).toHaveLength(1);
  });
});

describe("after 'hide all their listings' the host waits for a person", () => {
  it("is flagged, a paused listing goes to review when turned on, and 'mark reviewed' lifts it", async () => {
    const host = users.hideHost;
    const paused = await listing(host, "PAUSED", { publishedAt: new Date(), lastCheckedAt: new Date(Date.now() + 60_000) });
    // The earlier test hid this host's listings through a report: the sanction is on.
    expect(await isHostFlagged(host)).toBe(true);
    const summary = await hostFlagSummary(host);
    expect(summary).toMatchObject({ flagged: true, sanctioned: true, reportFlagOpen: false });

    const first = await unpauseListing(paused, host);
    expect(first.status).toBe("IN_REVIEW");
    expect(state.founder).toEqual([{ id: paused, why: ["flagged_host"] }]);

    asAdmin();
    expect(await markHostFlagReviewedAction({ userId: host, note: "Talked to the host.", seenLatest: null })).toEqual({ ok: true, data: { changed: true } });
    expect(await isHostFlagged(host)).toBe(false);
    await db.listing.update({ where: { id: paused }, data: { status: "PAUSED" } });
    expect((await unpauseListing(paused, host)).status).toBe("LIVE");
  });

  it("a turned-away report about a removed host can be resolved (not only dismissed)", async () => {
    const reportId = await turnedAway(users.bannedHost);
    asModerator();
    expect(await admin.resolveReport({ reportId, ...reason })).toEqual({ ok: true, data: { status: "RESOLVED" } });
    expect(await db.report.findUniqueOrThrow({ where: { id: reportId } })).toMatchObject({ status: "RESOLVED", actionTaken: "resolved" });
  });
});

describe("staff never decide about themselves", () => {
  it("a MODERATOR who is the reported host can't dismiss, resolve or warn", async () => {
    const reportId = await turnedAway(users.modHost);
    state.staff = { id: users.modHost, role: "MODERATOR" };
    expect(await admin.dismissReport({ reportId, ...reason })).toEqual({ ok: false, error: "not_allowed_on_self" });
    expect(await admin.resolveReport({ reportId, ...reason })).toEqual({ ok: false, error: "not_allowed_on_self" });
    expect(await admin.warnReportedUser({ reportId, reason: "turned_away", note: "" })).toEqual({ ok: false, error: "not_allowed_on_self" });
    expect((await db.report.findUniqueOrThrow({ where: { id: reportId } })).status).toBe("OPEN");
    // Another moderator can.
    asModerator();
    expect(await admin.resolveReport({ reportId, ...reason })).toEqual({ ok: true, data: { status: "RESOLVED" } });
  });

  it("a MODERATOR can't approve their own listing", async () => {
    const own = await listing(users.modHost, "IN_REVIEW");
    const row = await db.listing.findUniqueOrThrow({ where: { id: own } });
    state.staff = { id: users.modHost, role: "MODERATOR" };
    expect(await approveListingAction({ listingId: own, contentUpdatedAt: row.contentUpdatedAt.toISOString() })).toEqual({
      ok: false,
      error: "not_allowed_on_self",
    });
    expect((await db.listing.findUniqueOrThrow({ where: { id: own } })).status).toBe("IN_REVIEW");
  });
});

describe("flags", () => {
  it("nobody marks the cancellation flag of their own booking reviewed", async () => {
    const listingId = await listing(users.modHost, "LIVE");
    const booking = await db.booking.create({
      data: {
        code: `BT-${prefix.slice(-5).toUpperCase()}`,
        listingId,
        guestUserId: users.guest,
        hostUserId: users.modHost,
        status: "CANCELLED_BY_HOST",
        cancelledAt: new Date(),
        flaggedForReview: true,
        checkIn: new Date("2026-12-01T00:00:00Z"),
        checkOut: new Date("2026-12-03T00:00:00Z"),
        nights: 2,
        adults: 2,
        nightlyPrice: new Prisma.Decimal(50),
        subtotal: new Prisma.Decimal(100),
        total: new Prisma.Decimal(100),
        currency: "USD",
        cancellationPolicy: "MODERATE",
        guestName: "Guest",
        guestPhone: "+995500000000",
        locale: "he",
        rulesAcceptedAt: new Date(),
      },
    });
    state.staff = { id: users.modHost, role: "MODERATOR" };
    expect(await markBookingFlagReviewedAction({ bookingId: booking.id, note: "Checked it myself." })).toEqual({ ok: false, error: "not_allowed_on_self" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).flagReviewedAt).toBeNull();
    asModerator();
    expect(await markBookingFlagReviewedAction({ bookingId: booking.id, note: "Talked to the host." })).toEqual({ ok: true, data: { changed: true } });
  });

  it("'mark host reviewed' refuses when a report arrived after the page was opened", async () => {
    const host = users.flaggedHost;
    await listing(host, "LIVE", { publishedAt: new Date() });
    await turnedAway(host);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await turnedAway(host, users.goneGuest);
    const summary = await hostFlagSummary(host);
    expect(summary?.reportFlagOpen).toBe(true);
    const seen = summary!.latestReportAt!;
    await new Promise((resolve) => setTimeout(resolve, 5));
    // A third report lands while the staff member writes the note.
    await turnedAway(host, users.admin);
    asModerator();
    expect(await markHostFlagReviewedAction({ userId: host, note: "Looked at both reports.", seenLatest: seen.toISOString() })).toEqual({
      ok: false,
      error: "changed_since_view",
    });
    expect((await db.user.findUniqueOrThrow({ where: { id: host } })).hostFlagReviewedAt).toBeNull();
    const fresh = (await hostFlagSummary(host))!.latestReportAt!;
    expect(await markHostFlagReviewedAction({ userId: host, note: "Looked at all three.", seenLatest: fresh.toISOString() })).toEqual({ ok: true, data: { changed: true } });
  });
});
