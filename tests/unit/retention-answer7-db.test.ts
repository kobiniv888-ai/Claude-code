/**
 * The founder's answer 7 of 9 November 2026 (SECURITY_REPORT 15.9), against the local database:
 * expired sessions 30 days after they expired, phone-line checks and dead notification
 * subscriptions 90 days, and ONE clock (180 days, interim) for the texts of closed support
 * tickets and decided reports; report screenshots use the same constant. Every job only touches
 * this test's own rows (the `scope` argument) and the rows are removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { eraseClosedCaseTexts, purgeDeadPushSubscriptions, purgeExpiredSessions, purgeOldPhoneLookups } = await import(
  "@/lib/admin/maintenance/retention"
);
const { CASE_TEXT_RETENTION_DAYS, ERASED_TEXT, LOGIN_CODE_MAX_HOURS } = await import("@/lib/retention-times");
const { REPORT_SCREENSHOT_RETENTION_DAYS } = await import("@/lib/reports/turned-away");

const prefix = `r7${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const NOW = new Date("2026-11-09T03:00:00Z");
const DAY = 24 * 3600 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const userId = `${prefix}-user`;
const ids = { tickets: {} as Record<string, string>, reports: {} as Record<string, string> };

beforeAll(async () => {
  await db.user.create({ data: { id: userId, name: "Test retention", email: `${prefix}@example.test` } });
  const session = (name: string, expiresAt: Date) =>
    db.session.create({ data: { id: `${prefix}-${name}`, token: `${prefix}-${name}-token`, userId, expiresAt } });
  await session("expired31", ago(31));
  await session("expired29", ago(29));
  await session("active", new Date(NOW.getTime() + DAY));

  await db.phoneLookup.createMany({
    data: [
      { phoneNumber: `+${prefix}-old`, checkedAt: ago(91) },
      { phoneNumber: `+${prefix}-new`, checkedAt: ago(89) },
    ],
  });

  const push = (name: string, data: { failedAt?: Date | null; lastOkAt?: Date | null; createdAt: Date }) =>
    db.pushSubscription.create({ data: { userId, endpoint: `https://push.example.test/${prefix}/${name}`, p256dh: "k", auth: "a", ...data } });
  await push("dead-never-worked", { failedAt: ago(1), lastOkAt: null, createdAt: ago(120) });
  await push("dead-worked-long-ago", { failedAt: ago(1), lastOkAt: ago(100), createdAt: ago(200) });
  await push("failing-recently-worked", { failedAt: ago(1), lastOkAt: ago(30), createdAt: ago(200) });
  await push("old-but-healthy", { failedAt: null, lastOkAt: null, createdAt: ago(300) });

  const ticket = async (name: string, data: { status: "OPEN" | "RESOLVED" | "CLOSED"; closedAt?: Date | null; at: Date }) => {
    const row = await db.ticket.create({
      data: {
        userId,
        category: "OTHER",
        subject: `${prefix} ${name} subject`,
        status: data.status,
        closedAt: data.closedAt ?? null,
        ratingComment: "Thanks",
        guestName: "Guest",
        guestEmail: `${prefix}-guest@example.test`,
        lastMessageAt: data.at,
        createdAt: data.at,
        updatedAt: data.at,
      },
      select: { id: true },
    });
    await db.ticketMessage.create({ data: { ticketId: row.id, body: "My booking BT-TEST1 and my phone", createdAt: data.at } });
    ids.tickets[name] = row.id;
  };
  await ticket("closedOld", { status: "CLOSED", closedAt: ago(181), at: ago(200) });
  await ticket("closedRecent", { status: "CLOSED", closedAt: ago(179), at: ago(200) });
  await ticket("openOld", { status: "OPEN", at: ago(400) });
  // updatedAt is set by Prisma on create; the RESOLVED rule also needs no message since the cutoff.
  await ticket("resolvedOld", { status: "RESOLVED", at: ago(300) });
  await db.$executeRaw`UPDATE "Ticket" SET "updatedAt" = ${ago(300)} WHERE id = ${ids.tickets.resolvedOld}`;

  const report = async (name: string, data: { status: "OPEN" | "RESOLVED" | "DISMISSED"; handledAt?: Date | null }) => {
    const row = await db.report.create({
      data: {
        targetType: "USER",
        targetUserId: userId,
        reporterId: userId,
        reason: "OTHER",
        details: "What happened, with a name",
        adminNote: "Staff note",
        resolution: "Talked to the host",
        actionTaken: "resolved",
        status: data.status,
        handledAt: data.handledAt ?? null,
      },
      select: { id: true },
    });
    ids.reports[name] = row.id;
  };
  await report("decidedOld", { status: "RESOLVED", handledAt: ago(181) });
  await report("dismissedRecent", { status: "DISMISSED", handledAt: ago(10) });
  await report("open", { status: "OPEN" });
});

afterAll(async () => {
  await db.report.deleteMany({ where: { id: { in: Object.values(ids.reports) } } });
  await db.ticket.deleteMany({ where: { id: { in: Object.values(ids.tickets) } } });
  await db.pushSubscription.deleteMany({ where: { endpoint: { startsWith: `https://push.example.test/${prefix}/` } } });
  await db.phoneLookup.deleteMany({ where: { phoneNumber: { startsWith: `+${prefix}` } } });
  await db.session.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe("founder's answer 7: retention times", () => {
  it("one clock for closed cases (180 days, interim) shared with the report screenshots; codes at most 24 hours", () => {
    expect(CASE_TEXT_RETENTION_DAYS).toBe(180);
    expect(REPORT_SCREENSHOT_RETENTION_DAYS).toBe(CASE_TEXT_RETENTION_DAYS);
    expect(LOGIN_CODE_MAX_HOURS).toBe(24);
  });

  it("expired sessions go 30 days after they expired", async () => {
    expect(await purgeExpiredSessions(NOW, { userId })).toBe(1);
    const left = (await db.session.findMany({ where: { userId }, select: { id: true } })).map((s) => s.id).sort();
    expect(left).toEqual([`${prefix}-active`, `${prefix}-expired29`].sort());
    expect(await purgeExpiredSessions(NOW, { userId })).toBe(0);
  });

  it("phone-line checks go after 90 days", async () => {
    expect(await purgeOldPhoneLookups(NOW, { phoneNumber: { startsWith: `+${prefix}` } })).toBe(1);
    const left = await db.phoneLookup.findMany({ where: { phoneNumber: { startsWith: `+${prefix}` } }, select: { phoneNumber: true } });
    expect(left.map((r) => r.phoneNumber)).toEqual([`+${prefix}-new`]);
  });

  it("notification subscriptions that keep failing and have not worked for 90 days go; healthy or recently working ones stay", async () => {
    const scope = { endpoint: { startsWith: `https://push.example.test/${prefix}/` } };
    expect(await purgeDeadPushSubscriptions(NOW, scope)).toBe(2);
    const left = (await db.pushSubscription.findMany({ where: scope, select: { endpoint: true } })).map((r) => r.endpoint.split("/").pop()).sort();
    expect(left).toEqual(["failing-recently-worked", "old-but-healthy"]);
  });

  it("closed tickets and decided reports lose their texts after 180 days; open or recent ones keep them", async () => {
    const scope = { ticket: { userId }, report: { reporterId: userId } };
    const result = await eraseClosedCaseTexts(NOW, scope);
    expect(result).toEqual({ tickets: 2, messages: 2, reports: 1 });

    const tickets = await db.ticket.findMany({
      where: { id: { in: Object.values(ids.tickets) } },
      select: { id: true, subject: true, guestEmail: true, guestName: true, ratingComment: true, number: true, status: true, messages: { select: { body: true } } },
    });
    const byId = Object.fromEntries(tickets.map((t) => [t.id, t]));
    for (const name of ["closedOld", "resolvedOld"]) {
      const t = byId[ids.tickets[name]!]!;
      expect(t).toMatchObject({ subject: ERASED_TEXT, guestEmail: null, guestName: null, ratingComment: null });
      expect(t.messages.map((m) => m.body)).toEqual([ERASED_TEXT]);
      expect(t.number).toBeGreaterThan(0);
    }
    for (const name of ["closedRecent", "openOld"]) {
      const t = byId[ids.tickets[name]!]!;
      expect(t.subject).toContain(prefix);
      expect(t.messages.map((m) => m.body)).toEqual(["My booking BT-TEST1 and my phone"]);
    }

    const reports = await db.report.findMany({
      where: { id: { in: Object.values(ids.reports) } },
      select: { id: true, details: true, adminNote: true, resolution: true, reason: true, actionTaken: true },
    });
    const byReport = Object.fromEntries(reports.map((r) => [r.id, r]));
    expect(byReport[ids.reports.decidedOld!]).toMatchObject({ details: null, adminNote: null, resolution: null, reason: "OTHER", actionTaken: "resolved" });
    expect(byReport[ids.reports.dismissedRecent!]!.details).toBe("What happened, with a name");
    expect(byReport[ids.reports.open!]!.details).toBe("What happened, with a name");

    // A second run changes nothing.
    expect(await eraseClosedCaseTexts(NOW, scope)).toEqual({ tickets: 0, messages: 0, reports: 0 });
  });
});
