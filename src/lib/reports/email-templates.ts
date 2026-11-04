/**
 * The report emails (round 3, brief 8.2): their data and layout. Pure (no server imports), like
 * src/lib/email/templates.ts, which registers them. Text lives in messages/<locale>/emails.json
 * under templates.<template>.* and templates.report_reasons.*.
 *
 * Only TYPES are imported from the email module, so the two files never load each other at run
 * time.
 */
import type { EmailBlock, EmailContent, TemplateContext } from "@/lib/email/templates";

export const REPORT_EMAIL_TEMPLATES = [
  "report_received",
  "report_admin",
  "report_host_listings_hidden",
  "report_reporter_revealed",
] as const;
export type ReportEmailTemplate = (typeof REPORT_EMAIL_TEMPLATES)[number];

/** Report reasons the emails can name (a ReportReason). Anything else reads as "Other". */
const REASONS = [
  "CANCELLED_FOR_IDENTITY",
  "ASKED_RELIGION_OR_ORIGIN",
  "REFUSED_OR_IGNORED",
  "FAKE_LISTING",
  "ALREADY_RENTED",
  "WRONG_PRICE",
  "ASKED_MONEY_UPFRONT",
  "OFFENSIVE",
  "OTHER",
] as const;

/** A day "YYYY-MM-DD" or a date. */
type DateValue = Date | string;

export type ReportEmailData = {
  /** To the guest: their turned-away report arrived (the on-screen confirmation's twin). */
  report_received: {
    name?: string | null;
    bookingCode?: string | null;
    listingTitle?: string | null;
    happenedOn?: DateValue | null;
    /** "My trips" or the trip page. */
    tripsUrl?: string | null;
  };
  /** To the founder (ADMIN_ALERT_EMAIL): a report came in. Turned-away reports are urgent. */
  report_admin: {
    kind: "TURNED_AWAY" | "GENERAL";
    /** A ReportReason. */
    reason: string;
    /** LISTING | USER | REVIEW | MESSAGE */
    targetType: string;
    listingTitle?: string | null;
    listingPublicId?: number | null;
    hostName?: string | null;
    bookingCode?: string | null;
    happenedOn?: DateValue | null;
    screenshots: number;
    /** The report's page in the admin panel. */
    adminUrl: string;
  };
  /** To the host: staff took all their listings off the site after a report. */
  report_host_listings_hidden: {
    name?: string | null;
    count: number;
    /** The staff reason (label and explanation) in the host's language, plus the staff note. */
    reasonText: string;
  };
  /**
   * To the host: the founder chose to tell them who reported (Report.reporterRevealedAt). The
   * only email that names the reporter, and only by first name.
   */
  report_reporter_revealed: {
    name?: string | null;
    reporterName: string;
    bookingCode?: string | null;
    listingTitle?: string | null;
    happenedOn?: DateValue | null;
    /** A ReportReason. */
    reason: string;
    /** From staff to the host, already in the host's language. */
    note?: string | null;
  };
};

type ReportBuilder<K extends ReportEmailTemplate> = (data: ReportEmailData[K], ctx: TemplateContext) => EmailContent;
type DetailRow = { label: string; value: string; ltr?: boolean };

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** User text inside a sentence keeps its own direction (FSI … PDI), as in the other emails. */
function isolate(value: string): string {
  return value ? `⁨${value}⁩` : value;
}

function reasonLabel(reason: string, ctx: TemplateContext): string {
  const code = (REASONS as readonly string[]).includes(reason) ? reason : "OTHER";
  return ctx.t(`templates.report_reasons.${code}`);
}

/** The rows every report email may show: booking, place, the day it happened. */
function reportRows(
  data: { bookingCode?: string | null; listingTitle?: string | null; listingPublicId?: number | null; happenedOn?: DateValue | null },
  ctx: TemplateContext,
): DetailRow[] {
  const { t, formatDate } = ctx;
  const rows: DetailRow[] = [];
  if (clean(data.bookingCode)) rows.push({ label: t("booking.codeLabel"), value: clean(data.bookingCode), ltr: true });
  if (clean(data.listingTitle)) {
    const id = data.listingPublicId ? ` (ID ${data.listingPublicId})` : "";
    rows.push({ label: t("booking.placeLabel"), value: `${clean(data.listingTitle)}${id}` });
  }
  if (data.happenedOn) rows.push({ label: t("templates.report_received.whenLabel"), value: formatDate(data.happenedOn) });
  return rows;
}

