/**
 * notifyFounderOfReport: the founder hears about every report right away, "turned away" ones as
 * urgent (docs/round-3/phase-3.md). A burst of ordinary reports is capped per hour, but it never
 * uses up the budget of the urgent ones.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  counts: new Map<string, number>(),
  sent: [] as { to: string; template: string; data: Record<string, unknown> }[],
  kind: "GENERAL" as "GENERAL" | "TURNED_AWAY",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async (key: string, { limit }: { limit: number }) => {
    const count = (state.counts.get(key) ?? 0) + 1;
    state.counts.set(key, count);
    return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt: new Date() };
  },
}));
vi.mock("@/lib/alerts/founder", () => ({
  FOUNDER_OUTBOX_ADDRESS: "admin-alerts@outbox.invalid",
  founderAlertRecipients: async () => [{ to: "founder@example.com", locale: "he" }],
}));
vi.mock("@/lib/email", () => ({
  notificationEmailFor: () => null,
  sendEmail: async (input: { to: string; template: string; data: Record<string, unknown> }) => {
    state.sent.push({ to: input.to, template: input.template, data: input.data });
    return { ok: true, delivery: "logged" };
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    report: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        kind: state.kind,
        reason: state.kind === "TURNED_AWAY" ? "CANCELLED_FOR_IDENTITY" : "WRONG_PRICE",
        targetType: state.kind === "TURNED_AWAY" ? "USER" : "LISTING",
        happenedOn: null,
        attachments: [],
        listing: { title: "Flat", publicId: 1234, owner: { name: "Host", businessName: null } },
        targetUser: null,
        booking: null,
        reporter: null,
      }),
    },
  },
}));

const { FOUNDER_REPORT_EMAILS_PER_HOUR, founderReportBudget, notifyFounderOfReport } = await import("./notify");

describe("notifyFounderOfReport", () => {
  beforeEach(() => {
    state.counts.clear();
    state.sent.length = 0;
    state.kind = "GENERAL";
  });

  it("caps ordinary reports per hour, but a turned-away report after a burst still goes out", async () => {
    for (let i = 0; i <= FOUNDER_REPORT_EMAILS_PER_HOUR; i++) await notifyFounderOfReport(`general-${i}`);
    expect(state.sent).toHaveLength(FOUNDER_REPORT_EMAILS_PER_HOUR);

    state.kind = "TURNED_AWAY";
    await notifyFounderOfReport("urgent-1");
    expect(state.sent).toHaveLength(FOUNDER_REPORT_EMAILS_PER_HOUR + 1);
    expect(state.sent.at(-1)).toMatchObject({ to: "founder@example.com", template: "report_admin", data: { kind: "TURNED_AWAY" } });
  });

  it("urgent reports draw from their own, larger budget", () => {
    const urgent = founderReportBudget("TURNED_AWAY");
    const general = founderReportBudget("GENERAL");
    expect(urgent.key).not.toBe(general.key);
    expect(urgent.limit).toBeGreaterThanOrEqual(general.limit);
  });
});
