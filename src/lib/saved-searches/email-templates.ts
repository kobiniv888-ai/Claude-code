/**
 * The saved-search email and the price-drop email (round 3, brief 7.4): their data and layout.
 * Pure (no server imports), like src/lib/email/templates.ts, which registers them. Text lives in
 * messages/<locale>/emails.json under templates.saved_search_matches.*, templates.price_drop.*
 * and savedAlerts.* (the price wording both share).
 *
 * Only TYPES are imported from the email module, so the two files never load each other at run
 * time.
 */
import type { CurrencyCode } from "@/config/site";
import type { PricePeriod } from "@/generated/prisma/enums";
import type { EmailBlock, EmailContent, TemplateContext } from "@/lib/email/templates";
import { formatMoney, formatNumber } from "@/lib/format";

export const SAVED_ALERT_EMAIL_TEMPLATES = ["saved_search_matches", "price_drop"] as const;
export type SavedAlertEmailTemplate = (typeof SAVED_ALERT_EMAIL_TEMPLATES)[number];

/** One place in an email (the card's data in the reader's language). */
export type AlertEmailPlace = {
  title: string;
  publicId: number;
  /** "/listing/1234-sunny-flat" (the email adds the site and the language). */
  url: string;
  /** "Vake, Tbilisi", or null. */
  place: string | null;
  price: number | null;
  currency: CurrencyCode;
  pricePeriod: PricePeriod;
  /** Hotels: the cheapest room type ("from ₾120"). */
  priceIsFrom: boolean;
};

export type SavedAlertEmailData = {
  saved_search_matches: {
    name?: string | null;
    searches: { name: string; url: string; places: AlertEmailPlace[]; more: number; total: number }[];
    /** Searches with new places left for the next email. */
    moreSearches: number;
    /** Different new places in the email (the subject line). */
    totalPlaces: number;
    /** "/account/alerts" */
    manageUrl: string;
    /** The signed one-tap unsubscribe page (src/lib/alerts/unsubscribe-token.ts, "saved_search"). */
    unsubscribeUrl: string;
  };
  price_drop: {
    name?: string | null;
    place: AlertEmailPlace;
    oldPrice: number;
    newPrice: number;
    /** Rounded percentage (at least 3). */
    pct: number;
    /** The saved list the place is in (user text), or null for the default list. */
    listName?: string | null;
    manageUrl: string;
    /** "price_drop" */
    unsubscribeUrl: string;
  };
};

type Builder<K extends SavedAlertEmailTemplate> = (data: SavedAlertEmailData[K], ctx: TemplateContext) => EmailContent;

/** User text inside a sentence keeps its own direction (FSI … PDI), as in the other emails. */
function isolate(value: string): string {
  return value ? `\u2068${value}\u2069` : value;
}

const PERIODS = new Set<PricePeriod>(["NIGHT", "WEEK", "MONTH", "TOTAL"]);

/** "₾55 ללילה", "החל מ-₾120 ללילה", "$95,000". */
export function priceText(amount: number, place: Pick<AlertEmailPlace, "currency" | "pricePeriod" | "priceIsFrom">, ctx: Pick<TemplateContext, "t" | "locale">): string {
  const price = isolate(formatMoney(amount, place.currency, ctx.locale));
  const period = PERIODS.has(place.pricePeriod) ? place.pricePeriod : "TOTAL";
  const withPeriod = ctx.t(`savedAlerts.price.${period}`, { price });
  return place.priceIsFrom ? ctx.t("savedAlerts.priceFrom", { price: withPeriod }) : withPeriod;
}

function placeTitle(place: AlertEmailPlace, ctx: Pick<TemplateContext, "t">): string {
  return place.title.trim() || ctx.t("savedAlerts.untitled", { id: place.publicId });
}

/** "Vake, Tbilisi · ₾55 ללילה" (what is known). */
function placeLine(place: AlertEmailPlace, ctx: Pick<TemplateContext, "t" | "locale">): string {
  const parts: string[] = [];
  if (place.place?.trim()) parts.push(isolate(place.place.trim()));
  if (place.price !== null && place.price > 0) parts.push(priceText(place.price, place, ctx));
  return parts.join(" · ");
}

