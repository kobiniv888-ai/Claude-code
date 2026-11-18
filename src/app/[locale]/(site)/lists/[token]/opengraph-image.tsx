import { getTranslations } from "next-intl/server";
import { isAppLocale } from "@/i18n/locale";
import { formatNumber } from "@/lib/format";
import { getSharedList, publicListName, sharedListCoverUrl } from "@/lib/lists/server";
import { hasArabicScript, truncateText } from "@/lib/og/bidi";
import { OG_SIZE, asJpeg, listingShareImage } from "@/lib/og/share-image";
import { shareText } from "@/lib/og/share-text";
import { rateLimitByIp } from "@/lib/rate-limit";

/**
 * A shared list's preview image (WhatsApp, Telegram…; round 3, brief 7.2): the first place's
 * photo with the purple bar holding the list's name and "N places · Shared list". Nothing else
 * about the list or its owner. Like the page, it is a 404 once sharing stops, and it is never
 * cached (a stopped list must not keep its preview).
 *
 * JPEG, like the listing images: a photo as PNG is ~1 MB, over WhatsApp's preview limit.
 */

export const alt = "Bayit · בית";
export const size = OG_SIZE;
export const contentType = "image/jpeg";

/** Name characters that fit on the bar's one line at 42px. */
const NAME_MAX_CHARS = 36;
const PRIVATE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } as const;

export default async function Image({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale: raw, token } = await params;
  const locale = isAppLocale(raw) ? raw : "en";
  const limited = await rateLimitByIp("lists-og", { limit: 120, windowSeconds: 60 });
  if (!limited.ok) return new Response(null, { status: 429, headers: PRIVATE });
  const shared = await getSharedList(token);
  if (!shared) return new Response(null, { status: 404, headers: PRIVATE });

  // Arabic pages share English text (Satori cannot shape Arabic): see src/lib/og/share-text.ts.
  const text = shareText(locale);
  const [common, t] = await Promise.all([
    getTranslations({ locale: text.locale, namespace: "common" }),
    getTranslations({ locale: text.locale, namespace: "lists" }),
  ]);
  const name = publicListName(shared, { defaultName: t("saving.defaultName"), fallback: t("shared.eyebrow") });
  const count = shared.listingIds.length;
  const image = await listingShareImage({
    name: text.name,
    tagline: common("siteTagline"),
    // An Arabic list name cannot be drawn: the image then says "Shared list".
    title: truncateText(hasArabicScript(name) ? t("shared.eyebrow") : name, NAME_MAX_CHARS),
    price: t("og.places", { count, countText: formatNumber(count, text.locale) }),
    photoUrl: await sharedListCoverUrl(shared.listingIds),
  });
  const jpeg = await asJpeg(image);
  return new Response(jpeg.body, { headers: { "Content-Type": "image/jpeg", ...PRIVATE } });
}
