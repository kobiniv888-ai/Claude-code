/**
 * The founder's security alerts against the local database (src/lib/security/alerts.ts;
 * SECURITY_REPORT 16.3, 4.7.a, 3.8.c; founder's answers 6 and 9): what the hourly job counts from
 * the security event log, the audit log and new accounts, and which support tickets wait for our
 * reply. Uses a window in 2001, so only this test's own rows fall in it; creates fake users,
 * events, an audit row and tickets, and removes them all.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { collectSecuritySignals, waitingSupportTickets } = await import("@/lib/security/alerts");
const { evaluateSecurityAlerts } = await import("@/lib/security/alerts-rules");

const prefix = `sa${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const SINCE = new Date("2001-03-04T10:00:00Z");
const NOW = new Date("2001-03-04T11:00:00Z");
const IN = new Date("2001-03-04T10:30:00Z");
const ticketIds: string[] = [];

async function events(type: string, n: number, extra: { ipHash?: string; userId?: string; meta?: object; at?: Date } = {}) {
  await db.securityEvent.createMany({
    data: Array.from({ length: n }, () => ({ type, ipHash: extra.ipHash ?? null, userId: extra.userId ?? null, meta: extra.meta ?? undefined, createdAt: extra.at ?? IN })),
  });
}

beforeAll(async () => {
  // Six new accounts in the window, five of them first signed in from the same connection.
  for (let i = 0; i < 6; i++) {
    const id = `${prefix}-u${i}`;
    await db.user.create({ data: { id, name: `Test ${i}`, email: `${id}@example.com`, createdAt: IN } });
    await events("login_success", 1, { userId: id, ipHash: i < 5 ? `${prefix}-ip-a` : `${prefix}-ip-b` });
  }
  await events("login_failed", 16, { ipHash: `${prefix}-ip-a` });
  await events("id_not_found", 4, { ipHash: `${prefix}-ip-c`, meta: { kind: "trip" } });
  await events("new_device_login", 1, { userId: `${prefix}-u0`, meta: { staff: true, host: false } });
  await events("new_device_login", 2, { userId: `${prefix}-u1`, meta: { staff: false, host: true } });
  await events("maintenance_mode_changed", 1, { meta: { on: true } });
  await events("totp_locked", 1);
  // Outside the window: not counted.
  await events("totp_locked", 3, { at: new Date("2001-03-04T09:00:00Z") });
  await db.auditLog.create({ data: { action: "user.role_change", targetType: "User", targetId: `${prefix}-u2`, createdAt: IN, details: { from: "USER", to: "SUPPORT" } } });

  // Tickets: waiting (user wrote, no reply), answered (staff replied last), answered then the user wrote
  // again, only an internal note after the user's message, and a resolved one.
  const make = async (name: string, status: "OPEN" | "IN_PROGRESS" | "WAITING_FOR_USER" | "RESOLVED", messages: { staff?: boolean; internal?: boolean; at: string }[]) => {
    const ticket = await db.ticket.create({
      data: { userId: `${prefix}-u5`, category: "OTHER", subject: `${prefix} ${name}`, status, createdAt: new Date(messages[0]?.at ?? "2001-03-01T08:00:00Z") },
      select: { id: true, number: true },
    });
    ticketIds.push(ticket.id);
    for (const m of messages) {
      await db.ticketMessage.create({ data: { ticketId: ticket.id, body: "Test message", fromStaff: !!m.staff, internal: !!m.internal, createdAt: new Date(m.at) } });
    }
    return ticket;
  };
  tickets.waiting = await make("waiting", "OPEN", [{ at: "2001-03-01T08:00:00Z" }, { at: "2001-03-01T09:00:00Z" }]);
  tickets.answered = await make("answered", "IN_PROGRESS", [{ at: "2001-03-01T08:00:00Z" }, { staff: true, at: "2001-03-01T10:00:00Z" }]);
  tickets.again = await make("again", "IN_PROGRESS", [{ at: "2001-03-01T08:00:00Z" }, { staff: true, at: "2001-03-01T10:00:00Z" }, { at: "2001-03-02T07:00:00Z" }]);
  tickets.noteOnly = await make("note", "OPEN", [{ at: "2001-03-01T08:00:00Z" }, { staff: true, internal: true, at: "2001-03-01T09:00:00Z" }]);
  tickets.resolved = await make("resolved", "RESOLVED", [{ at: "2001-03-01T08:00:00Z" }]);
});

const tickets: Record<string, { id: string; number: number }> = {};

afterAll(async () => {
  await db.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await db.auditLog.deleteMany({ where: { targetId: { startsWith: prefix } } });
  await db.securityEvent.deleteMany({ where: { OR: [{ ipHash: { startsWith: prefix } }, { userId: { startsWith: prefix } }, { createdAt: { gte: new Date("2001-03-04T00:00:00Z"), lt: new Date("2001-03-05T00:00:00Z") } }] } });
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.$disconnect();
});

describe("collectSecuritySignals", () => {
  it("counts the window's events, per-connection maxima, staff devices, role changes and sign-ups", async () => {
    const s = await collectSecuritySignals(SINCE, NOW);
    expect(s.events.login_failed).toBe(16);
    expect(s.events.totp_locked).toBe(1);
    expect(s.perIpMax.login_failed).toBe(16);
    expect(s.perIpMax.id_not_found).toBe(4);
    expect(s.staffNewDevices).toBe(1);
    expect(s.maintenanceOn).toBe(1);
    expect(s.maintenanceOff).toBe(0);
    expect(s.roleChanges).toBe(1);
    expect(s.signupsSite).toBe(6);
    expect(s.signupsPerIpMax).toBe(5);

    const kinds = evaluateSecurityAlerts(s).map((a) => a.kind);
    expect(kinds).toContain("login_failures_ip");
    expect(kinds).toContain("staff_new_device");
    expect(kinds).toContain("role_changed");
    // Five from one connection is the threshold, not above it: no sign-up alert yet.
    expect(kinds).not.toContain("signup_burst");
  });
});

describe("waitingSupportTickets", () => {
  it("open tickets whose last public message is the user's, from the first unanswered one", async () => {
    const waiting = (await waitingSupportTickets()).filter((t) => ticketIds.includes(t.id));
    const byId = Object.fromEntries(waiting.map((t) => [t.id, t.waitingSince.toISOString()]));
    expect(byId[tickets.waiting!.id]).toBe("2001-03-01T08:00:00.000Z");
    expect(byId[tickets.again!.id]).toBe("2001-03-02T07:00:00.000Z");
    // An internal note is not a reply.
    expect(byId[tickets.noteOnly!.id]).toBe("2001-03-01T08:00:00.000Z");
    expect(byId[tickets.answered!.id]).toBeUndefined();
    expect(byId[tickets.resolved!.id]).toBeUndefined();
  });
});
