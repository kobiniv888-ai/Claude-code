/**
 * Email templates: the data each one needs and how it is laid out.
 * Pure (no server imports) so it can be unit-tested and previewed.
 * Text lives in messages/<locale>/emails.json under templates.<template>.*
 */
import type { AppLocale } from "@/config/site";
import type { TicketStatus, VerificationType } from "@/generated/prisma/enums";

export const EMAIL_TEMPLATES = [
  "welcome",
  "listing_live",
  "listing_in_review",
  "listing_approved",
  "listing_needs_changes",
  "listing_rejected",
  "listing_expiring",
  "listing_expired",
  "listing_hidden_reports",
  "ticket_created",
  "ticket_reply",
  "ticket_status",
  "contact_owner",
  "verification_approved",
  "verification_rejected",
  "account_warning",
  "account_suspended",
  "account_deleted",
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

type DateValue = Date | string;
/** An absolute URL, or a site path ("/account/listings" — the locale prefix is added). */
type Url = string;

/** The data each template needs. User-written values are escaped when rendered. */
export type EmailData = {
  welcome: { name: string };
  listing_live: { ownerName: string; listingTitle: string; listingUrl: Url; expiresAt?: DateValue | null };
  listing_in_review: { ownerName: string; listingTitle: string };
  listing_approved: { ownerName: string; listingTitle: string; listingUrl: Url };
  listing_needs_changes: {
    ownerName: string;
    listingTitle: string;
    /** Where the owner edits the listing. */
    listingUrl: Url;
    /** The moderation reason, already translated into the owner's language. */
    reasonText: string;
    note?: string | null;
  };
  listing_rejected: { ownerName: string; listingTitle: string; reasonText: string; note?: string | null };
  listing_expiring: { ownerName: string; listingTitle: string; renewUrl: Url; expiresAt: DateValue };
  listing_expired: { ownerName: string; listingTitle: string; renewUrl: Url };
  listing_hidden_reports: { ownerName: string; listingTitle: string };
  ticket_created: { name?: string | null; ticketNumber: number | string; subject: string; ticketUrl?: Url | null };
  ticket_reply: {
    name?: string | null;
    ticketNumber: number | string;
    subject: string;
    replyText: string;
    /** Null for guests without an account (they answer by replying to the email). */
    ticketUrl?: Url | null;
  };
  ticket_status: {
    name?: string | null;
    ticketNumber: number | string;
    subject: string;
    status: TicketStatus;
    ticketUrl?: Url | null;
  };
  contact_owner: {
    ownerName: string;
    senderName: string;
    senderEmail: string;
    senderPhone?: string | null;
    message: string;
    listingTitle: string;
    listingUrl: Url;
    /** The public listing number ("ID 1234"). */
    listingId: number | string;
    /** Already formatted, e.g. "12 – 19 Oct 2026". */
    dates?: string | null;
  };
  verification_approved: { name: string; type: VerificationType };
  verification_rejected: { name: string; type: VerificationType; reasonText: string; note?: string | null };
  account_warning: { name: string; reasonText: string };
  account_suspended: { name: string; reasonText: string; until?: DateValue | null };
  account_deleted: { name: string };
};

export type EmailBlock =
  | { type: "paragraph"; text: string }
  /** User- or staff-written text: shown in a box with dir="auto". */
  | { type: "quote"; label?: string; text: string }
  | { type: "details"; rows: { label: string; value: string; ltr?: boolean }[] }
  | { type: "notice"; text: string };

export type EmailContent = {
  subject: string;
  preheader: string;
  heading: string;
  /** Greeting name (null = generic greeting). */
  greetingName: string | null;
  blocks: EmailBlock[];
  cta?: { label: string; url: string };
  /** Account emails get the "about your account" footer; guest emails the "you contacted us" one. */
  audience: "account" | "guest";
};

export type TemplateContext = {
  locale: AppLocale;
  /** Translator for the "emails" namespace. */
  t: (key: string, values?: Record<string, string | number>) => string;
  /** Turns a path or URL from the data into an absolute URL (null if it is not safe). */
  url: (pathOrUrl: string | null | undefined) => string | null;
  /** Site page in the recipient's language: page("/account/listings"). */
  page: (path: string) => string;
  formatDate: (date: DateValue) => string;
  brand: string;
};

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/**
 * Wraps user text placed inside a sentence in Unicode isolates (FSI … PDI), so a Latin title
 * inside a Hebrew sentence (or the reverse) keeps its punctuation in the right place.
 */
export function isolate(value: string): string {
  return value ? `\u2068${value}\u2069` : value;
}

type Builder<K extends EmailTemplate> = (data: EmailData[K], ctx: TemplateContext) => EmailContent;

const builders: { [K in EmailTemplate]: Builder<K> } = {
  welcome: (data, { t, page, brand }) => ({
    subject: t("templates.welcome.subject", { brand }),
    preheader: t("templates.welcome.preheader", { brand }),
    heading: t("templates.welcome.heading", { brand }),
    greetingName: clean(data.name) || null,
    blocks: [
      { type: "paragraph", text: t("templates.welcome.body1", { brand }) },
      { type: "paragraph", text: t("templates.welcome.body2", { brand }) },
      { type: "notice", text: t("templates.welcome.body3", { brand }) },
    ],
    cta: { label: t("templates.welcome.cta"), url: page("/account") },
    audience: "account",
  }),

  listing_live: (data, { t, url, page, formatDate, brand }) => {
    const title = isolate(clean(data.listingTitle));
    return {
      subject: t("templates.listing_live.subject", { title, brand }),
      preheader: t("templates.listing_live.preheader", { brand }),
      heading: t("templates.listing_live.heading"),
      greetingName: clean(data.ownerName) || null,
      blocks: [
        { type: "paragraph", text: t("templates.listing_live.body1", { title, brand }) },
        {
          type: "paragraph",
          text: data.expiresAt
            ? t("templates.listing_live.body2", { date: formatDate(data.expiresAt) })
            : t("templates.listing_live.body2NoDate"),
        },
      ],
      cta: { label: t("templates.listing_live.cta"), url: url(data.listingUrl) ?? page("/account/listings") },
      audience: "account",
    };
  },

  listing_in_review: (data, { t, page, brand }) => {
    const title = isolate(clean(data.listingTitle));
    return {
      subject: t("templates.listing_in_review.subject", { title, brand }),
      preheader: t("templates.listing_in_review.preheader"),
      heading: t("templates.listing_in_review.heading"),
      greetingName: clean(data.ownerName) || null,
      blocks: [
        { type: "paragraph", text: t("templates.listing_in_review.body1", { title, brand }) },
        { type: "paragraph", text: t("templates.listing_in_review.body2") },
      ],
      cta: { label: t("templates.listing_in_review.cta"), url: page("/account/listings") },
      audience: "account",
    };
  },

  listing_approved: (data, { t, url, page, brand }) => {
    const title = isolate(clean(data.listingTitle));
    return {
      subject: t("templates.listing_approved.subject", { title, brand }),
      preheader: t("templates.listing_approved.preheader"),
      heading: t("templates.listing_approved.heading"),
      greetingName: clean(data.ownerName) || null,
      blocks: [
        { type: "paragraph", text: t("templates.listing_approved.body1", { title, brand }) },
        { type: "paragraph", text: t("templates.listing_approved.body2") },
      ],
      cta: { label: t("templates.listing_approved.cta"), url: url(data.listingUrl) ?? page("/account/listings") },
      audience: "account",
    };
  },

  listing_needs_changes: (data, { t, url, page, brand }) => {
    const title = isolate(clean(data.listingTitle));
    const blocks: EmailBlock[] = [
      { type: "paragraph", text: t("templates.listing_needs_changes.body1", { title, brand }) },
      { type: "quote", label: t("templates.listing_needs_changes.reasonLabel"), text: clean(data.reasonText) },
    ];
    if (clean(data.note)) {
      blocks.push({ type: "quote", label: t("templates.listing_needs_changes.noteLabel"), text: clean(data.note) });
    }
    blocks.push({ type: "paragraph", text: t("templates.listing_needs_changes.body2") });
    return {
      subject: t("templates.listing_needs_changes.subject", { title, brand }),
      preheader: t("templates.listing_needs_changes.preheader"),
      heading: t("templates.listing_needs_changes.heading"),
      greetingName: clean(data.ownerName) || null,
      blocks,
      cta: { label: t("templates.listing_needs_changes.cta"), url: url(data.listingUrl) ?? page("/account/listings") },
      audience: "account",
    };
  },

  listing_rejected: (data, { t, page, brand }) => {
    const title = isolate(clean(data.listingTitle));
    const blocks: EmailBlock[] = [
      { type: "paragraph", text: t("templates.listing_rejected.body1", { title, brand }) },
      { type: "quote", label: t("templates.listing_rejected.reasonLabel"), text: clean(data.reasonText) },
    ];
    if (clean(data.note)) {
      blocks.push({ type: "quote", label: t("templates.listing_rejected.noteLabel"), text: clean(data.note) });
    }
    blocks.push({ type: "paragraph", text: t("templates.listing_rejected.body2") });
    return {
      subject: t("templates.listing_rejected.subject", { title, brand }),
      preheader: t("templates.listing_rejected.preheader"),
      heading: t("templates.listing_rejected.heading"),
      greetingName: clean(data.ownerName) || null,
      blocks,
      cta: { label: t("templates.listing_rejected.cta"), url: page("/help/new-ticket") },
      audience: "account",
    };
  },

  listing_expiring: (data, { t, url, page, formatDate, brand }) => {
    const title = isolate(clean(data.listingTitle));
    const date = formatDate(data.expiresAt);
    return {
      subject: t("templates.listing_expiring.subject", { title, date, brand }),
      preheader: t("templates.listing_expiring.preheader"),
      heading: t("templates.listing_expiring.heading"),
      greetingName: clean(data.ownerName) || null,
      blocks: [
        { type: "paragraph", text: t("templates.listing_expiring.body1", { title, date, brand }) },
        { type: "paragraph", text: t("templates.listing_expiring.body2") },
      ],
      cta: { label: t("templates.listing_expiring.cta"), url: url(data.renewUrl) ?? page("/account/listings") },
      audience: "account",
    };
  },

  listing_expired: (data, { t, url, page, brand }) => {
    const title = isolate(clean(data.listingTitle));
    return {
      subject: t("templates.listing_expired.subject", { title, brand }),
      preheader: t("templates.listing_expired.preheader"),
      heading: t("templates.listing_expired.heading"),
      greetingName: clean(data.ownerName) || null,
      blocks: [
        { type: "paragraph", text: t("templates.listing_expired.body1", { title, brand }) },
        { type: "paragraph", text: t("templates.listing_expired.body2") },
      ],
      cta: { label: t("templates.listing_expired.cta"), url: url(data.renewUrl) ?? page("/account/listings") },
      audience: "account",
    };
  },

  listing_hidden_reports: (data, { t, page, brand }) => {
    const title = isolate(clean(data.listingTitle));
    return {
      subject: t("templates.listing_hidden_reports.subject", { title, brand }),
      preheader: t("templates.listing_hidden_reports.preheader"),
      heading: t("templates.listing_hidden_reports.heading"),
      greetingName: clean(data.ownerName) || null,
      blocks: [
        { type: "paragraph", text: t("templates.listing_hidden_reports.body1", { title, brand }) },
        { type: "paragraph", text: t("templates.listing_hidden_reports.body2") },
      ],
      cta: { label: t("templates.listing_hidden_reports.cta"), url: page("/account/listings") },
      audience: "account",
    };
  },

  ticket_created: (data, { t, url, brand }) => {
    const number = String(data.ticketNumber);
    const subject = isolate(clean(data.subject));
    const ticketUrl = url(data.ticketUrl);
    return {
      subject: t("templates.ticket_created.subject", { number, subject, brand }),
      preheader: t("templates.ticket_created.preheader"),
      heading: t("templates.ticket_created.heading"),
      greetingName: clean(data.name) || null,
      blocks: [
        { type: "paragraph", text: t("templates.ticket_created.body1", { number }) },
        { type: "quote", label: t("templates.ticket_created.subjectLabel"), text: clean(data.subject) },
        { type: "paragraph", text: t("templates.ticket_created.body2") },
      ],
      cta: ticketUrl ? { label: t("templates.ticket_created.cta"), url: ticketUrl } : undefined,
      audience: ticketUrl ? "account" : "guest",
    };
  },

  ticket_reply: (data, { t, url, brand }) => {
    const number = String(data.ticketNumber);
    const subject = isolate(clean(data.subject));
    const ticketUrl = url(data.ticketUrl);
    return {
      subject: t("templates.ticket_reply.subject", { number, subject, brand }),
      preheader: t("templates.ticket_reply.preheader"),
      heading: t("templates.ticket_reply.heading"),
      greetingName: clean(data.name) || null,
      blocks: [
        { type: "paragraph", text: t("templates.ticket_reply.body1", { number, subject }) },
        { type: "quote", label: t("templates.ticket_reply.replyLabel"), text: clean(data.replyText) },
        { type: "paragraph", text: t(ticketUrl ? "templates.ticket_reply.body2" : "templates.ticket_reply.body2Guest") },
      ],
      cta: ticketUrl ? { label: t("templates.ticket_reply.cta"), url: ticketUrl } : undefined,
      audience: ticketUrl ? "account" : "guest",
    };
  },

  ticket_status: (data, { t, url, brand }) => {
    const number = String(data.ticketNumber);
    const subject = isolate(clean(data.subject));
    const status = t(`ticketStatus.${data.status}`);
    const ticketUrl = url(data.ticketUrl);
    return {
      subject: t("templates.ticket_status.subject", { number, status, brand }),
      preheader: t("templates.ticket_status.preheader"),
      heading: t("templates.ticket_status.heading"),
      greetingName: clean(data.name) || null,
      blocks: [
        { type: "paragraph", text: t("templates.ticket_status.body1", { number, subject, status }) },
        { type: "paragraph", text: t(`ticketStatusHint.${data.status}`) },
      ],
      cta: ticketUrl ? { label: t("templates.ticket_status.cta"), url: ticketUrl } : undefined,
      audience: ticketUrl ? "account" : "guest",
    };
  },

  contact_owner: (data, { t, url, page, brand }) => {
    const title = isolate(clean(data.listingTitle));
    const sender = isolate(clean(data.senderName));
    const id = String(data.listingId);
    const rows: { label: string; value: string; ltr?: boolean }[] = [
      { label: t("templates.contact_owner.fromLabel"), value: clean(data.senderName) },
      { label: t("templates.contact_owner.emailLabel"), value: clean(data.senderEmail), ltr: true },
    ];
    if (clean(data.senderPhone)) {
      rows.push({ label: t("templates.contact_owner.phoneLabel"), value: clean(data.senderPhone), ltr: true });
    }
    if (clean(data.dates)) rows.push({ label: t("templates.contact_owner.datesLabel"), value: clean(data.dates) });
    return {
      subject: t("templates.contact_owner.subject", { title, sender, brand }),
      preheader: t("templates.contact_owner.preheader", { sender, brand }),
      heading: t("templates.contact_owner.heading"),
      greetingName: clean(data.ownerName) || null,
      blocks: [
        { type: "paragraph", text: t("templates.contact_owner.body1", { sender, title, id }) },
        { type: "quote", label: t("templates.contact_owner.messageLabel"), text: clean(data.message) },
        { type: "details", rows },
        { type: "paragraph", text: t("templates.contact_owner.body2", { sender }) },
        { type: "notice", text: t("templates.contact_owner.safety") },
      ],
      cta: { label: t("templates.contact_owner.cta"), url: url(data.listingUrl) ?? page("/account/listings") },
      audience: "account",
    };
  },

  verification_approved: (data, { t, page, brand }) => {
    const type = t(`verificationType.${data.type}`);
    return {
      subject: t("templates.verification_approved.subject", { type, brand }),
      preheader: t("templates.verification_approved.preheader", { type }),
      heading: t("templates.verification_approved.heading"),
      greetingName: clean(data.name) || null,
      blocks: [
        { type: "paragraph", text: t("templates.verification_approved.body1", { type, brand }) },
        { type: "paragraph", text: t("templates.verification_approved.body2") },
      ],
      cta: { label: t("templates.verification_approved.cta"), url: page("/account/verification") },
      audience: "account",
    };
  },

  verification_rejected: (data, { t, page, brand }) => {
    const type = t(`verificationType.${data.type}`);
    const blocks: EmailBlock[] = [
      { type: "paragraph", text: t("templates.verification_rejected.body1", { type }) },
      { type: "quote", label: t("templates.verification_rejected.reasonLabel"), text: clean(data.reasonText) },
    ];
    if (clean(data.note)) {
      blocks.push({ type: "quote", label: t("templates.verification_rejected.noteLabel"), text: clean(data.note) });
    }
    blocks.push({ type: "paragraph", text: t("templates.verification_rejected.body2") });
    return {
      subject: t("templates.verification_rejected.subject", { type, brand }),
      preheader: t("templates.verification_rejected.preheader"),
      heading: t("templates.verification_rejected.heading"),
      greetingName: clean(data.name) || null,
      blocks,
      cta: { label: t("templates.verification_rejected.cta"), url: page("/account/verification") },
      audience: "account",
    };
  },

  account_warning: (data, { t, page, brand }) => ({
    subject: t("templates.account_warning.subject", { brand }),
    preheader: t("templates.account_warning.preheader"),
    heading: t("templates.account_warning.heading"),
    greetingName: clean(data.name) || null,
    blocks: [
      { type: "paragraph", text: t("templates.account_warning.body1") },
      { type: "quote", label: t("templates.account_warning.reasonLabel"), text: clean(data.reasonText) },
      { type: "paragraph", text: t("templates.account_warning.body2") },
    ],
    cta: { label: t("templates.account_warning.cta"), url: page("/legal/listing-rules") },
    audience: "account",
  }),

  account_suspended: (data, { t, page, formatDate, brand }) => {
    const blocks: EmailBlock[] = [{ type: "paragraph", text: t("templates.account_suspended.body1") }];
    if (data.until) {
      blocks.push({ type: "paragraph", text: t("templates.account_suspended.untilLine", { date: formatDate(data.until) }) });
    }
    blocks.push(
      { type: "quote", label: t("templates.account_suspended.reasonLabel"), text: clean(data.reasonText) },
      { type: "paragraph", text: t("templates.account_suspended.body2") },
    );
    return {
      subject: t("templates.account_suspended.subject", { brand }),
      preheader: t("templates.account_suspended.preheader"),
      heading: t("templates.account_suspended.heading"),
      greetingName: clean(data.name) || null,
      blocks,
      cta: { label: t("templates.account_suspended.cta"), url: page("/help/new-ticket") },
      audience: "account",
    };
  },

  account_deleted: (data, { t, page, brand }) => ({
    subject: t("templates.account_deleted.subject", { brand }),
    preheader: t("templates.account_deleted.preheader"),
    heading: t("templates.account_deleted.heading"),
    greetingName: clean(data.name) || null,
    blocks: [
      { type: "paragraph", text: t("templates.account_deleted.body1", { brand }) },
      { type: "paragraph", text: t("templates.account_deleted.body2", { brand }) },
      { type: "notice", text: t("templates.account_deleted.body3") },
    ],
    cta: { label: t("templates.account_deleted.cta"), url: page("/contact") },
    audience: "guest",
  }),
};

export function buildEmailContent<K extends EmailTemplate>(
  template: K,
  data: EmailData[K],
  ctx: TemplateContext,
): EmailContent {
  const builder = builders[template] as Builder<K> | undefined;
  if (!builder) throw new Error(`Unknown email template "${template}"`);
  return builder(data, ctx);
}
