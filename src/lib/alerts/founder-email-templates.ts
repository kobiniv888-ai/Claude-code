/**
 * Founder-only emails of the admin panel (round 3, brief 9 "Notifications"): their data and layout.
 * Pure (no server imports), like src/lib/email/templates.ts, which registers them. Text lives in
 * messages/<locale>/emails.json under templates.<template>.* (the founder reads Hebrew; the other
 * languages are there for other admins).
 *
 * - admin_review_needed: a listing entered the review queue (why: first listing, flagged host, risk…).
 *   Sent by ./founder-admin.ts.
 * - admin_daily_summary: the 08:00 Israel-time summary (./daily-summary.ts).
 *
 * The report emails to the founder are the reports module's ("report_admin").
 * Only TYPES are imported from the email module, so the two files never load each other at run time.
 */
import type { EmailBlock, EmailContent, TemplateContext } from "@/lib/email/templates";

export const ADMIN_EMAIL_TEMPLATES = ["admin_review_needed", "admin_daily_summary"] as const;
export type AdminEmailTemplate = (typeof ADMIN_EMAIL_TEMPLATES)[number];

/** Why a listing waits (src/lib/listing/review-rule.ts SubmitDecision.why, plus "recheck"). */
export const REVIEW_WHY = ["first_listing", "flagged_host", "risk", "back_to_review", "blocked", "recheck"] as const;
export type ReviewWhy = (typeof REVIEW_WHY)[number];

/** The rows of the daily summary, in order. */
export const SUMMARY_WAITING_KEYS = [
  "turnedAwayReports",
  "inReview",
  "otherReports",
  "flagCancellations",
  "flagHosts",
  "flagNoShows",
  "failedEmails",
] as const;
export const SUMMARY_PERIOD_KEYS = [
  "bookings",
  "cancelledByGuest",
  "cancelledByHost",
  "flaggedCancellations",
  "noShows",
  "reports",
  "turnedAwayReports",
  "hostUnreachable",
] as const;
export type SummaryWaitingKey = (typeof SUMMARY_WAITING_KEYS)[number];
export type SummaryPeriodKey = (typeof SUMMARY_PERIOD_KEYS)[number];

type DateValue = Date | string;

export type AdminEmailData = {
  admin_review_needed: {
    listingTitle: string;
    listingPublicId: number;
    hostName?: string | null;
    /** One or more ReviewWhy codes. */
    why: string[];
    riskScore?: number | null;
    /** How many automatic-check reasons the listing has. */
    riskReasons?: number;
    /** The listing's review page (a site path). */
    adminUrl: string;
  };
  admin_daily_summary: {
    /** The first and last calendar day covered (Israel time, "YYYY-MM-DD"). */
    fromDay: DateValue;
    toDay: DateValue;
    /** Waiting right now. */
    waiting: Record<SummaryWaitingKey, number>;
    /** What happened in the period. */
    period: Record<SummaryPeriodKey, number>;
    adminUrl: string;
  };
};

type AdminBuilder<K extends AdminEmailTemplate> = (data: AdminEmailData[K], ctx: TemplateContext) => EmailContent;

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function isolate(value: string): string {
  return value ? `⁨${value}⁩` : value;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export const adminEmailBuilders: { [K in AdminEmailTemplate]: AdminBuilder<K> } = {
  admin_review_needed: (data, ctx) => {
    const { t, url, page } = ctx;
    const why = (data.why ?? []).filter((w): w is ReviewWhy => (REVIEW_WHY as readonly string[]).includes(w));
    const urgent = why.includes("flagged_host") || why.includes("blocked");
    const title = clean(data.listingTitle);
    const rows: { label: string; value: string; ltr?: boolean }[] = [
      { label: t("booking.placeLabel"), value: `${title} (ID ${data.listingPublicId})` },
    ];
    if (clean(data.hostName)) rows.push({ label: t("booking.hostLabel"), value: clean(data.hostName) });
    rows.push({
      label: t("templates.admin_review_needed.whyLabel"),
      value: (why.length ? why : ["risk" as const]).map((w) => t(`templates.admin_review_needed.why.${w}`)).join(" · "),
    });
    if (typeof data.riskScore === "number") {
      rows.push({
        label: t("templates.admin_review_needed.riskLabel"),
        value: t("templates.admin_review_needed.riskValue", { score: data.riskScore, count: count(data.riskReasons) }),
      });
    }
    return {
      subject: t(urgent ? "templates.admin_review_needed.subjectUrgent" : "templates.admin_review_needed.subject", { id: data.listingPublicId }),
      preheader: t("templates.admin_review_needed.body", { title: isolate(title) }),
      heading: t("templates.admin_review_needed.heading"),
      greetingName: null,
      blocks: [
        { type: "paragraph", text: t("templates.admin_review_needed.body", { title: isolate(title) }) },
        { type: "details", rows },
        { type: "paragraph", text: t("templates.admin_review_needed.next") },
      ],
      cta: { label: t("templates.admin_review_needed.cta"), url: url(data.adminUrl) ?? page("/admin/moderation") },
      audience: "account",
    };
  },

  admin_daily_summary: (data, ctx) => {
    const { t, url, page, formatDate } = ctx;
    const waiting = SUMMARY_WAITING_KEYS.map((key) => ({ key, value: count(data.waiting?.[key]) }));
    const period = SUMMARY_PERIOD_KEYS.map((key) => ({ key, value: count(data.period?.[key]) }));
    const waitingTotal = waiting.reduce((sum, row) => sum + row.value, 0);
    const from = formatDate(data.fromDay);
    const to = formatDate(data.toDay);
    const range = from === to ? from : t("templates.admin_daily_summary.range", { from, to });
    const urgent = count(data.waiting?.turnedAwayReports) > 0;
    const blocks: EmailBlock[] = [
      {
        type: "paragraph",
        text: waitingTotal > 0 ? t("templates.admin_daily_summary.waitingIntro", { count: waitingTotal }) : t("templates.admin_daily_summary.nothingWaiting"),
      },
    ];
    const waitingRows = waiting.filter((row) => row.value > 0);
    if (waitingRows.length) {
      blocks.push({ type: "details", rows: waitingRows.map((row) => ({ label: t(`templates.admin_daily_summary.waiting.${row.key}`), value: String(row.value) })) });
    }
    blocks.push({ type: "paragraph", text: t("templates.admin_daily_summary.periodIntro", { range }) });
    blocks.push({ type: "details", rows: period.map((row) => ({ label: t(`templates.admin_daily_summary.period.${row.key}`), value: String(row.value) })) });
    if (urgent) blocks.push({ type: "notice", text: t("templates.admin_daily_summary.urgentNotice", { count: count(data.waiting.turnedAwayReports) }) });
    return {
      subject: t(urgent ? "templates.admin_daily_summary.subjectUrgent" : "templates.admin_daily_summary.subject", { date: to, count: waitingTotal }),
      preheader: waitingTotal > 0 ? t("templates.admin_daily_summary.waitingIntro", { count: waitingTotal }) : t("templates.admin_daily_summary.nothingWaiting"),
      heading: t("templates.admin_daily_summary.heading"),
      greetingName: null,
      blocks,
      cta: { label: t("templates.admin_daily_summary.cta"), url: url(data.adminUrl) ?? page("/admin") },
      audience: "account",
    };
  },
};
