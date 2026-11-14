/**
 * The weekly host stats email (round 3, brief 6.2): its data and layout. Pure (no server
 * imports), like src/lib/email/templates.ts, which registers it. Text lives in
 * messages/<locale>/emails.json under templates.weekly_host_stats.*.
 *
 *   "השבוע: 120 צפיות, 8 שמירות, הזמנה אחת" + one block per listing (up to MAX_LISTINGS) with a
 *   link to its stats page, a button to "הנכסים שלי" and the unsubscribe link.
 *
 * Only TYPES are imported from the email module, so the two files never load each other at run
 * time.
 */
import type { EmailBlock, EmailContent, TemplateContext } from "@/lib/email/templates";
import { formatDateRange, formatNumber } from "@/lib/format";

export const WEEKLY_EMAIL_TEMPLATES = ["weekly_host_stats"] as const;
export type WeeklyEmailTemplate = (typeof WEEKLY_EMAIL_TEMPLATES)[number];

/** Listings listed one by one; the rest are "and N more" with the link to all of them. */
export const MAX_LISTINGS = 10;

export type WeeklyCounts = { views: number; saves: number; contacts: number; bookings: number };

export type WeeklyEmailData = {
  weekly_host_stats: {
    name?: string | null;
    /** The Georgian days covered, "YYYY-MM-DD", both included. */
    fromDay: string;
    toDay: string;
    totals: WeeklyCounts;
    /** At least one listing is a short stay or a hotel: bookings are named even when 0. */
    bookable: boolean;
    listings: (WeeklyCounts & { title: string; publicId: number; bookable: boolean; statsUrl: string })[];
    /** Listings left out of the list (more than MAX_LISTINGS). */
    moreListings: number;
    /** "הנכסים שלי". */
    listingsUrl: string;
    /** The signed one-tap unsubscribe page (src/lib/alerts/unsubscribe-token.ts). */
    unsubscribeUrl: string;
  };
};

type Builder<K extends WeeklyEmailTemplate> = (data: WeeklyEmailData[K], ctx: TemplateContext) => EmailContent;

/** User text inside a sentence keeps its own direction (FSI … PDI), as in the other emails. */
function isolate(value: string): string {
  return value ? `\u2068${value}\u2069` : value;
}

/** "120 צפיות, 8 שמירות, הזמנה אחת" in the reader's language. */
export function countsLine(counts: WeeklyCounts, bookable: boolean, ctx: Pick<TemplateContext, "t" | "locale">): string {
  const { t, locale } = ctx;
  const part = (key: string, count: number) => t(`templates.weekly_host_stats.counts.${key}`, { count, countText: formatNumber(count, locale) });
  const parts = [part("views", counts.views), part("saves", counts.saves)];
  if (counts.contacts > 0) parts.push(part("contacts", counts.contacts));
  if (bookable || counts.bookings > 0) parts.push(part("bookings", counts.bookings));
  return parts.join(t("booking.listSeparator"));
}

export const weeklyEmailBuilders: { [K in WeeklyEmailTemplate]: Builder<K> } = {
  weekly_host_stats: (data, ctx) => {
    const { t, url, page, brand, locale } = ctx;
    const key = "templates.weekly_host_stats";
    const summary = countsLine(data.totals, data.bookable, ctx);
    const dates = formatDateRange(data.fromDay, data.toDay, locale, { day: "numeric", month: "short" });
    const blocks: EmailBlock[] = [
      { type: "paragraph", text: t(`${key}.summary`, { summary }) },
      { type: "paragraph", text: t(`${key}.period`, { dates }) },
    ];
    for (const listing of data.listings) {
      const title = listing.title.trim() || t(`${key}.untitled`, { id: listing.publicId });
      blocks.push({
        type: "notice",
        text: `${isolate(title)}\n${countsLine(listing, listing.bookable, ctx)}`,
        link: { label: t(`${key}.listingLink`), url: url(listing.statsUrl) ?? page("/account/listings") },
      });
    }
    if (data.moreListings > 0) {
      blocks.push({ type: "paragraph", text: t(`${key}.more`, { count: data.moreListings, countText: formatNumber(data.moreListings, locale) }) });
    }
    blocks.push({ type: "paragraph", text: t(`${key}.howCounted`) });
    blocks.push({
      type: "notice",
      text: t(`${key}.unsubscribeText`, { brand }),
      link: { label: t(`${key}.unsubscribe`), url: url(data.unsubscribeUrl) ?? page("/account/settings#notifications") },
    });
    return {
      subject: t(`${key}.subject`, { brand, summary }),
      preheader: t(`${key}.preheader`, { dates }),
      heading: t(`${key}.heading`),
      greetingName: data.name?.trim() || null,
      blocks,
      cta: { label: t(`${key}.cta`), url: url(data.listingsUrl) ?? page("/account/listings") },
      audience: "account",
    };
  },
};
