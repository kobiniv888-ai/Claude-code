/**
 * Email templates: the data each one needs and how it is laid out.
 * Pure (no server imports) so it can be unit-tested and previewed.
 * Text lives in messages/<locale>/emails.json under templates.<template>.*
 */
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { CancellationPolicy, TicketStatus, VerificationType } from "@/generated/prisma/enums";
import { formatDateRange, formatMoney, formatTime } from "@/lib/format";

export const EMAIL_TEMPLATES = [
  "login_code",
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
  "booking_confirmed_guest",
  "booking_new_host",
  "booking_reminder_guest",
  "booking_reminder_host",
  "booking_cancelled_by_guest",
  "booking_cancelled_by_host",
  "booking_completed",
  "booking_host_unreached_guest",
  "host_alert_test",
  "host_alerts_paused",
  "admin_alert",
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

type DateValue = Date | string;
/** An absolute URL, or a site path ("/account/listings" — the locale prefix is added). */
type Url = string;

/** What every booking email shows about the stay. Dates are "YYYY-MM-DD" (Georgia). */
export type BookingEmailStay = {
  /** "BT-7K3Q9" */
  code: string;
  listingTitle: string;
  /** Hotels: the room type's name in the recipient's language. */
  roomTypeName?: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  infants: number;
  /** In the host's currency (paid at check-in). */
  total: number;
  currency: CurrencyCode;
  /** The booking page for this recipient (the guest's trip or the host's booking). */
  bookingUrl: Url;
};

/** What a confirmed guest gets: the exact place and how to reach the host. */
export type BookingEmailArrival = {
  checkInFrom?: string | null;
  checkOutUntil?: string | null;
  address?: string | null;
  hostName?: string | null;
  hostPhone?: string | null;
  hostWhatsapp?: string | null;
  /** "cash" | "card" | "bank_transfer" */
  paymentMethods: string[];
};

/** The data each template needs. User-written values are escaped when rendered. */
export type EmailData = {
  /** The 6-digit email login code (Better Auth email OTP). `name` when the account has one. */
  login_code: { code: string; minutes: number; name?: string | null };
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
  booking_confirmed_guest: BookingEmailStay &
    BookingEmailArrival & {
      guestName?: string | null;
      cancellationPolicy: CancellationPolicy;
      /** End of free cancellation (null when it has already passed). */
      freeCancellationUntil?: DateValue | null;
      /** The estimate in the guest's display currency, if it differs. */
      displayTotal?: { amount: number; currency: CurrencyCode } | null;
    };
  booking_new_host: BookingEmailStay & {
    hostName?: string | null;
    guestName: string;
    /** E.164, verified. */
    guestPhone: string;
    messageToHost?: string | null;
  };
  booking_reminder_guest: BookingEmailStay & BookingEmailArrival & { guestName?: string | null; daysLeft: number };
  booking_reminder_host: BookingEmailStay & { hostName?: string | null; guestName: string; guestPhone: string; daysLeft: number };
  booking_cancelled_by_guest: BookingEmailStay & {
    hostName?: string | null;
    guestName: string;
    /** One of GUEST_CANCEL_REASONS. */
    reasonCode: string;
    reasonText?: string | null;
    /** After the free-cancellation period (informational: nothing is charged). */
    late: boolean;
  };
  booking_cancelled_by_host: BookingEmailStay & {
    guestName?: string | null;
    /** One of HOST_CANCEL_REASONS. */
    reasonCode: string;
    reasonText?: string | null;
    /** Search for the same dates. */
    searchUrl: Url;
  };
  booking_completed: Pick<BookingEmailStay, "code" | "listingTitle" | "checkIn" | "checkOut" | "bookingUrl"> & {
    guestName?: string | null;
  };
  /** The "new booking" alert to the host bounced: the guest should make sure the host expects them. */
  booking_host_unreached_guest: BookingEmailStay &
    Pick<BookingEmailArrival, "hostName" | "hostPhone" | "hostWhatsapp"> & { guestName?: string | null };
  /** The host pressed "Send a test alert" in the settings (src/lib/alerts). */
  host_alert_test: { hostName?: string | null; settingsUrl: Url };
  /**
   * One of the host's alert channels was paused (here: Telegram, the bot was blocked); sent by
   * email because email still works. `stillInstant`: another confirming channel still works.
   */
  host_alerts_paused: { hostName?: string | null; channel: "email" | "telegram"; stillInstant: boolean; settingsUrl: Url };
  /** To the founder (ADMIN_ALERT_EMAIL, else the admin accounts): something about alerts went wrong. */
  admin_alert: {
    /** One of ADMIN_ALERT_KINDS. */
    kind: AdminAlertKind;
    /** host_unreachable: an AlertBlockReason or "failed"; bounces: "bounced" | "complained" | "failed". */
    reason: string;
    bookingCode?: string | null;
    listingTitle?: string | null;
    listingPublicId?: number | string | null;
    hostName?: string | null;
    /** The address the email went to (bounces). */
    address?: string | null;
    /** Which email bounced (an EmailTemplate name). */
    template?: string | null;
    /** A site path in the admin panel. */
    adminUrl?: Url | null;
    /** host_channel_paused: which channel ("email" | "telegram"). */
    channel?: string | null;
    /** host_channel_paused: the host still takes instant bookings through another channel. */
    stillInstant?: boolean | null;
  };
};

/**
 * - host_unreachable: a booking was refused because no alert channel of the host accepted the alert
 * - host_alert_bounced: the "new booking" alert to the host bounced later (the booking stands)
 * - email_bounced: another email from the site bounced (or was marked as spam)
 * - host_channel_paused: one of a host's alert channels was paused (a blocked Telegram bot)
 */
export const ADMIN_ALERT_KINDS = ["host_unreachable", "host_alert_bounced", "email_bounced", "host_channel_paused"] as const;
export type AdminAlertKind = (typeof ADMIN_ALERT_KINDS)[number];

const ADMIN_ALERT_REASONS = [
  "email_not_configured",
  "no_email",
  "email_failing",
  "telegram_failing",
  "no_channel",
  "failed",
  "bounced",
  "complained",
  "blocked",
];

export type EmailBlock =
  | { type: "paragraph"; text: string }
  /** User- or staff-written text: shown in a box with dir="auto". */
  | { type: "quote"; label?: string; text: string }
  | { type: "details"; rows: { label: string; value: string; ltr?: boolean }[] }
  | { type: "notice"; text: string }
  /** A one-time code: big digits, left to right. */
  | { type: "code"; label: string; code: string };

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
  /** Translator for the shared "booking" vocabulary (statuses, policies, payment methods, reasons). */
  tb: (key: string, values?: Record<string, string | number>) => string;
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

// ─── Booking helpers ──────────────────────────────────────────

type DetailRow = { label: string; value: string; ltr?: boolean };

/** Translation keys from data (reason codes) are limited to safe characters. */
function safeKey(value: string): string {
  return /^[A-Z_]{1,40}$/.test(value) ? value : "OTHER";
}

function datesOf(data: Pick<BookingEmailStay, "checkIn" | "checkOut">, ctx: TemplateContext): string {
  return formatDateRange(data.checkIn, data.checkOut, ctx.locale, { day: "numeric", month: "short", year: "numeric" });
}

function guestsLine(data: Pick<BookingEmailStay, "adults" | "children" | "infants">, ctx: TemplateContext): string {
  const parts = [ctx.tb("guests.adults", { count: data.adults })];
  if (data.children > 0) parts.push(ctx.tb("guests.children", { count: data.children }));
  if (data.infants > 0) parts.push(ctx.tb("guests.infants", { count: data.infants }));
  return parts.join(ctx.t("booking.listSeparator"));
}

function stayRows(data: BookingEmailStay, ctx: TemplateContext): DetailRow[] {
  const { t, tb, formatDate, locale } = ctx;
  const rows: DetailRow[] = [
    { label: t("booking.codeLabel"), value: data.code, ltr: true },
    { label: t("booking.placeLabel"), value: clean(data.listingTitle) },
  ];
  if (clean(data.roomTypeName)) rows.push({ label: t("booking.roomLabel"), value: clean(data.roomTypeName) });
  rows.push(
    { label: t("booking.checkInLabel"), value: formatDate(data.checkIn) },
    { label: t("booking.checkOutLabel"), value: formatDate(data.checkOut) },
    { label: t("booking.nightsLabel"), value: tb("nights", { count: data.nights }) },
    { label: t("booking.guestsLabel"), value: guestsLine(data, ctx) },
    { label: t("booking.totalLabel"), value: formatMoney(data.total, data.currency, locale), ltr: true },
  );
  return rows;
}

function arrivalRows(data: BookingEmailArrival, ctx: TemplateContext): DetailRow[] {
  const { t } = ctx;
  const rows: DetailRow[] = [];
  if (clean(data.checkInFrom)) rows.push({ label: t("booking.arrivalLabel"), value: t("booking.fromTime", { time: clean(data.checkInFrom) }) });
  if (clean(data.checkOutUntil)) rows.push({ label: t("booking.departureLabel"), value: t("booking.untilTime", { time: clean(data.checkOutUntil) }) });
  if (clean(data.address)) rows.push({ label: t("booking.addressLabel"), value: clean(data.address) });
  if (clean(data.hostName)) rows.push({ label: t("booking.hostLabel"), value: clean(data.hostName) });
  if (clean(data.hostPhone)) rows.push({ label: t("booking.hostPhoneLabel"), value: clean(data.hostPhone), ltr: true });
  if (clean(data.hostWhatsapp) && clean(data.hostWhatsapp) !== clean(data.hostPhone)) {
    rows.push({ label: t("booking.hostWhatsappLabel"), value: clean(data.hostWhatsapp), ltr: true });
  }
  return rows;
}

/** "Pay the host ₾540 at check-in, in lari. Accepted: cash, card." */
function payLine(data: BookingEmailStay & BookingEmailArrival, ctx: TemplateContext): string {
  const { t, tb, locale } = ctx;
  const amount = formatMoney(data.total, data.currency, locale);
  const currency = tb(`inCurrency.${data.currency}`);
  const methods = data.paymentMethods.filter((m) => /^[a-z_]{1,30}$/.test(m)).map((m) => tb(`paymentMethod.${m}`));
  return methods.length
    ? t("booking.payLineMethods", { amount, currency, methods: methods.join(t("booking.listSeparator")) })
    : t("booking.payLine", { amount, currency });
}

function policyLine(policy: CancellationPolicy, until: DateValue | null | undefined, ctx: TemplateContext): string {
  const { tb, formatDate, locale } = ctx;
  const name = tb(`policy.${policy}.name`);
  if (!until) return `${name}: ${tb(`policy.${policy}.rule`)}`;
  return `${name}: ${tb("policy.freeUntil", { date: formatDate(until), time: formatTime(until, locale) })}`;
}

function reasonText(label: string, text: string | null | undefined): string {
  return clean(text) ? `${label}: ${clean(text)}` : label;
}

type Builder<K extends EmailTemplate> = (data: EmailData[K], ctx: TemplateContext) => EmailContent;

const builders: { [K in EmailTemplate]: Builder<K> } = {
  login_code: (data, { t, brand }) => ({
    subject: t("templates.login_code.subject", { code: data.code, brand }),
    preheader: t("templates.login_code.preheader", { minutes: data.minutes }),
    heading: t("templates.login_code.heading", { brand }),
    greetingName: clean(data.name) || null,
    blocks: [
      { type: "paragraph", text: t("templates.login_code.body1", { brand }) },
      { type: "code", label: t("templates.login_code.codeLabel"), code: data.code },
      { type: "paragraph", text: t("templates.login_code.body2", { minutes: data.minutes }) },
      { type: "notice", text: t("templates.login_code.body3", { brand }) },
    ],
    audience: "account",
  }),

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
  booking_confirmed_guest: (data, ctx) => {
    const { t, tb, url, formatDate, brand, locale } = ctx;
    const title = isolate(clean(data.listingTitle));
    const rows = [
      ...stayRows(data, ctx),
      ...arrivalRows(data, ctx),
      { label: t("booking.policyLabel"), value: policyLine(data.cancellationPolicy, data.freeCancellationUntil, ctx) },
    ];
    const blocks: EmailBlock[] = [
      { type: "paragraph", text: t("templates.booking_confirmed_guest.body1", { title, code: data.code }) },
      { type: "details", rows },
      { type: "paragraph", text: payLine(data, ctx) },
    ];
    if (data.displayTotal && data.displayTotal.currency !== data.currency) {
      blocks.push({
        type: "paragraph",
        text: t("booking.estimateLine", { amount: formatMoney(data.displayTotal.amount, data.displayTotal.currency, locale) }),
      });
    }
    blocks.push(
      { type: "paragraph", text: t("templates.booking_confirmed_guest.body2") },
      { type: "notice", text: tb("noPrepayment", { brand }) },
    );
    return {
      subject: t("templates.booking_confirmed_guest.subject", { title, code: data.code }),
      preheader: t("templates.booking_confirmed_guest.preheader", { dates: datesOf(data, ctx), formattedDate: formatDate(data.checkIn) }),
      heading: t("templates.booking_confirmed_guest.heading"),
      greetingName: clean(data.guestName) || null,
      blocks,
      cta: { label: t("templates.booking_confirmed_guest.cta"), url: url(data.bookingUrl) ?? ctx.page("/account") },
      audience: "account",
    };
  },

  booking_new_host: (data, ctx) => {
    const { t, url, brand } = ctx;
    const title = isolate(clean(data.listingTitle));
    const guest = isolate(clean(data.guestName));
    const blocks: EmailBlock[] = [
      { type: "paragraph", text: t("templates.booking_new_host.body1", { guest, title, dates: datesOf(data, ctx) }) },
      {
        type: "details",
        rows: [
          ...stayRows(data, ctx),
          { label: t("booking.guestLabel"), value: clean(data.guestName) },
          { label: t("booking.guestPhoneLabel"), value: clean(data.guestPhone), ltr: true },
        ],
      },
    ];
    if (clean(data.messageToHost)) {
      blocks.push({ type: "quote", label: t("booking.messageLabel"), text: clean(data.messageToHost) });
    }
    blocks.push(
      { type: "paragraph", text: t("templates.booking_new_host.body2") },
      { type: "notice", text: t("templates.booking_new_host.pledge", { brand }) },
    );
    return {
      subject: t("templates.booking_new_host.subject", { title, dates: datesOf(data, ctx), code: data.code }),
      preheader: t("templates.booking_new_host.preheader", { guest }),
      heading: t("templates.booking_new_host.heading"),
      greetingName: clean(data.hostName) || null,
      blocks,
      cta: { label: t("templates.booking_new_host.cta"), url: url(data.bookingUrl) ?? ctx.page("/account") },
      audience: "account",
    };
  },

  booking_reminder_guest: (data, ctx) => {
    const { t, tb, url, brand } = ctx;
    const title = isolate(clean(data.listingTitle));
    return {
      subject: t("templates.booking_reminder_guest.subject", { title, count: data.daysLeft }),
      preheader: t("templates.booking_reminder_guest.preheader", { dates: datesOf(data, ctx) }),
      heading: t("templates.booking_reminder_guest.heading", { count: data.daysLeft }),
      greetingName: clean(data.guestName) || null,
      blocks: [
        { type: "paragraph", text: t("templates.booking_reminder_guest.body1", { title, count: data.daysLeft }) },
        { type: "details", rows: [...stayRows(data, ctx), ...arrivalRows(data, ctx)] },
        { type: "paragraph", text: payLine(data, ctx) },
        { type: "notice", text: tb("noPrepayment", { brand }) },
      ],
      cta: { label: t("templates.booking_reminder_guest.cta"), url: url(data.bookingUrl) ?? ctx.page("/account") },
      audience: "account",
    };
  },

  booking_reminder_host: (data, ctx) => {
    const { t, url } = ctx;
    const title = isolate(clean(data.listingTitle));
    const guest = isolate(clean(data.guestName));
    return {
      subject: t("templates.booking_reminder_host.subject", { guest, count: data.daysLeft }),
      preheader: t("templates.booking_reminder_host.preheader", { title, dates: datesOf(data, ctx) }),
      heading: t("templates.booking_reminder_host.heading", { count: data.daysLeft }),
      greetingName: clean(data.hostName) || null,
      blocks: [
        { type: "paragraph", text: t("templates.booking_reminder_host.body1", { guest, title, count: data.daysLeft }) },
        {
          type: "details",
          rows: [
            ...stayRows(data, ctx),
            { label: t("booking.guestLabel"), value: clean(data.guestName) },
            { label: t("booking.guestPhoneLabel"), value: clean(data.guestPhone), ltr: true },
          ],
        },
        { type: "paragraph", text: t("templates.booking_reminder_host.body2") },
      ],
      cta: { label: t("templates.booking_reminder_host.cta"), url: url(data.bookingUrl) ?? ctx.page("/account") },
      audience: "account",
    };
  },

  booking_cancelled_by_guest: (data, ctx) => {
    const { t, tb, url } = ctx;
    const title = isolate(clean(data.listingTitle));
    const guest = isolate(clean(data.guestName));
    const blocks: EmailBlock[] = [
      { type: "paragraph", text: t("templates.booking_cancelled_by_guest.body1", { guest, title, dates: datesOf(data, ctx), code: data.code }) },
      { type: "details", rows: stayRows(data, ctx) },
      { type: "quote", label: t("booking.reasonLabel"), text: reasonText(tb(`guestReason.${safeKey(data.reasonCode)}`), data.reasonText) },
      { type: "paragraph", text: t("templates.booking_cancelled_by_guest.body2") },
    ];
    if (data.late) blocks.push({ type: "notice", text: t("templates.booking_cancelled_by_guest.late") });
    return {
      subject: t("templates.booking_cancelled_by_guest.subject", { code: data.code, title }),
      preheader: t("templates.booking_cancelled_by_guest.preheader", { guest, dates: datesOf(data, ctx) }),
      heading: t("templates.booking_cancelled_by_guest.heading"),
      greetingName: clean(data.hostName) || null,
      blocks,
      cta: { label: t("templates.booking_cancelled_by_guest.cta"), url: url(data.bookingUrl) ?? ctx.page("/account") },
      audience: "account",
    };
  },

  booking_cancelled_by_host: (data, ctx) => {
    const { t, tb, url, page, brand } = ctx;
    const title = isolate(clean(data.listingTitle));
    return {
      subject: t("templates.booking_cancelled_by_host.subject", { code: data.code, title }),
      preheader: t("templates.booking_cancelled_by_host.preheader", { dates: datesOf(data, ctx) }),
      heading: t("templates.booking_cancelled_by_host.heading"),
      greetingName: clean(data.guestName) || null,
      blocks: [
        { type: "paragraph", text: t("templates.booking_cancelled_by_host.body1", { title, dates: datesOf(data, ctx), code: data.code }) },
        { type: "quote", label: t("booking.reasonLabel"), text: reasonText(tb(`hostReason.${safeKey(data.reasonCode)}`), data.reasonText) },
        { type: "paragraph", text: t("templates.booking_cancelled_by_host.body2", { brand }) },
        { type: "notice", text: t("templates.booking_cancelled_by_host.report", { brand }) },
      ],
      cta: { label: t("templates.booking_cancelled_by_host.cta"), url: url(data.searchUrl) ?? page("/search") },
      audience: "account",
    };
  },

  booking_completed: (data, ctx) => {
    const { t, url, brand } = ctx;
    const title = isolate(clean(data.listingTitle));
    return {
      subject: t("templates.booking_completed.subject", { title }),
      preheader: t("templates.booking_completed.preheader", { brand }),
      heading: t("templates.booking_completed.heading"),
      greetingName: clean(data.guestName) || null,
      blocks: [
        { type: "paragraph", text: t("templates.booking_completed.body1", { title, dates: datesOf(data, ctx) }) },
        { type: "paragraph", text: t("templates.booking_completed.body2", { brand }) },
      ],
      cta: { label: t("templates.booking_completed.cta"), url: url(data.bookingUrl) ?? ctx.page("/account") },
      audience: "account",
    };
  },

  booking_host_unreached_guest: (data, ctx) => {
    const { t, url, brand } = ctx;
    const title = isolate(clean(data.listingTitle));
    const hostRows = arrivalRows({ hostName: data.hostName, hostPhone: data.hostPhone, hostWhatsapp: data.hostWhatsapp, paymentMethods: [] }, ctx);
    return {
      subject: t("templates.booking_host_unreached_guest.subject", { code: data.code, brand }),
      preheader: t("templates.booking_host_unreached_guest.preheader"),
      heading: t("templates.booking_host_unreached_guest.heading"),
      greetingName: clean(data.guestName) || null,
      blocks: [
        { type: "paragraph", text: t("templates.booking_host_unreached_guest.body1", { code: data.code, title }) },
        { type: "paragraph", text: t("templates.booking_host_unreached_guest.body2") },
        { type: "details", rows: [...hostRows, ...stayRows(data, ctx)] },
        { type: "notice", text: t("templates.booking_host_unreached_guest.body3", { brand }) },
      ],
      cta: { label: t("templates.booking_host_unreached_guest.cta"), url: url(data.bookingUrl) ?? ctx.page("/account/trips") },
      audience: "account",
    };
  },

  host_alert_test: (data, { t, url, page, brand }) => ({
    subject: t("templates.host_alert_test.subject", { brand }),
    preheader: t("templates.host_alert_test.preheader"),
    heading: t("templates.host_alert_test.heading"),
    greetingName: clean(data.hostName) || null,
    blocks: [
      { type: "paragraph", text: t("templates.host_alert_test.body1", { brand }) },
      { type: "paragraph", text: t("templates.host_alert_test.body2") },
    ],
    cta: { label: t("templates.host_alert_test.cta"), url: url(data.settingsUrl) ?? page("/account/settings") },
    audience: "account",
  }),

  host_alerts_paused: (data, { t, url, page, brand }) => {
    const channel = data.channel === "email" ? "email" : "telegram";
    return {
      subject: t(`templates.host_alerts_paused.subject.${channel}`, { brand }),
      preheader: t(`templates.host_alerts_paused.body.${channel}`, { brand }),
      heading: t("templates.host_alerts_paused.heading"),
      greetingName: clean(data.hostName) || null,
      blocks: [
        { type: "paragraph", text: t(`templates.host_alerts_paused.body.${channel}`, { brand }) },
        { type: "paragraph", text: t(data.stillInstant ? "templates.host_alerts_paused.stillInstant" : "templates.host_alerts_paused.contactOnly") },
        { type: "notice", text: t(`templates.host_alerts_paused.fix.${channel}`) },
      ],
      cta: { label: t("templates.host_alerts_paused.cta"), url: url(data.settingsUrl) ?? page("/account/settings") },
      audience: "account",
    };
  },

  admin_alert: (data, ctx) => {
    const { t, url, page } = ctx;
    const kind = (ADMIN_ALERT_KINDS as readonly string[]).includes(data.kind) ? data.kind : "email_bounced";
    const key = `templates.admin_alert.${kind}`;
    const reason = t(`templates.admin_alert.reason.${ADMIN_ALERT_REASONS.includes(data.reason) ? data.reason : "failed"}`);
    const code = clean(data.bookingCode);
    const title = isolate(clean(data.listingTitle));
    const address = clean(data.address);
    const rows: DetailRow[] = [];
    if (code) rows.push({ label: t("booking.codeLabel"), value: code, ltr: true });
    if (clean(data.listingTitle)) {
      const id = data.listingPublicId ? ` (ID ${data.listingPublicId})` : "";
      rows.push({ label: t("booking.placeLabel"), value: `${clean(data.listingTitle)}${id}` });
    }
    if (clean(data.hostName)) rows.push({ label: t("booking.hostLabel"), value: clean(data.hostName) });
    if (address) rows.push({ label: t("templates.admin_alert.addressLabel"), value: address, ltr: true });
    if (clean(data.template)) rows.push({ label: t("templates.admin_alert.templateLabel"), value: clean(data.template), ltr: true });
    const channel = data.channel === "email" || data.channel === "telegram" ? data.channel : null;
    if (channel) rows.push({ label: t("templates.admin_alert.channelLabel"), value: t(`templates.admin_alert.channel.${channel}`) });
    rows.push({ label: t("templates.admin_alert.reasonLabel"), value: reason });
    if (kind === "host_channel_paused" && typeof data.stillInstant === "boolean") {
      rows.push({
        label: t("templates.admin_alert.instantLabel"),
        value: t(data.stillInstant ? "templates.admin_alert.instantOn" : "templates.admin_alert.instantOff"),
      });
    }
    return {
      subject: t(`${key}.subject`, { code: code || "-", address: address || "-" }),
      preheader: t(`${key}.body`, { title, reason }),
      heading: t(`${key}.heading`),
      greetingName: null,
      blocks: [
        { type: "paragraph", text: t(`${key}.body`, { title, reason }) },
        { type: "details", rows },
        { type: "paragraph", text: t(`${key}.next`) },
      ],
      cta: { label: t("templates.admin_alert.cta"), url: url(data.adminUrl) ?? page("/admin") },
      audience: "account",
    };
  },
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
