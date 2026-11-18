import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "use-intl/core";

/**
 * Round 3, phase 3 (brief 9 "Notifications"): the founder's daily summary (when, which days, at
 * most once a day), Shabbat / Yom Tov in Israel, the founder's review email, and how a host hears
 * about a decision on their listing when email is not available.
 */

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const [file] = namespace.split(".");
    const messages = { [file]: JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, `${file}.json`), "utf8")) };
    return createTranslator({ locale, messages, namespace: namespace as never });
  },
}));

// ─── Mocks for the daily summary and the decision alerts ───────────────
/** The RateLimit claim rows: key → { count (0 pending, 1 sent), resetAt }. */
const claims = new Map<string, { count: number; resetAt: Date }>();
const sentAudits: { details: { day: string } }[] = [];
const db = {
  rateLimit: {
    createMany: vi.fn(async ({ data }: { data: { key: string; count: number; resetAt: Date }[] }) => {
      const row = data[0];
      if (claims.has(row.key)) return { count: 0 };
      claims.set(row.key, { count: row.count, resetAt: row.resetAt });
      return { count: 1 };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { key: string; count?: number; resetAt?: { lt: Date } }; data: { count?: number; resetAt?: Date } }) => {
      const row = claims.get(where.key);
      if (!row) return { count: 0 };
      if (where.count !== undefined && row.count !== where.count) return { count: 0 };
      if (where.resetAt && !(row.resetAt < where.resetAt.lt)) return { count: 0 };
      claims.set(where.key, { ...row, ...data });
      return { count: 1 };
    }),
    deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => {
      claims.delete(where.key);
      return { count: 1 };
    }),
    findFirst: vi.fn(async ({ where }: { where: { key: { lt: string }; count?: { gte: number } } }) => {
      const before = [...claims.entries()]
        .filter(([k, row]) => k < where.key.lt && (!where.count || row.count >= where.count.gte))
        .map(([k]) => k)
        .sort();
      return before.length ? { key: before.at(-1)! } : null;
    }),
  },
  booking: { count: vi.fn(async () => 1) },
  report: { count: vi.fn(async () => 0) },
  auditLog: { count: vi.fn(async () => 0), findMany: vi.fn(async () => [...sentAudits].reverse()) },
};
vi.mock("@/lib/db", () => ({ db }));
const audit = vi.fn(async (entry: { action: string; details?: { day?: string } }) => {
  if (entry.action === "summary.daily_sent" && entry.details?.day) sentAudits.push({ details: { day: entry.details.day } });
});
vi.mock("@/lib/audit", () => ({ audit }));
const loadAttentionCounts = vi.fn(async () => ({
  failed: [] as string[],
  turnedAwayReports: 1,
  inReview: 2,
  otherReports: 0,
  flagCancellations: 0,
  flagHosts: 0,
  flagNoShows: 0,
  hostUnreachable: 0,
  failedEmails: 0,
  outboxWaiting: 3,
}));
vi.mock("@/lib/admin/server/attention", () => ({
  HOST_UNREACHABLE_ACTION: "booking.host_unreachable",
  loadAttentionCounts,
}));
const sendFounderEmail = vi.fn<(template: string, data: unknown) => Promise<boolean>>(async () => true);
vi.mock("./founder-admin", () => ({ sendFounderEmail }));

type Host = { id: string; email: string | null; locale: string; isDemo: boolean; notificationPrefs: unknown; telegramChatId: string | null; pushDevices: number };
let host: Host | null = null;
const fullEnv = { resend: true, outboxCounts: false, telegram: true, push: true };
let env = { ...fullEnv };
vi.mock("./host", () => ({
  loadAlertHost: async () => host,
  hostAlertTarget: (h: Host) => ({ email: h.email, isDemo: h.isDemo, prefs: h.notificationPrefs, telegramChatId: h.telegramChatId, pushDevices: h.pushDevices }),
  alertEnvironment: () => env,
  localeOfUser: (h: Host) => h.locale,
}));
const sendEmail = vi.fn<(input: unknown) => Promise<{ ok: boolean; delivery: string }>>(async () => ({ ok: true, delivery: "sent" }));
vi.mock("@/lib/email", () => ({ notificationEmailFor: (h: Host) => h.email, sendEmail }));
const pushToUser = vi.fn<(userId: string, payload: unknown) => Promise<{ accepted: number }>>(async () => ({ accepted: 1 }));
vi.mock("./push", () => ({ pushToUser }));
const sendTelegramMessage = vi.fn<(chatId: string, text: string) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
vi.mock("./telegram", () => ({ sendTelegramMessage }));

