/**
 * "Turned away?" reports (round 3, brief 8.2) against the local database (DATABASE_URL in .env):
 *
 * - createTurnedAwayReport: who may report what (own booking, a published listing that isn't
 *   theirs), urgent and about the host, screenshots only the reporter's own unused uploads, the
 *   founder and the guest emailed, and never counted toward hiding a listing automatically;
 * - the staff decisions: each needs a reason and is audited, dismiss emails nobody, warn / hide all
 *   / remove reach the host without naming the reporter, "reveal" is separate, once, first name
 *   only, and SUPPORT can only look;
 * - the automatic host flag (2+ reports in 12 months, dismissed and review reports left out),
 *   which turned-away reports feed;
 * - screenshots deleted 180 days after the decision.
 *
 * The session, CAPTCHA, emails, storage deletes and account actions are stand-ins; everything
 * else (validation, ownership checks, queries, audit rows, rate limits) is the real code. Rows
 * use fake addresses (@example.com) and are removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sealGuestPhone } from "@/lib/field-crypto";

const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  staff: null as null | { id: string; role: "ADMIN" | "MODERATOR" | "SUPPORT" | "EDITOR" | "USER" },
  later: [] as (() => unknown)[],
  founder: [] as string[],
  confirmed: [] as string[],
  emails: [] as { to: string; template: string; data: Record<string, unknown> }[],
  applyReport: [] as string[],
  warned: [] as string[],
  banned: [] as string[],
  deleted: [] as string[],
  failDelete: new Set<string>(),
}));

vi.mock("server-only", () => ({}));
// The fresh authenticator code of destructive staff actions (3.6.c) is granted here; its rule is
// tested in tests/unit/endpoints/staff-fresh-proof-db.test.ts and endpoint-registry.test.ts.
vi.mock("@/lib/admin/server/staff-proof", () => ({ requireFreshStaffProof: async () => {}, spendStaffProof: async () => {} }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void state.later.push(task),
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
vi.mock("@/lib/turnstile", () => ({ assertTurnstile: async () => undefined }));
vi.mock("@/lib/auth/hooks", () => ({ linkDevice: async () => undefined }));
vi.mock("@/lib/reports/notify", () => ({
  notifyFounderOfReport: async (id: string) => void state.founder.push(id),
  sendReportConfirmation: async (id: string) => void state.confirmed.push(id),
}));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: async (input: { to: string; template: string; data: Record<string, unknown> }) => {
    state.emails.push({ to: input.to, template: input.template, data: input.data });
    return { ok: true, delivery: "logged" };
  },
}));
vi.mock("@/lib/listing/lifecycle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/listing/lifecycle")>()),
  applyReport: async (listingId: string) => void state.applyReport.push(listingId),
}));
vi.mock("@/lib/admin/server/user-moderation", () => ({
  warnUser: async (_staff: unknown, userId: string) => void state.warned.push(userId),
  banUser: async (_staff: unknown, userId: string) => {
    state.banned.push(userId);
    return { sessions: 0, listingsPaused: 0 };
  },
}));
vi.mock("@/lib/admin/server/common", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/server/common")>()),
  userReasonText: async (code: string, _locale: string, note?: string | null) => ({ reasonText: `reason:${code}`, note: note ?? null }),
}));
vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  deletePrivate: async (key: string) => {
    if (state.failDelete.has(key)) throw new Error("storage down");
    state.deleted.push(key);
  },
}));

const { db } = await import("@/lib/db");
const { Prisma } = await import("@/generated/prisma/client");
const { tbilisiToday } = await import("@/lib/booking/dates");
const { createReport, createTurnedAwayReport } = await import("@/lib/reports/actions");
const { deleteExpiredReportScreenshots } = await import("@/lib/reports/retention");
const { hostFlagSummary } = await import("@/lib/admin/server/flags");
const admin = await import("@/lib/admin/actions/reports");

const prefix = `p3r${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const id = (name: string) => `${prefix}-${name}`;
const users = {
  host: id("host"),
  guest: id("guest"),
  guest2: id("guest2"),
  guest3: id("guest3"),
  guest4: id("guest4"),
  other: id("other"),
  admin: id("admin"),
  support: id("support"),
  flag1: id("flag1"),
  flag2: id("flag2"),
  flag3: id("flag3"),
  flag4: id("flag4"),
  racer: id("racer"),
  racer2: id("racer2"),
  racer3: id("racer3"),
};
const listings = { live: "", live2: "", draft: "", guestOwn: "", flag1: "", flag2: "", flag3: "", flag4: "" };
let cityId = "";
let bookingId = "";
let otherBookingId = "";
const today = tbilisiToday();
const DAY = 86_400_000;

async function createBooking(suffix: string, guestUserId: string) {
  const booking = await db.booking.create({
    data: {
      code: id(suffix).toUpperCase(),
      listingId: listings.live,
      guestUserId,
      hostUserId: users.host,
      status: "CANCELLED_BY_HOST",
      cancelledAt: new Date(),
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
      ...sealGuestPhone("+995500000000"),
      locale: "he",
      rulesAcceptedAt: new Date(),
    },
  });
  return booking.id;
}

async function listing(ownerId: string, status: "LIVE" | "DRAFT" = "LIVE") {
  const row = await db.listing.create({ data: { ownerId, status, dealType: "SHORT_STAY", cityId, title: `${prefix} listing` } });
  return row.id;
}

async function upload(userId: string, name: string) {
  const key = `private/report/${userId}/${prefix}${name}.jpg`;
  await db.privateUpload.create({ data: { key, userId, purpose: "report" } });
  return { key, mime: "image/png", bytes: 52_000, name: `${name}.png` };
}

function report(input: Record<string, unknown>) {
  return createTurnedAwayReport({ reason: "CANCELLED_FOR_IDENTITY", happenedOn: today, ...input });
}

async function flush() {
  const tasks = state.later.splice(0);
  for (const task of tasks) await task();
}

async function latestReport(reporterId: string) {
  return db.report.findFirstOrThrow({ where: { reporterId }, orderBy: { createdAt: "desc" } });
}

beforeAll(async () => {
  await db.user.createMany({
    data: Object.entries(users).map(([name, userId]) => ({
      id: userId,
      name: `${name} Test`,
      firstName: name === "guest" ? "Noa" : null,
      email: `${userId}@example.com`,
      role: name === "admin" ? "ADMIN" : name === "support" ? "SUPPORT" : "USER",
      locale: "en",
    })),
  });
  const city = await db.city.create({
    data: { slug: id("city"), names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.6, lng: 41.6 },
  });
  cityId = city.id;
  listings.live = await listing(users.host);
  listings.live2 = await listing(users.host);
  listings.draft = await listing(users.host, "DRAFT");
  listings.guestOwn = await listing(users.guest);
  for (const key of ["flag1", "flag2", "flag3", "flag4"] as const) listings[key] = await listing(users[key]);
  bookingId = await createBooking("b1", users.guest);
  otherBookingId = await createBooking("b2", users.other);
});

afterAll(async () => {
  const ids = Object.values(users);
  const reports = await db.report.findMany({ where: { OR: [{ reporterId: { in: ids } }, { targetUserId: { in: ids } }, { listingId: { in: Object.values(listings) } }] }, select: { id: true } });
  const reportIds = reports.map((r) => r.id);
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: [...reportIds, ...ids, ...Object.values(listings)] } }] } });
  await db.report.deleteMany({ where: { id: { in: reportIds } } });
  await db.privateUpload.deleteMany({ where: { userId: { in: ids } } });
  await db.rateLimit.deleteMany({ where: { OR: ids.map((userId) => ({ key: { contains: userId } })) } });
  await db.booking.deleteMany({ where: { hostUserId: { in: ids } } });
  await db.listing.deleteMany({ where: { ownerId: { in: ids } } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
});

beforeEach(() => {
  state.user = null;
  state.staff = null;
  state.later.length = 0;
  state.founder.length = 0;
  state.confirmed.length = 0;
  state.emails.length = 0;
  state.applyReport.length = 0;
  state.warned.length = 0;
  state.banned.length = 0;
  state.deleted.length = 0;
  state.failDelete.clear();
});

describe("sending a turned-away report", () => {
  it("needs a signed-in guest", async () => {
    const result = await report({ bookingId });
    expect(result.ok).toBe(false);
    expect(await db.report.count({ where: { bookingId } })).toBe(0);
  });

  it("from the guest's own booking: urgent, about the host, linked to the booking, never hides anything", async () => {
    state.user = { id: users.guest };
    const shotA = await upload(users.guest, "a");
    const shotB = await upload(users.guest, "b");
    const result = await report({ bookingId, details: "  He wrote that he does not host Israelis.  ", attachments: [shotA, shotB] });
    expect(result).toEqual({ ok: true });
    const saved = await latestReport(users.guest);
    expect(saved).toMatchObject({
      kind: "TURNED_AWAY",
      priority: "URGENT",
      status: "OPEN",
      targetType: "USER",
      targetUserId: users.host,
      listingId: listings.live,
      bookingId,
      reason: "CANCELLED_FOR_IDENTITY",
      details: "He wrote that he does not host Israelis.",
      reporterRevealedAt: null,
    });
    expect(saved.happenedOn?.toISOString().slice(0, 10)).toBe(today);
    // Stored as the server re-encoded them (JPEG), whatever the browser said.
    expect(saved.attachments).toEqual([
      { key: shotA.key, mime: "image/jpeg", bytes: shotA.bytes, name: "a.png" },
      { key: shotB.key, mime: "image/jpeg", bytes: shotB.bytes, name: "b.png" },
    ]);
    // After the answer: the founder's email and the guest's confirmation.
    await flush();
    expect(state.founder).toEqual([saved.id]);
    expect(state.confirmed).toEqual([saved.id]);
    // Turned-away reports never count toward hiding a listing automatically.
    expect(state.applyReport).toEqual([]);
    const live = await db.listing.findUniqueOrThrow({ where: { id: listings.live }, select: { status: true, reportCount: true } });
    expect(live).toEqual({ status: "LIVE", reportCount: 0 });
  });

  it("one open report per guest, host and booking", async () => {
    state.user = { id: users.guest };
    expect(await report({ bookingId, reason: "REFUSED_OR_IGNORED" })).toMatchObject({ ok: false, error: "already_reported" });
  });

  it("from a listing's menu, also without a booking; three of them still hide nothing", async () => {
    for (const guest of [users.guest2, users.guest3, users.guest4]) {
      state.user = { id: guest };
      expect(await report({ listingId: listings.live2, reason: "ASKED_RELIGION_OR_ORIGIN" })).toEqual({ ok: true });
      const saved = await latestReport(guest);
      expect(saved).toMatchObject({ kind: "TURNED_AWAY", priority: "URGENT", targetUserId: users.host, listingId: listings.live2, bookingId: null });
    }
    expect(state.applyReport).toEqual([]);
    expect((await db.listing.findUniqueOrThrow({ where: { id: listings.live2 } })).status).toBe("LIVE");
  });

  it("refuses someone else's booking, a draft, and the guest's own listing", async () => {
    state.user = { id: users.guest };
    expect(await report({ bookingId: otherBookingId })).toMatchObject({ ok: false, error: "not_found" });
    expect(await report({ listingId: listings.draft })).toMatchObject({ ok: false, error: "not_found" });
    expect(await report({ listingId: listings.guestOwn })).toMatchObject({ ok: false, error: "own_target" });
  });

  it("checks what happened, when and the text", async () => {
    state.user = { id: users.other };
    expect(await report({ listingId: listings.live, reason: "FAKE_LISTING" })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(await report({ listingId: listings.live, reason: "OTHER", details: "short" })).toMatchObject({ ok: false, error: "invalid_input" });
    const future = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * DAY).toISOString().slice(0, 10);
    expect(await report({ listingId: listings.live, happenedOn: future })).toMatchObject({ ok: false, error: "date_future" });
    expect(await report({ listingId: listings.live, happenedOn: "2026-02-30" })).toMatchObject({ ok: false, error: "date_invalid" });
  });

  it("attaches only the guest's own, unused report uploads", async () => {
    state.user = { id: users.other };
    const notRecorded = { key: `private/report/${users.other}/${prefix}ghost.jpg`, mime: "image/jpeg", bytes: 10, name: "x.jpg" };
    expect(await report({ listingId: listings.live, attachments: [notRecorded] })).toMatchObject({ ok: false, error: "attachment_invalid" });
    const someoneElses = await upload(users.guest2, "theirs");
    expect(await report({ listingId: listings.live, attachments: [someoneElses] })).toMatchObject({ ok: false, error: "attachment_invalid" });
    // Already on the guest's first report.
    state.user = { id: users.guest };
    const used = (await latestReport(users.guest)).attachments as { key: string }[];
    expect(await report({ listingId: listings.live2, attachments: [{ ...used[0], mime: "image/jpeg", bytes: 1, name: "a" }] })).toMatchObject({
      ok: false,
      error: "attachment_invalid",
    });
  });
});

describe("two submits at the same moment (two tabs, or a script)", () => {
  it("one open report per guest, host and booking holds", async () => {
    state.user = { id: users.racer };
    const raceBooking = await createBooking("race", users.racer);
    const results = await Promise.all([report({ bookingId: raceBooking }), report({ bookingId: raceBooking, reason: "REFUSED_OR_IGNORED" })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([expect.objectContaining({ error: "already_reported" })]);
    expect(await db.report.count({ where: { bookingId: raceBooking } })).toBe(1);
  });

  it("one screenshot goes on one report only", async () => {
    state.user = { id: users.racer2 };
    const raceBooking = await createBooking("race2", users.racer2);
    const shot = await upload(users.racer2, "race");
    // Two different targets (a booking, and the listing without one), the same screenshot.
    const results = await Promise.all([
      report({ bookingId: raceBooking, attachments: [shot] }),
      report({ listingId: listings.live2, attachments: [shot] }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([expect.objectContaining({ error: "attachment_invalid" })]);
    expect(await db.report.count({ where: { reporterId: users.racer2, attachments: { array_contains: [{ key: shot.key }] } } })).toBe(1);
  });

  it("a listing report (createReport) is saved once", async () => {
    state.user = { id: users.racer3 };
    const send = () => createReport({ targetType: "LISTING", targetId: listings.live, reason: "WRONG_PRICE" });
    const results = await Promise.all([send(), send()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([expect.objectContaining({ error: "already_reported" })]);
    expect(await db.report.count({ where: { reporterId: users.racer3, listingId: listings.live, status: "OPEN" } })).toBe(1);
  });
});

describe("staff decisions", () => {
  const asAdmin = () => (state.staff = { id: users.admin, role: "ADMIN" });

  async function openReport(overrides: Record<string, unknown> = {}) {
    return db.report.create({
      data: {
        kind: "TURNED_AWAY",
        priority: "URGENT",
        targetType: "USER",
        targetUserId: users.host,
        listingId: listings.live,
        reporterId: users.guest,
        reason: "ASKED_RELIGION_OR_ORIGIN",
        happenedOn: new Date(`${today}T00:00:00Z`),
        ...overrides,
      },
    });
  }

  async function auditActions(reportId: string) {
    return (await db.auditLog.findMany({ where: { targetId: reportId }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
  }

  it("SUPPORT can look but not decide", async () => {
    const r = await openReport();
    state.staff = { id: users.support, role: "SUPPORT" };
    expect(await admin.dismissReport({ reportId: r.id, resolution: "Not a real problem" })).toMatchObject({ ok: false, error: "forbidden" });
    expect(await admin.revealReporter({ reportId: r.id, resolution: "Needed" })).toMatchObject({ ok: false, error: "forbidden" });
    expect((await db.report.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("OPEN");
  });

  it("dismiss needs a reason, is audited and emails nobody (the host never knew)", async () => {
    const r = await openReport();
    asAdmin();
    expect(await admin.dismissReport({ reportId: r.id, resolution: " " })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(await admin.dismissReport({ reportId: r.id, resolution: "The guest wrote to say it was a misunderstanding" })).toMatchObject({ ok: true });
    const saved = await db.report.findUniqueOrThrow({ where: { id: r.id } });
    expect(saved).toMatchObject({ status: "DISMISSED", actionTaken: "dismissed", handledById: users.admin });
    expect(state.emails).toEqual([]);
    expect(await auditActions(r.id)).toEqual(["report.dismiss"]);
    // Decided once: a second decision is refused, and a dismissed report is never revealed.
    expect(await admin.warnReportedUser({ reportId: r.id, reason: "turned_away" })).toMatchObject({ ok: false, error: "already_decided" });
    expect(await admin.revealReporter({ reportId: r.id, resolution: "Needed" })).toMatchObject({ ok: false, error: "invalid_status" });
  });

  it("warning the host needs a reason code, closes the report and names nobody", async () => {
    const r = await openReport();
    asAdmin();
    expect(await admin.warnReportedUser({ reportId: r.id })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(await admin.warnReportedUser({ reportId: r.id, reason: "turned_away", note: "Read the pledge again." })).toMatchObject({ ok: true });
    expect(state.warned).toEqual([users.host]);
    expect(await db.report.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "RESOLVED", actionTaken: "warned", reporterRevealedAt: null });
    expect(await auditActions(r.id)).toEqual(["report.warn_host"]);
  });

  it("hiding all the host's listings takes every LIVE one off, emails the host the reason, never the reporter", async () => {
    const r = await openReport();
    asAdmin();
    expect(await admin.hideHostListings({ reportId: r.id, reason: "turned_away" })).toMatchObject({ ok: true, data: { hidden: 2 } });
    const rows = await db.listing.findMany({ where: { ownerId: users.host }, select: { id: true, status: true } });
    expect(Object.fromEntries(rows.map((l) => [l.id, l.status]))).toEqual({ [listings.live]: "HIDDEN", [listings.live2]: "HIDDEN", [listings.draft]: "DRAFT" });
    expect(state.emails).toHaveLength(1);
    expect(state.emails[0]).toMatchObject({ to: `${users.host}@example.com`, template: "report_host_listings_hidden", data: { count: 2, reasonText: "reason:turned_away" } });
    expect(JSON.stringify(state.emails[0].data)).not.toMatch(/Noa|guest/i);
    expect(await auditActions(r.id)).toEqual(["report.hide_host_listings"]);
    expect(await db.auditLog.count({ where: { action: "listing.hide_all", targetId: users.host } })).toBe(1);
    // Nothing left to hide: refused.
    const again = await openReport();
    expect(await admin.hideHostListings({ reportId: again.id, reason: "turned_away" })).toMatchObject({ ok: false, error: "invalid_status" });
    await db.listing.updateMany({ where: { id: { in: [listings.live, listings.live2] } }, data: { status: "LIVE" } });
  });

  it("removing the host needs users.manage too, and bans the account", async () => {
    const r = await openReport();
    asAdmin();
    expect(await admin.removeReportedHost({ reportId: r.id, reason: "turned_away", note: "Third report" })).toMatchObject({ ok: true });
    expect(state.banned).toEqual([users.host]);
    expect(await db.report.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "RESOLVED", actionTaken: "host_removed" });
    expect(await auditActions(r.id)).toEqual(["report.remove_host"]);
  });

  it("telling the host who reported is separate, once, first name only, turned-away reports only", async () => {
    const r = await openReport();
    asAdmin();
    expect(await admin.revealReporter({ reportId: r.id, resolution: "" })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(await admin.revealReporter({ reportId: r.id, resolution: "The host asked, and the guest agreed" })).toMatchObject({ ok: true });
    const saved = await db.report.findUniqueOrThrow({ where: { id: r.id } });
    expect(saved.reporterRevealedAt).toBeInstanceOf(Date);
    expect(saved.status).toBe("OPEN"); // A separate step: the report still needs a decision.
    expect(state.emails).toEqual([
      expect.objectContaining({ to: `${users.host}@example.com`, template: "report_reporter_revealed", data: expect.objectContaining({ reporterName: "Noa" }) }),
    ]);
    expect(JSON.stringify(state.emails[0].data)).not.toContain(`${users.guest}@example.com`);
    expect(await admin.revealReporter({ reportId: r.id, resolution: "Again" })).toMatchObject({ ok: false, error: "invalid_status" });
    expect(await auditActions(r.id)).toEqual(["report.reveal_reporter"]);
    const general = await openReport({ kind: "GENERAL", priority: "NORMAL", targetType: "LISTING", targetUserId: null, reason: "WRONG_PRICE" });
    expect(await admin.revealReporter({ reportId: general.id, resolution: "Needed" })).toMatchObject({ ok: false, error: "invalid_status" });
  });

  it("internal notes are staff only and audited without their text", async () => {
    const r = await openReport();
    asAdmin();
    expect(await admin.saveReportNote({ reportId: r.id, note: "Called the host, no answer." })).toMatchObject({ ok: true });
    expect((await db.report.findUniqueOrThrow({ where: { id: r.id } })).adminNote).toBe("Called the host, no answer.");
    const [entry] = await db.auditLog.findMany({ where: { targetId: r.id, action: "report.note" } });
    expect(JSON.stringify(entry.details)).not.toContain("Called the host");
  });
});

describe("automatic host flag (2 or more reports in 12 months, dismissed left out)", () => {
  const ago = (days: number) => new Date(Date.now() - days * DAY);

  async function add(host: keyof typeof users & `flag${number}`, data: Record<string, unknown>) {
    await db.report.create({
      data: { targetType: "USER", targetUserId: users[host], reporterId: users.other, reason: "OTHER", ...data } as Parameters<typeof db.report.create>[0]["data"],
    });
  }

  it("one report is not a flag; a turned-away report plus a listing report is", async () => {
    await add("flag1", { kind: "TURNED_AWAY", reason: "REFUSED_OR_IGNORED", priority: "URGENT" });
    expect(await hostFlagSummary(users.flag1)).toMatchObject({ countingReports: 0, reportFlagOpen: false, flagged: false });
    await add("flag1", { targetType: "LISTING", targetUserId: null, listingId: listings.flag1, reason: "WRONG_PRICE" });
    expect(await hostFlagSummary(users.flag1)).toMatchObject({ countingReports: 2, turnedAway: 1, reportFlagOpen: true, flagged: true });
  });

  it("dismissed reports don't count; resolved ones do", async () => {
    await add("flag2", { kind: "TURNED_AWAY", status: "DISMISSED", handledAt: new Date() });
    await add("flag2", { kind: "TURNED_AWAY" });
    expect(await hostFlagSummary(users.flag2)).toMatchObject({ reportFlagOpen: false, flagged: false });
    await add("flag2", { kind: "TURNED_AWAY", status: "RESOLVED", handledAt: new Date() });
    expect(await hostFlagSummary(users.flag2)).toMatchObject({ countingReports: 2, reportFlagOpen: true });
  });

  it("reports older than 12 months and reports about a review don't count", async () => {
    await add("flag3", { kind: "TURNED_AWAY", createdAt: ago(400) });
    await add("flag3", { kind: "TURNED_AWAY" });
    expect(await hostFlagSummary(users.flag3)).toMatchObject({ reportFlagOpen: false });
    await add("flag4", { kind: "TURNED_AWAY" });
    // A review report (its review gone: reviewId is a real relation since round 3, phase 5).
    await add("flag4", { targetType: "REVIEW" });
    expect(await hostFlagSummary(users.flag4)).toMatchObject({ reportFlagOpen: false });
  });
});

describe("screenshot retention (180 days after the decision)", () => {
  async function decided(status: "OPEN" | "RESOLVED" | "DISMISSED", handledDaysAgo: number | null, keys: string[]) {
    return db.report.create({
      data: {
        kind: "TURNED_AWAY",
        targetType: "USER",
        targetUserId: users.host,
        reporterId: users.guest3,
        reason: "OTHER",
        status,
        handledAt: handledDaysAgo === null ? null : new Date(Date.now() - handledDaysAgo * DAY),
        attachments: keys.map((key) => ({ key, mime: "image/jpeg", bytes: 1, name: "s.jpg" })),
      },
    });
  }
  const keyOf = (name: string) => `private/report/${users.guest3}/${prefix}${name}.jpg`;

  it("deletes the files of reports decided more than 180 days ago and keeps the report", async () => {
    const old = await decided("RESOLVED", 181, [keyOf("o1"), keyOf("o2")]);
    const oldDismissed = await decided("DISMISSED", 200, [keyOf("o3")]);
    const recent = await decided("RESOLVED", 179, [keyOf("r1")]);
    const open = await decided("OPEN", null, [keyOf("p1")]);
    const failing = await decided("RESOLVED", 190, [keyOf("f1")]);
    state.failDelete.add(keyOf("f1"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const now = new Date();
    const result = await deleteExpiredReportScreenshots(now);
    expect(state.deleted).toEqual(expect.arrayContaining([keyOf("o1"), keyOf("o2"), keyOf("o3")]));
    expect(state.deleted).not.toEqual(expect.arrayContaining([keyOf("r1")]));
    expect(state.deleted).not.toEqual(expect.arrayContaining([keyOf("p1")]));
    expect(result.failed).toBeGreaterThanOrEqual(1);
    for (const r of [old, oldDismissed]) {
      expect(await db.report.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ attachments: [], attachmentsDeletedAt: now, status: r.status });
    }
    for (const r of [recent, open, failing]) {
      const row = await db.report.findUniqueOrThrow({ where: { id: r.id } });
      expect(row.attachmentsDeletedAt).toBeNull();
      expect(row.attachments).toHaveLength(1);
    }
    // A second run has nothing more of these to delete.
    state.deleted.length = 0;
    await deleteExpiredReportScreenshots(now);
    expect(state.deleted).not.toEqual(expect.arrayContaining([keyOf("o1")]));
    // The failed delete was logged and is tried again on the next run.
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
