/**
 * The review emails (round 3, brief 8.1): their data and layout. Pure (no server imports), like
 * src/lib/email/templates.ts, which registers them. Text lives in messages/<locale>/emails.json
 * under templates.review_*. Only TYPES come from the email module, so the two files never load
 * each other at run time.
 *
 * - review_request: the morning after the stay (the stay's thank-you, with "how was it?"), once
 *   per booking, with a link that opens the form and a one-tap unsubscribe link ("review_request").
 * - review_posted_host: a guest reviewed the host's place (reply once, or report it to Bayit).
 * - review_reply_guest: the host replied to the guest's review.
 * - review_hidden / review_shown: staff hid a review (the reason's name only, never the staff
 *   note) or showed it again — to the guest who wrote it and to the host.
 * - review_no_show_guest: the host reported that the guest didn't arrive. The stay then can't be
 *   reviewed, so the guest is told at once, with a way to tell Bayit when it is wrong (staff can
 *   clear the report).
 */
import type { EmailBlock, EmailContent, TemplateContext } from "@/lib/email/templates";
import { formatDateRange, formatNumber } from "@/lib/format";

export const REVIEW_EMAIL_TEMPLATES = ["review_request", "review_posted_host", "review_reply_guest", "review_hidden", "review_shown", "review_no_show_guest"] as const;
export type ReviewEmailTemplate = (typeof REVIEW_EMAIL_TEMPLATES)[number];

/** Why staff hid a review, as the email names it (the same codes as REVIEW_HIDE_REASONS in ./rules). */
const HIDE_REASON_CODES = new Set(["offensive", "discrimination", "personal_info", "not_about_stay", "not_genuine", "other"]);

export type ReviewEmailData = {
  review_request: {
    name?: string | null;
    listingTitle: string;
    /** "YYYY-MM-DD" (Georgia). */
    checkIn: string;
    checkOut: string;
    /** The last day the form is open, "YYYY-MM-DD". */
    closesOn: string;
    /** The form ("/account/reviews/write/BT-…"). */
    writeUrl: string;
    /** The trip page. */
    tripUrl: string;
    /** The signed one-tap unsubscribe page ("review_request"). */
    unsubscribeUrl: string;
  };
  review_posted_host: {
    name?: string | null;
    listingTitle: string;
    rating: number;
    /** The guest's first name, or null ("a guest"). */
    guestName?: string | null;
    /** The review's text (user text: quoted). */
    text: string;
    /** "/account/reviews#review-…" */
    reviewsUrl: string;
  };
  review_reply_guest: {
    name?: string | null;
    listingTitle: string;
    replyText: string;
    /** The listing page's reviews ("/listing/…#reviews"). */
    listingUrl: string;
  };
  review_hidden: {
    name?: string | null;
    /** Who gets it: the guest who wrote the review, or the host of the place. */
    role: "guest" | "host";
    listingTitle: string;
    /** A REVIEW_HIDE_REASONS code (./rules.ts). */
    reasonCode: string;
    reviewsUrl: string;
  };
  review_shown: {
    name?: string | null;
    role: "guest" | "host";
    listingTitle: string;
    listingUrl: string;
  };
  review_no_show_guest: {
    name?: string | null;
    listingTitle: string;
    /** "BT-7K3Q9" */
    code: string;
    /** "YYYY-MM-DD" (Georgia). */
    checkIn: string;
    checkOut: string;
    /** The trip page. */
    tripUrl: string;
    /** Where the guest tells Bayit it is wrong ("/contact"). */
    contactUrl: string;
  };
};

type Builder<K extends ReviewEmailTemplate> = (data: ReviewEmailData[K], ctx: TemplateContext) => EmailContent;