const { addDays, daysBetween, summaryDue, summaryMoment, summaryPeriod, zonedClock, zonedDayStart, SUMMARY_LAST_HOUR } = await import("./summary-schedule");
const { isIsraelRestTime, runDailySummary, SEND_TIMEOUT_MS } = await import("./daily-summary");
const { fallbackChannels, planListingDecision } = await import("./listing-decision-rules");
const { notifyListingDecision } = await import("./listing-decision");
const { adminEmailBuilders } = await import("./founder-email-templates");

const notRest = () => false;

beforeEach(() => {
  claims.clear();
  sentAudits.length = 0;
  vi.clearAllMocks();
  host = null;
  env = { ...fullEnv };
});

describe("daily summary schedule (08:00 Israel time)", () => {
  it("reads Israel's clock in winter and in summer", () => {
    expect(zonedClock(new Date("2026-11-04T06:00:00Z"))).toEqual({ day: "2026-11-04", hour: 8, minute: 0 });
    expect(zonedClock(new Date("2026-07-01T05:00:00Z"))).toEqual({ day: "2026-07-01", hour: 8, minute: 0 });
    expect(zonedDayStart("2026-11-04").toISOString()).toBe("2026-11-03T22:00:00.000Z");
    expect(zonedDayStart("2026-07-01").toISOString()).toBe("2026-06-30T21:00:00.000Z");
    expect(summaryMoment("2026-11-04").toISOString()).toBe("2026-11-04T06:00:00.000Z");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-11-01", "2026-11-04")).toBe(3);
  });

  it("is due from 08:00 until the end of the morning window, never before or in the evening", () => {
    expect(summaryDue(new Date("2026-11-04T05:59:00Z"), notRest)).toEqual({ send: false, day: "2026-11-04", reason: "too_early" });
    expect(summaryDue(new Date("2026-11-04T06:03:00Z"), notRest)).toEqual({ send: true, day: "2026-11-04" });
    expect(SUMMARY_LAST_HOUR).toBe(11);
    expect(summaryDue(new Date("2026-11-04T09:59:00Z"), notRest).send).toBe(true);
    expect(summaryDue(new Date("2026-11-04T10:00:00Z"), notRest)).toEqual({ send: false, day: "2026-11-04", reason: "too_late" });
    // Both vercel.json runs (05:03 and 06:03 UTC) land in the window in summer and in winter.
    expect(summaryDue(new Date("2026-07-01T05:03:00Z"), notRest).send).toBe(true);
    expect(summaryDue(new Date("2026-07-01T06:03:00Z"), notRest).send).toBe(true);
    expect(summaryDue(new Date("2026-11-04T05:03:00Z"), notRest).send).toBe(false);
    expect(summaryDue(new Date("2026-11-04T06:03:00Z"), notRest).send).toBe(true);
  });

  it("knows Shabbat and Yom Tov in Israel (Jerusalem times)", () => {
    expect(isIsraelRestTime(new Date("2026-11-06T06:00:00Z"))).toBe(false); // Friday morning
    expect(isIsraelRestTime(new Date("2026-11-07T06:00:00Z"))).toBe(true); // Shabbat
    expect(isIsraelRestTime(new Date("2026-11-07T18:00:00Z"))).toBe(false); // after Havdalah
    expect(isIsraelRestTime(new Date("2026-09-21T05:00:00Z"))).toBe(true); // Yom Kippur
    expect(isIsraelRestTime(new Date("2026-09-13T05:00:00Z"))).toBe(true); // Rosh Hashana, day 2
    expect(isIsraelRestTime(new Date("2026-09-27T05:00:00Z"))).toBe(false); // Chol HaMoed Sukkot
    expect(isIsraelRestTime(new Date("2026-04-03T05:00:00Z"))).toBe(false); // Pesach day 2: weekday in Israel
  });

  it("is not sent on Shabbat", () => {
    expect(summaryDue(new Date("2026-11-07T06:03:00Z"), isIsraelRestTime)).toEqual({ send: false, day: "2026-11-07", reason: "rest_day" });
  });

  it("covers yesterday, and on Sunday also Shabbat (and Friday)", () => {
    expect(summaryPeriod("2026-11-05", isIsraelRestTime)).toMatchObject({ fromDay: "2026-11-04", toDay: "2026-11-04" });
    const sunday = summaryPeriod("2026-11-08", isIsraelRestTime);
    expect(sunday).toMatchObject({ fromDay: "2026-11-06", toDay: "2026-11-07" });
    expect(sunday.from.toISOString()).toBe("2026-11-05T22:00:00.000Z");
    expect(sunday.to.toISOString()).toBe("2026-11-07T22:00:00.000Z");
  });

  it("starts from the previous summary that went out, when known", () => {
    expect(summaryPeriod("2026-11-05", notRest, "2026-11-02")).toMatchObject({ fromDay: "2026-11-02", toDay: "2026-11-04" });
    // Older than a week: the last 7 days (no cliff between 7 and 8 missed days).
    expect(summaryPeriod("2026-11-20", notRest, "2026-11-13")).toMatchObject({ fromDay: "2026-11-13", toDay: "2026-11-19" });
    expect(summaryPeriod("2026-11-20", notRest, "2026-11-12")).toMatchObject({ fromDay: "2026-11-13", toDay: "2026-11-19" });
    expect(summaryPeriod("2026-11-20", notRest, "2026-11-02")).toMatchObject({ fromDay: "2026-11-13", toDay: "2026-11-19" });
    // Not before today: the normal walk back.
    expect(summaryPeriod("2026-11-05", notRest, "2026-11-05")).toMatchObject({ fromDay: "2026-11-04" });
  });
});