export const reportEmailBuilders: { [K in ReportEmailTemplate]: ReportBuilder<K> } = {
  report_received: (data, ctx) => {
    const { t, url, page, brand } = ctx;
    const rows = reportRows(data, ctx);
    const blocks: EmailBlock[] = [{ type: "paragraph", text: t("templates.report_received.body1") }];
    if (rows.length) blocks.push({ type: "details", rows });
    blocks.push(
      { type: "paragraph", text: t("templates.report_received.body2") },
      { type: "notice", text: t("templates.report_received.body3", { brand }) },
    );
    return {
      subject: t("templates.report_received.subject", { brand }),
      preheader: t("templates.report_received.preheader"),
      heading: t("templates.report_received.heading"),
      greetingName: clean(data.name) || null,
      blocks,
      cta: { label: t("templates.report_received.cta"), url: url(data.tripsUrl) ?? page("/account/trips") },
      audience: "account",
    };
  },

  report_admin: (data, ctx) => {
    const { t, url, page } = ctx;
    const urgent = data.kind === "TURNED_AWAY";
    const key = urgent ? "templates.report_admin.urgent" : "templates.report_admin.general";
    const reason = reasonLabel(data.reason, ctx);
    const host = clean(data.hostName);
    const target = ["LISTING", "USER", "REVIEW", "MESSAGE"].includes(data.targetType) ? data.targetType : "USER";
    const rows: DetailRow[] = [
      { label: t("templates.report_admin.reasonLabel"), value: reason },
      { label: t("templates.report_admin.targetLabel"), value: t(`templates.report_admin.target.${target}`) },
    ];
    if (host) rows.push({ label: t("booking.hostLabel"), value: host });
    rows.push(...reportRows(data, ctx));
    if (data.screenshots > 0) rows.push({ label: t("templates.report_admin.screenshotsLabel"), value: t("templates.report_admin.screenshots", { count: data.screenshots }) });
    return {
      subject: t(`${key}.subject`, { reason, host: host ? isolate(host) : "-" }),
      preheader: t(`${key}.body`),
      heading: t(`${key}.heading`),
      greetingName: null,
      blocks: [
        { type: "paragraph", text: t(`${key}.body`) },
        { type: "details", rows },
        { type: "paragraph", text: t("templates.report_admin.next") },
        { type: "notice", text: t("templates.report_admin.privacy") },
      ],
      cta: { label: t("templates.report_admin.cta"), url: url(data.adminUrl) ?? page("/admin/reports") },
      audience: "account",
    };
  },

  report_host_listings_hidden: (data, { t, page, brand }) => ({
    subject: t("templates.report_host_listings_hidden.subject", { brand }),
    preheader: t("templates.report_host_listings_hidden.preheader"),
    heading: t("templates.report_host_listings_hidden.heading"),
    greetingName: clean(data.name) || null,
    blocks: [
      { type: "paragraph", text: t("templates.report_host_listings_hidden.body1", { count: Math.max(1, data.count) }) },
      { type: "quote", label: t("templates.report_host_listings_hidden.reasonLabel"), text: clean(data.reasonText) },
      { type: "paragraph", text: t("templates.report_host_listings_hidden.body2", { brand }) },
    ],
    cta: { label: t("templates.report_host_listings_hidden.cta"), url: page("/help/new-ticket") },
    audience: "account",
  }),

  report_reporter_revealed: (data, ctx) => {
    const { t, page, brand } = ctx;
    const rows: DetailRow[] = [
      { label: t("templates.report_reporter_revealed.reporterLabel"), value: clean(data.reporterName) },
      { label: t("templates.report_reporter_revealed.reasonLabel"), value: reasonLabel(data.reason, ctx) },
      ...reportRows(data, ctx),
    ];
    const blocks: EmailBlock[] = [
      { type: "paragraph", text: t("templates.report_reporter_revealed.body1") },
      { type: "details", rows },
    ];
    if (clean(data.note)) blocks.push({ type: "quote", label: t("templates.report_reporter_revealed.noteLabel"), text: clean(data.note) });
    blocks.push({ type: "paragraph", text: t("templates.report_reporter_revealed.body2", { brand }) });
    return {
      subject: t("templates.report_reporter_revealed.subject", { brand }),
      preheader: t("templates.report_reporter_revealed.preheader"),
      heading: t("templates.report_reporter_revealed.heading"),
      greetingName: clean(data.name) || null,
      blocks,
      cta: { label: t("templates.report_reporter_revealed.cta"), url: page("/help/new-ticket") },
      audience: "account",
    };
  },
};
