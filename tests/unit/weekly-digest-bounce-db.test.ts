/**
 * The weekly host digest and bounces (weekly-1), against the local database: a spam complaint or a
 * bounce of the digest switches the digest off (and pauses the address for booking alerts, as for
 * any email), the founder hears about it once, and a later bounce to the address already paused
 * tells nobody again. Emails are captured, not sent. Fake @example.com users, removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sent = vi.hoisted(() => [] as { to: string; template: string }[]);
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (input: { to: string; template: string }) => {
      sent.push({ to: input.to, template: input.template });
      return { ok: true, delivery: "logged" };
    }),
  };
});
vi.mock("@/lib/sms", () => ({ isSmsConfigured: () => false, sendSms: vi.fn(async () => ({ ok: true })) }));

const { db } = await import("@/lib/db");
const { handleEmailBounce } = await import("@/lib/booking/alerts");
const { weeklyStatsEmailOn } = await import("@/lib/alerts/unsubscribe-server");
const { parseAlertPrefs } = await import("@/lib/alerts/rules");

const prefix = `wb${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const host = `${prefix}-host`;
const address = `${host}@example.com`;
const outboxIds: string[] = [];

async function digest(providerId: string) {
  const row = await db.emailOutbox.create({
    data: { to: address, template: "weekly_host_stats", locale: "he", subject: "השבוע", html: "<p>x</p>", status: "SENT", provider: "resend", providerId, createdAt: new Date(Date.now() - 60_000) },
  });
  outboxIds.push(row.id);
  return row;
}

beforeAll(async () => {
  await db.user.create({ data: { id: host, name: "Host Test", firstName: "Host", email: address, locale: "he", phoneNumber: "+995555980001", phoneNumberVerified: true } });
});

afterAll(async () => {
  await db.emailOutbox.deleteMany({ where: { id: { in: outboxIds } } });
  await db.auditLog.deleteMany({ where: { targetId: host } });
  await db.rateLimit.deleteMany({ where: { key: { contains: host } } });
  await db.user.deleteMany({ where: { id: host } });
});

beforeEach(() => {
  sent.length = 0;
});

describe("a complaint about the weekly digest", () => {
  it("switches the digest off, pauses the address, and tells the founder once", async () => {
    expect(await weeklyStatsEmailOn(host)).toBe(true);
    const first = await digest(`${prefix}-d1`);
    const result = await handleEmailBounce({ kind: "complained", emailId: first.providerId!, to: [address], tags: {} });
    expect(result).toMatchObject({ duplicate: false, paused: [host] });
    expect(await weeklyStatsEmailOn(host)).toBe(false);
    const user = await db.user.findUniqueOrThrow({ where: { id: host } });
    expect(parseAlertPrefs(user.notificationPrefs).email.failing).toMatchObject({ reason: "complained", address });
    // Once per founder-alert recipient. Without ADMIN_ALERT_EMAIL the recipients are the real admin
    // accounts, and a test file running in parallel can add one for a moment: count per address
    // (S2 review gate: this failed with 2 alerts under the full run).
    const alerts = sent.filter((s) => s.template === "admin_alert");
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(new Set(alerts.map((a) => a.to)).size).toBe(alerts.length);

    // Another digest to the same, already paused address bounces: nobody is told again.
    sent.length = 0;
    const second = await digest(`${prefix}-d2`);
    const again = await handleEmailBounce({ kind: "bounced", emailId: second.providerId!, to: [address], tags: {} });
    expect(again.duplicate).toBe(false);
    expect(sent.filter((s) => s.template === "admin_alert")).toHaveLength(0);
  });
});