describe("the daily summary's cron schedule (vercel.json)", () => {
  const schedule = (): { minute: number; hours: number[] } => {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
    const cron = config.crons.find((c) => c.path === "/api/cron/daily-summary");
    if (!cron) throw new Error("no daily-summary cron");
    const [minute, hour] = cron.schedule.split(" ");
    const hours = hour.split(",").flatMap((part) => {
      const [a, b] = part.split("-").map(Number);
      return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
    });
    return { minute: Number(minute), hours };
  };

  it("has at least two runs inside the sending window in winter and in summer (a failed send is retried)", () => {
    const { minute, hours } = schedule();
    for (const day of ["2026-12-09", "2026-06-10"]) {
      const sending = hours.filter((h) => summaryDue(new Date(`${day}T${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`), notRest).send);
      expect(sending.length, day).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("runDailySummary", () => {
  it("sends at most once per Israel day, whatever runs it", async () => {
    const first = await runDailySummary(new Date("2026-11-04T06:03:00Z"), notRest);
    expect(first).toEqual({ status: "sent", day: "2026-11-04", fromDay: "2026-11-03", toDay: "2026-11-03" });
    expect(sendFounderEmail).toHaveBeenCalledTimes(1);
    const [template, data] = sendFounderEmail.mock.calls[0] as [string, Record<string, unknown>];
    expect(template).toBe("admin_daily_summary");
    expect(data).toMatchObject({ fromDay: "2026-11-03", toDay: "2026-11-03", waiting: { turnedAwayReports: 1, inReview: 2 }, adminUrl: "/admin" });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "summary.daily_sent" }));

    const again = await runDailySummary(new Date("2026-11-04T07:03:00Z"), notRest);
    expect(again).toEqual({ status: "already_sent", day: "2026-11-04" });
    expect(sendFounderEmail).toHaveBeenCalledTimes(1);
  });

  it("does nothing before 08:00, late in the day or on Shabbat", async () => {
    expect((await runDailySummary(new Date("2026-11-04T04:00:00Z"), notRest)).status).toBe("too_early");
    expect((await runDailySummary(new Date("2026-11-04T16:00:00Z"), notRest)).status).toBe("too_late");
    expect((await runDailySummary(new Date("2026-11-07T06:03:00Z"), isIsraelRestTime)).status).toBe("rest_day");
    expect(sendFounderEmail).not.toHaveBeenCalled();
    expect(claims.size).toBe(0);
  });

  it("releases the day when nothing could be sent, so the next run tries again", async () => {
    sendFounderEmail.mockResolvedValueOnce(false);
    expect((await runDailySummary(new Date("2026-11-04T06:03:00Z"), notRest)).status).toBe("failed");
    expect(claims.size).toBe(0);
    expect((await runDailySummary(new Date("2026-11-04T07:03:00Z"), notRest)).status).toBe("sent");
  });

  it("a run killed while sending leaves a pending claim: a run 6 minutes later takes it over and sends", async () => {
    // The killed run: claimed 2026-11-04 at 06:03, never marked it sent, never audited.
    const killedAt = new Date("2026-11-04T06:03:00Z");
    claims.set("founder-summary:2026-11-04", { count: 0, resetAt: new Date(killedAt.getTime() + 8 * 86_400_000) });
    // Two minutes later it may still be running: nothing is sent twice.
    expect((await runDailySummary(new Date("2026-11-04T06:05:00Z"), notRest)).status).toBe("already_sent");
    const later = await runDailySummary(new Date("2026-11-04T06:09:00Z"), notRest);
    expect(later.status).toBe("sent");
    expect(sendFounderEmail).toHaveBeenCalledTimes(1);
    expect(claims.get("founder-summary:2026-11-04")?.count).toBe(1);
  });

  it("the next summary starts at the last day a summary really went out", async () => {
    await runDailySummary(new Date("2026-11-02T06:03:00Z"), notRest);
    // 2026-11-03: claimed, then killed (pending, never sent).
    claims.set("founder-summary:2026-11-03", { count: 0, resetAt: new Date("2026-11-11T06:03:00Z") });
    const result = await runDailySummary(new Date("2026-11-04T06:03:00Z"), notRest);
    expect(result).toEqual({ status: "sent", day: "2026-11-04", fromDay: "2026-11-02", toDay: "2026-11-03" });
  });

  it("once the claims are pruned, the audit entry of the last summary sent is the start", async () => {
    sentAudits.push({ details: { day: "2026-10-30" } });
    const result = await runDailySummary(new Date("2026-11-04T06:03:00Z"), notRest);
    expect(result).toEqual({ status: "sent", day: "2026-11-04", fromDay: "2026-10-30", toDay: "2026-11-03" });
  });

  it("an email that hangs is given up after the timeout and the day released", async () => {
    vi.useFakeTimers();
    try {
      sendFounderEmail.mockImplementationOnce(() => new Promise<boolean>(() => undefined));
      const run = runDailySummary(new Date("2026-11-04T06:03:00Z"), notRest);
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS + 1);
      expect((await run).status).toBe("failed");
      expect(claims.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a waiting count that failed would read 'nothing waiting': no summary now, the day stays open", async () => {
    loadAttentionCounts.mockResolvedValueOnce({ ...(await loadAttentionCounts()), failed: ["turnedAwayReports"] });
    loadAttentionCounts.mockClear();
    expect((await runDailySummary(new Date("2026-11-04T06:03:00Z"), notRest)).status).toBe("failed");
    expect(sendFounderEmail).not.toHaveBeenCalled();
    expect(claims.size).toBe(0);
    expect((await runDailySummary(new Date("2026-11-04T07:03:00Z"), notRest)).status).toBe("sent");
  });

  it("covers the days since the previous summary", async () => {
    await runDailySummary(new Date("2026-11-02T06:03:00Z"), notRest);
    const result = await runDailySummary(new Date("2026-11-05T06:03:00Z"), notRest);
    expect(result).toEqual({ status: "sent", day: "2026-11-05", fromDay: "2026-11-02", toDay: "2026-11-04" });
  });
});

describe("founder emails", () => {
  const ctx = async (locale = "he") => {
    const messages = { emails: JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, "emails.json"), "utf8")) };
    const t = createTranslator({ locale, messages, namespace: "emails" });
    return {
      t: t as never,
      tb: t as never,
      url: (p: string) => `https://bayit.example${p}`,
      page: (p: string) => `https://bayit.example${p}`,
      formatDate: (d: unknown) => String(d),
    } as never;
  };

  it("marks a flagged host's listing as urgent", async () => {
    const data = { listingTitle: "Flat", listingPublicId: 1234, why: ["flagged_host"], adminUrl: "/admin/moderation/l1" };
    const urgent = adminEmailBuilders.admin_review_needed(data, await ctx());
    expect(urgent.subject).toMatch(/^דחוף/);
    expect(urgent.subject).toContain("1234");
    const normal = adminEmailBuilders.admin_review_needed({ ...data, why: ["first_listing"] }, await ctx());
    expect(normal.subject).not.toMatch(/^דחוף/);
  });

  it("puts turned-away reports in the daily summary's subject", async () => {
    const data = {
      fromDay: "2026-11-03",
      toDay: "2026-11-03",
      waiting: { turnedAwayReports: 1, inReview: 0, otherReports: 0, flagCancellations: 0, flagHosts: 0, flagNoShows: 0, failedEmails: 0 },
      period: { bookings: 0, cancelledByGuest: 0, cancelledByHost: 0, flaggedCancellations: 0, noShows: 0, reports: 1, turnedAwayReports: 1, hostUnreachable: 0 },
      adminUrl: "/admin",
    };
    const email = adminEmailBuilders.admin_daily_summary(data, await ctx());
    expect(email.subject).toMatch(/^דחוף/);
    const calm = adminEmailBuilders.admin_daily_summary({ ...data, waiting: { ...data.waiting, turnedAwayReports: 0 } }, await ctx());
    expect(calm.subject).not.toMatch(/^דחוף/);
  });
});

