import { getTranslations } from "next-intl/server";
import { isAppLocale } from "@/i18n/locale";
import { formatMoney } from "@/lib/format";
import { listingAccess } from "@/lib/listing-page/access";
import { getListingPage } from "@/lib/listing-page/load";
import type { ListingPageData } from "@/lib/listing-page/types";
import { parseListingParam } from "@/lib/listing/urls";
import { truncateText } from "@/lib/og/bidi";
import { OG_SIZE, asJpeg, brandShareImage, listingShareImage } from "@/lib/og/share-image";
import { shareText } from "@/lib/og/share-text";
import { getSettings } from "@/lib/settings";

/**
 * A listing's share image: its first photo with a purple bar holding the logo, the title and the
 * price, in the page's language (Arabic pages: English, see src/lib/og/share-text.ts). Listings
 * that are not public (drafts, hidden demo data…) get the plain brand image: link previews are
 * fetched without a session.
 *
 * The page's metadata leaves og:image to this file (pageMetadata({ image: "route" })): in Next 16 a
 * segment's own openGraph.images win over its opengraph-image file. The URL carries a hash suffix
 * because the route sits in the (site) group: /he/listing/89/opengraph-image-imvy9a.
 */

export const alt = "Bayit · בית";
export const size = OG_SIZE;
/** JPEG: photos as PNG are ~1 MB, too big for WhatsApp link previews. */
export const contentType = "image/jpeg";

const PERIODS = ["NIGHT", "WEEK", "MONTH"] as const;

/** Title characters that fit on the bar's one line at 42px. */
const TITLE_MAX_CHARS = 36;

export default async function Image({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const locale = isAppLocale(raw) ? raw : "en";
  const text = shareText(locale);
  const [common, t] = await Promise.all([
    getTranslations({ locale: text.locale, namespace: "common" }),
    getTranslations({ locale: text.locale, namespace: "listing" }),
  ]);
  const tagline = common("siteTagline");

  const publicId = parseListingParam(id);
  const [loaded, settings] = publicId ? await Promise.all([getListingPage(publicId, text.locale), getSettings()]) : [null, null];
  if (!loaded || !settings || listingAccess(loaded.access, null, { demoVisible: settings.demoDataVisible }) !== "public") {
    return asJpeg(await brandShareImage({ name: text.name, tagline }));
  }

  const data: ListingPageData = loaded.data;
  let price: string | null = null;
  if (data.price && data.price > 0) {
    const amount = formatMoney(data.price, data.currency, text.locale);
    const withPeriod = (PERIODS as readonly string[]).includes(data.pricePeriod)
      ? t(`meta.per.${data.pricePeriod}` as "meta.per.NIGHT", { price: amount })
      : amount;
    price = data.priceIsFrom ? t("meta.from", { price: withPeriod }) : withPeriod;
  }

  return asJpeg(
    await listingShareImage({
      name: text.name,
      tagline,
      title: truncateText(data.title.shown, TITLE_MAX_CHARS),
      price,
      photoUrl: data.ogImage,
    }),
  );
}