/** User text inside a sentence keeps its own direction (FSI … PDI), as in the other emails. */
function isolate(value: string): string {
  return value ? `⁨${value}⁩` : value;
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export const reviewEmailBuilders: { [K in ReviewEmailTemplate]: Builder<K> } = {
  review_request: (data, ctx) => {
    const { t, url, page, brand, locale } = ctx;
    const key = "templates.review_request";
    const title = isolate(clean(data.listingTitle));
    const dates = formatDateRange(data.checkIn, data.checkOut, locale, { day: "numeric", month: "short", year: "numeric" });
    const closes = ctx.formatDate(data.closesOn);
    const blocks: EmailBlock[] = [
      { type: "paragraph", text: t(`${key}.body1`, { title, dates }) },
      { type: "paragraph", text: t(`${key}.body2`, { brand }) },
      { type: "notice", text: t(`${key}.final`, { date: closes }) },
      { type: "notice", text: t(`${key}.tripText`), link: { label: t(`${key}.tripLink`), url: url(data.tripUrl) ?? page("/account/trips") } },
      { type: "notice", text: t(`${key}.unsubscribeText`, { brand }), link: { label: t(`${key}.unsubscribe`), url: url(data.unsubscribeUrl) ?? page("/account/reviews") } },
    ];
    return {
      subject: t(`${key}.subject`, { title }),
      preheader: t(`${key}.preheader`, { date: closes }),
      heading: t(`${key}.heading`),
      greetingName: clean(data.name) || null,
      blocks,
      cta: { label: t(`${key}.cta`), url: url(data.writeUrl) ?? page("/account/reviews") },
      audience: "account",
    };
  },

  review_posted_host: (data, ctx) => {
    const { t, url, page, brand, locale } = ctx;
    const key = "templates.review_posted_host";
    const title = isolate(clean(data.listingTitle));
    const stars = formatNumber(data.rating, locale);
    const guest = clean(data.guestName);
    return {
      subject: t(`${key}.subject`, { title }),
      preheader: t(`${key}.preheader`, { stars }),
      heading: t(`${key}.heading`),
      greetingName: clean(data.name) || null,
      blocks: [
        { type: "paragraph", text: guest ? t(`${key}.bodyNamed`, { guest: isolate(guest), title, stars }) : t(`${key}.body`, { title, stars }) },
        { type: "quote", label: t(`${key}.quoteLabel`), text: clean(data.text) },
        { type: "paragraph", text: t(`${key}.reply`, { brand }) },
        { type: "notice", text: t(`${key}.final`) },
      ],
      cta: { label: t(`${key}.cta`), url: url(data.reviewsUrl) ?? page("/account/reviews") },
      audience: "account",
    };
  },

  review_reply_guest: (data, ctx) => {
    const { t, url, page } = ctx;
    const key = "templates.review_reply_guest";
    const title = isolate(clean(data.listingTitle));
    return {
      subject: t(`${key}.subject`, { title }),
      preheader: t(`${key}.preheader`),
      heading: t(`${key}.heading`),
      greetingName: clean(data.name) || null,
      blocks: [
        { type: "paragraph", text: t(`${key}.body`, { title }) },
        { type: "quote", label: t(`${key}.quoteLabel`), text: clean(data.replyText) },
      ],
      cta: { label: t(`${key}.cta`), url: url(data.listingUrl) ?? page("/account/reviews") },
      audience: "account",
    };
  },

  review_hidden: (data, ctx) => {
    const { t, url, page, brand } = ctx;
    const key = "templates.review_hidden";
    const role = data.role === "host" ? "host" : "guest";
    const title = isolate(clean(data.listingTitle));
    const reason = t(`${key}.reasons.${HIDE_REASON_CODES.has(data.reasonCode) ? data.reasonCode : "other"}`);
    return {
      subject: t(`${key}.subject.${role}`, { title }),
      preheader: t(`${key}.body.${role}`, { title, brand }),
      heading: t(`${key}.heading`),
      greetingName: clean(data.name) || null,
      blocks: [
        { type: "paragraph", text: t(`${key}.body.${role}`, { title, brand }) },
        { type: "details", rows: [{ label: t(`${key}.reasonLabel`), value: reason }] },
        { type: "paragraph", text: t(`${key}.final`) },
        { type: "notice", text: t(`${key}.help`, { brand }) },
      ],
      cta: { label: t(`${key}.cta`), url: url(data.reviewsUrl) ?? page("/account/reviews") },
      audience: "account",
    };
  },

  review_no_show_guest: (data, ctx) => {
    const { t, url, page, brand, locale } = ctx;
    const key = "templates.review_no_show_guest";
    const title = isolate(clean(data.listingTitle));
    const dates = formatDateRange(data.checkIn, data.checkOut, locale, { day: "numeric", month: "short", year: "numeric" });
    return {
      subject: t(`${key}.subject`, { code: data.code }),
      preheader: t(`${key}.preheader`, { title }),
      heading: t(`${key}.heading`),
      greetingName: clean(data.name) || null,
      blocks: [
        { type: "paragraph", text: t(`${key}.body1`, { title, dates, code: data.code }) },
        { type: "paragraph", text: t(`${key}.body2`) },
        { type: "notice", text: t(`${key}.wrong`, { brand }), link: { label: t(`${key}.tripLink`), url: url(data.tripUrl) ?? page("/account/trips") } },
      ],
      cta: { label: t(`${key}.cta`, { brand }), url: url(data.contactUrl) ?? page("/contact") },
      audience: "account",
    };
  },

  review_shown: (data, ctx) => {
    const { t, url, page, brand } = ctx;
    const key = "templates.review_shown";
    const role = data.role === "host" ? "host" : "guest";
    const title = isolate(clean(data.listingTitle));
    return {
      subject: t(`${key}.subject.${role}`, { title }),
      preheader: t(`${key}.body.${role}`, { title, brand }),
      heading: t(`${key}.heading`),
      greetingName: clean(data.name) || null,
      blocks: [{ type: "paragraph", text: t(`${key}.body.${role}`, { title, brand }) }],
      cta: { label: t(`${key}.cta`), url: url(data.listingUrl) ?? page("/account/reviews") },
      audience: "account",
    };
  },
};