describe("how a host hears about a decision on their listing", () => {
  const ready = (channel: "email" | "telegram" | "push") => ({ channel, state: "ready" as const, ready: true, confirms: channel !== "push" });

  it("emails when the account has a working address, other channels only as a fallback", () => {
    const plan = planListingDecision({ email: "host@example.com", emailFailing: false, channels: [ready("email"), ready("telegram"), ready("push")] });
    expect(plan).toEqual({ email: true, fallback: ["telegram", "push"] });
    expect(fallbackChannels(plan, true)).toEqual([]);
    expect(fallbackChannels(plan, false)).toEqual(["telegram", "push"]);
  });

  it("uses Telegram and notifications for a phone-only account or a paused address", () => {
    expect(planListingDecision({ email: null, emailFailing: false, channels: [ready("telegram")] })).toEqual({ email: false, fallback: ["telegram"] });
    const paused = planListingDecision({ email: "host@example.com", emailFailing: true, channels: [ready("push")] });
    expect(paused).toEqual({ email: false, fallback: ["push"] });
    expect(fallbackChannels(paused, false)).toEqual(["push"]);
  });

  it("sends the email, and nothing else, to a host with email", async () => {
    host = { id: "h1", email: "host@example.com", locale: "he", isDemo: false, notificationPrefs: {}, telegramChatId: "42", pushDevices: 1 };
    const result = await notifyListingDecision({
      ownerId: "h1",
      kind: "approved",
      listingTitle: "Flat",
      path: "/listing/1234-flat",
      email: { template: "listing_approved", data: { ownerName: "Yossi", listingTitle: "Flat", listingUrl: "/listing/1234-flat" } },
    });
    expect(result).toEqual({ email: true, telegram: false, push: false });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "host@example.com", template: "listing_approved", outboxOnly: false }));
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("reaches a phone-only host by Telegram and notification, in their language", async () => {
    host = { id: "h2", email: null, locale: "ru", isDemo: false, notificationPrefs: {}, telegramChatId: "42", pushDevices: 2 };
    const result = await notifyListingDecision({
      ownerId: "h2",
      kind: "needs_changes",
      listingTitle: "Flat",
      path: "/account/listings",
      email: { template: "listing_needs_changes", data: { ownerName: "Yossi", listingTitle: "Flat", listingUrl: "/account/listings", reasonText: "x" } },
    });
    expect(result).toEqual({ email: false, telegram: true, push: true });
    expect(sendEmail).not.toHaveBeenCalled();
    const [chatId, text] = sendTelegramMessage.mock.calls[0] as [string, string];
    expect(chatId).toBe("42");
    expect(text).toContain("Flat");
    expect(text).toMatch(/\/ru\/account\/listings/);
    expect(pushToUser).toHaveBeenCalledWith("h2", expect.objectContaining({ url: "/ru/account/listings", tag: "listing-decision-needs_changes" }));
  });

  it("falls back when the email could not be sent", async () => {
    host = { id: "h3", email: "host@example.com", locale: "en", isDemo: false, notificationPrefs: {}, telegramChatId: null, pushDevices: 1 };
    sendEmail.mockResolvedValueOnce({ ok: false, delivery: "failed" });
    const result = await notifyListingDecision({
      ownerId: "h3",
      kind: "rejected",
      listingTitle: "Flat",
      path: "/account/listings",
      email: { template: "listing_rejected", data: { ownerName: "Yossi", listingTitle: "Flat", reasonText: "x" } },
    });
    expect(result).toEqual({ email: false, telegram: false, push: true });
  });

  it("an email only logged (Resend not set up) is no delivery: Telegram and notifications are tried", async () => {
    env = { resend: false, outboxCounts: false, telegram: true, push: true };
    host = { id: "h5", email: "host@example.com", locale: "he", isDemo: false, notificationPrefs: {}, telegramChatId: "42", pushDevices: 1 };
    sendEmail.mockResolvedValueOnce({ ok: true, delivery: "logged" });
    const result = await notifyListingDecision({
      ownerId: "h5",
      kind: "approved",
      listingTitle: "Flat",
      path: "/listing/1234-flat",
      email: { template: "listing_approved", data: { ownerName: "Yossi", listingTitle: "Flat", listingUrl: "/listing/1234-flat" } },
    });
    // The email is still written to the outbox (to send again later).
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ email: false, telegram: true, push: true });
  });

  it("a demo host's logged email counts (the outbox is their channel): no fallback", async () => {
    env = { resend: false, outboxCounts: false, telegram: true, push: true };
    host = { id: "h6", email: "demo@example.com", locale: "he", isDemo: true, notificationPrefs: {}, telegramChatId: "42", pushDevices: 1 };
    sendEmail.mockResolvedValueOnce({ ok: true, delivery: "logged" });
    const result = await notifyListingDecision({
      ownerId: "h6",
      kind: "approved",
      listingTitle: "Flat",
      path: "/listing/1-flat",
      email: { template: "listing_approved", data: { ownerName: "Demo", listingTitle: "Flat", listingUrl: "/listing/1-flat" } },
    });
    expect(result).toEqual({ email: true, telegram: false, push: false });
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("keeps a demo host's email in the outbox", async () => {
    host = { id: "h4", email: "demo@example.com", locale: "he", isDemo: true, notificationPrefs: {}, telegramChatId: null, pushDevices: 0 };
    await notifyListingDecision({
      ownerId: "h4",
      kind: "approved",
      listingTitle: "Flat",
      path: "/listing/1-flat",
      email: { template: "listing_approved", data: { ownerName: "Demo", listingTitle: "Flat", listingUrl: "/listing/1-flat" } },
    });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ outboxOnly: true }));
  });
});