export const savedAlertEmailBuilders: { [K in SavedAlertEmailTemplate]: Builder<K> } = {
  saved_search_matches: (data, ctx) => {
    const { t, url, page, brand, locale } = ctx;
    const key = "templates.saved_search_matches";
    const count = (n: number) => ({ count: n, countText: formatNumber(n, locale) });
    const blocks: EmailBlock[] = [{ type: "paragraph", text: t(`${key}.intro`, { brand }) }];
    for (const search of data.searches) {
      blocks.push({
        type: "notice",
        text: `${isolate(search.name.trim())}\n${t(`${key}.searchCount`, count(search.total))}`,
        link: { label: t(`${key}.openSearch`), url: url(search.url) ?? page("/search") },
      });
      for (const place of search.places) {
        const line = placeLine(place, ctx);
        blocks.push({
          type: "notice",
          text: line ? `${isolate(placeTitle(place, ctx))}\n${line}` : isolate(placeTitle(place, ctx)),
          link: { label: t(`${key}.openPlace`), url: url(place.url) ?? page("/search") },
        });
      }
      if (search.more > 0) blocks.push({ type: "paragraph", text: t(`${key}.more`, count(search.more)) });
    }
    if (data.moreSearches > 0) blocks.push({ type: "paragraph", text: t(`${key}.moreSearches`, count(data.moreSearches)) });
    blocks.push({
      type: "notice",
      text: t(`${key}.unsubscribeText`, { brand }),
      link: { label: t(`${key}.unsubscribe`), url: url(data.unsubscribeUrl) ?? page("/account/alerts") },
    });
    const single = data.searches.length === 1 ? data.searches[0] : null;
    return {
      subject: single
        ? t(`${key}.subjectOne`, { ...count(data.totalPlaces), name: single.name.trim() })
        : t(`${key}.subjectMany`, count(data.totalPlaces)),
      preheader: t(`${key}.preheader`, { brand }),
      heading: t(`${key}.heading`),
      greetingName: data.name?.trim() || null,
      blocks,
      cta: { label: t(`${key}.cta`), url: url(data.manageUrl) ?? page("/account/alerts") },
      audience: "account",
    };
  },

  price_drop: (data, ctx) => {
    const { t, url, page, brand, locale } = ctx;
    const key = "templates.price_drop";
    const title = placeTitle(data.place, ctx);
    const pct = formatNumber(data.pct, locale);
    const rows: { label: string; value: string; ltr?: boolean }[] = [
      { label: t(`${key}.before`), value: priceText(data.oldPrice, data.place, ctx) },
      { label: t(`${key}.now`), value: priceText(data.newPrice, data.place, ctx) },
      { label: t(`${key}.drop`), value: t(`${key}.dropValue`, { pct }) },
    ];
    if (data.place.place?.trim()) rows.push({ label: t(`${key}.where`), value: data.place.place.trim() });
    if (data.listName?.trim()) rows.push({ label: t(`${key}.list`), value: data.listName.trim() });
    const blocks: EmailBlock[] = [
      { type: "paragraph", text: t(`${key}.intro`, { title: isolate(title) }) },
      { type: "details", rows },
      { type: "paragraph", text: t(`${key}.note`) },
      {
        type: "notice",
        text: t(`${key}.unsubscribeText`, { brand }),
        link: { label: t(`${key}.unsubscribe`), url: url(data.unsubscribeUrl) ?? page("/account/alerts") },
      },
    ];
    return {
      subject: t(`${key}.subject`, { pct, title }),
      preheader: t(`${key}.preheader`, { price: priceText(data.newPrice, data.place, ctx) }),
      heading: t(`${key}.heading`),
      greetingName: data.name?.trim() || null,
      blocks,
      cta: { label: t(`${key}.cta`), url: url(data.place.url) ?? page("/account/favorites") },
      audience: "account",
    };
  },
};
