import { getTranslations } from "next-intl/server";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { getCurrentUser } from "@/lib/auth/session";
import { getGuestTrip } from "@/lib/booking/queries";
import { formatDate, formatMoney } from "@/lib/format";
import { buildBookingIcs } from "@/lib/ical";
import { rateLimitByIp, rateLimitHeaders } from "@/lib/rate-limit";

/**
 * GET /api/ical/booking/<code>(.ics)?lang=he — "הוספה ליומן" on the booking confirmation.
 * Only for the signed-in guest of a CONFIRMED booking: the file holds the exact address and the
 * host's phone. Texts in `lang` (else the account's language).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = { limit: 60, windowSeconds: 60 };
const NO_STORE = { "Cache-Control": "private, no-store" };

type Context = { params: Promise<{ code: string }> };

function plain(status: number, text: string): Response {
  return new Response(`${text}\n`, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...NO_STORE } });
}

export async function GET(request: Request, context: Context) {
  const rate = await rateLimitByIp("ical:booking", LIMIT);
  if (!rate.ok) return new Response("Too many requests\n", { status: 429, headers: rateLimitHeaders(rate, LIMIT.limit) });

  const user = await getCurrentUser();
  if (!user) return plain(401, "Sign in to download this booking");

  const { code: raw } = await context.params;
  const code = decodeURIComponent(raw ?? "").replace(/\.ics$/i, "");
  const lang = new URL(request.url).searchParams.get("lang");
  const locale: AppLocale = isAppLocale(lang) ? lang : isAppLocale(user.locale) ? user.locale : siteConfig.i18n.fallbackLocale;

  try {
    const trip = await getGuestTrip(user.id, code, locale);
    if (!trip || trip.status !== "CONFIRMED" || !trip.reveal) return plain(404, "Not found");

    const t = await getTranslations({ locale, namespace: "booking" });
    const brand = siteConfig.localizedName[locale] ?? siteConfig.name;
    const base = siteConfig.url.replace(/\/+$/, "");
    const url = `${base}/${locale}${trip.path}`;
    const { reveal } = trip;
    const phone = reveal.contact.phone ?? reveal.contact.whatsapp;
    const description = [
      t("ics.booking", { code: trip.code, brand }),
      trip.checkInFrom ? t("ics.checkIn", { date: formatDate(trip.checkIn, locale), time: trip.checkInFrom }) : "",
      trip.checkOutUntil ? t("ics.checkOut", { date: formatDate(trip.checkOut, locale), time: trip.checkOutUntil }) : "",
      reveal.hostName ? t("ics.host", { name: reveal.hostName }) : "",
      phone ? t("ics.phone", { phone }) : "",
      t("ics.pay", { amount: formatMoney(trip.total, trip.currency, locale) }),
      t("ics.details", { url }),
    ];
    const body = buildBookingIcs({
      code: trip.code,
      checkIn: trip.checkIn,
      checkOut: trip.checkOut,
      summary: t("ics.summary", { title: trip.listing.title, code: trip.code }),
      description,
      location: reveal.address,
      lat: reveal.lat,
      lng: reveal.lng,
      url,
    });
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${trip.code}.ics"`,
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
        ...NO_STORE,
      },
    });
  } catch (error) {
    console.error("[ical] booking file failed:", error);
    return plain(500, "Server error");
  }
}
