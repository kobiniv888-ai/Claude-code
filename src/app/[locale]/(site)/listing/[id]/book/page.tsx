import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AskHostButton } from "@/components/booking/ask-host-button";
import { BookingReview } from "@/components/booking/booking-review";
import { Container } from "@/components/common/container";
import { ContactProvider, type ContactAvailability } from "@/components/contact/contact-provider";
import { buttonStyles } from "@/components/ds/button";
import { EmptyState } from "@/components/ds/empty-state";
import { CalendarDaysIcon, CheckIcon, ChevronRightIcon, FlaskConicalIcon, HouseIcon, MoonStarIcon, XIcon } from "@/components/ds/sprite-icons";
import { HideBottomNav } from "@/components/layout/hide-bottom-nav";
import { type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { Link, redirect } from "@/i18n/navigation";
import { firstNameOf, personName } from "@/lib/auth/first-name";
import { getLoginConfig } from "@/lib/auth/config";
import { alertEnvironment } from "@/lib/booking/alerts";
import { getUnavailableDates } from "@/lib/booking/availability";
import { tbilisiToday } from "@/lib/booking/dates";
import { bookRequestFrom, clockText, withBookParams } from "@/lib/booking/guest";
import { getGuestBookingTerms } from "@/lib/booking/guest-review";
import { isBlockedBetween } from "@/lib/contact/server";
import { stayRequestFrom } from "@/lib/contact/message";
import { houseRules, type HouseRule } from "@/lib/listing-page/highlights";
import { resolveListing } from "@/lib/listing-page/resolve";
import { listingPath, listingSlugParam } from "@/lib/listing/urls";
import { absoluteUrl, localizedPath } from "@/lib/seo";
import { isShabbatModeActive } from "@/lib/settings";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "booking.review" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

type Closed = "own" | "notBookable" | "demo" | "shabbat";

const CLOSED_ICONS = { own: HouseIcon, notBookable: CalendarDaysIcon, demo: FlaskConicalIcon, shabbat: MoonStarIcon } as const;

function query(params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) for (const v of [value].flat()) if (typeof v === "string") search.append(key, v);
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** The host's house rules as plain ✓ / ✗ lines (null when the host set none). */
async function HouseRules({ rules, locale }: { rules: HouseRule[]; locale: AppLocale }) {
  if (rules.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "listing.rules" });
  return (
    <ul className="grid gap-1.5 text-small">
      {rules.map((rule) => {
        const allowed = rule.key === "quietHours" ? null : rule.allowed;
        const Icon = allowed === false ? XIcon : CheckIcon;
        return (
          <li key={rule.key} className="flex items-start gap-2">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              {rule.key === "quietHours" ? (
                <>
                  {t("quietHours")}: <bdi>{clockText(rule.from, locale)}</bdi> – <bdi>{clockText(rule.to, locale)}</bdi>
                </>
              ) : (
                t(`${rule.key}.${rule.allowed ? "yes" : "no"}`)
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * /listing/<id>/book?checkIn&checkOut&adults&children&infants&room — "אישור הזמנה" (brief 5.5
 * step 2). Short stays and hotel rooms with instant booking; otherwise a friendly state that
 * offers "Ask the host". The booking itself is created by createBookingAction, which re-checks
 * everything in one locked transaction.
 */
export default async function BookPage({ params, searchParams }: Props) {
  const { locale: rawLocale, id } = await params;
  if (!isAppLocale(rawLocale)) notFound();
  const locale: AppLocale = rawLocale;
  setRequestLocale(locale);

  const resolved = await resolveListing(locale, id);
  if (!resolved) notFound();
  const { data, access, user, ownerId } = resolved;
  const params2 = await searchParams;
  const path = listingPath(data.publicId, data.title.shown);
  const canonical = listingSlugParam(data.publicId, data.title.shown);
  if (id !== canonical) redirect({ href: `/listing/${canonical}/book${query(params2)}`, locale });
  const isStay = data.dealType === "SHORT_STAY" || data.dealType === "HOTEL_ROOM";
  const request = bookRequestFrom(params2, data.maxGuests);
  if (!isStay) redirect({ href: `${path}${withBookParams("", { checkIn: request.checkIn, checkOut: request.checkOut })}`, locale });

  const isOwner = user?.id === ownerId;
  const [terms, t, loginConfig, shabbat, blocked] = await Promise.all([
    headers().then((h) => getGuestBookingTerms(data.id, { alerts: alertEnvironment(h) })),
    getTranslations({ locale, namespace: "booking" }),
    getLoginConfig(locale),
    isShabbatModeActive(),
    user && !isOwner ? isBlockedBetween(user.id, ownerId) : Promise.resolve(false),
  ]);
  if (!terms) notFound();

  const closed: Closed | null = isOwner
    ? "own"
    : access !== "public" || !terms.instant
      ? "notBookable"
      : terms.isDemo && !loginConfig.codeDisplay && !user?.isDemo
        ? "demo"
        : shabbat.active
          ? "shabbat"
          : null;

  const availability: ContactAvailability = access !== "public" ? "preview" : isOwner ? "own" : blocked ? "blocked" : "ok";
  const back = `${path}${withBookParams("", { checkIn: request.checkIn, checkOut: request.checkOut })}`;
  const photo = data.photos[0];
  const rules = houseRules(data);
  const blocks = closed ? [] : await getUnavailableDates(data.id);

  return (
    <ContactProvider
      listing={{
        id: data.id,
        publicId: data.publicId,
        title: data.title.shown,
        url: absoluteUrl(localizedPath(locale, path)),
        dealType: data.dealType,
        channels: data.contactChannels,
      }}
      availability={availability}
      stay={stayRequestFrom(params2)}
      shabbatModeActive={shabbat.active}
    >
      <HideBottomNav />
      <Container className="grid max-w-5xl gap-4 pt-3 pb-6 lg:gap-6 lg:pt-6">
        <div className="grid gap-1">
          <Link
            href={back}
            className="inline-flex min-h-11 items-center gap-1 justify-self-start rounded-md text-small font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronRightIcon className="size-4 ltr:-scale-x-100" aria-hidden />
            {t("review.back")}
          </Link>
          <h1 className="text-h1">{t("review.title")}</h1>
        </div>

        {closed ? (
          <EmptyState
            icon={CLOSED_ICONS[closed]}
            title={t(`closed.${closed}Title`)}
            description={t(`closed.${closed}Text`)}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {closed === "notBookable" || closed === "shabbat" ? <AskHostButton /> : null}
                <Link href={back} className={buttonStyles({ variant: "secondary", size: "md" })}>
                  {t("review.back")}
                </Link>
              </div>
            }
          />
        ) : (
          <BookingReview
            listing={{
              id: data.id,
              title: data.title.shown,
              place: [data.neighborhoodName, data.city?.name].filter(Boolean).join(" · "),
              photo: photo ? { src: photo.medium, alt: photo.alt } : null,
              path,
            }}
            terms={terms}
            initial={request}
            blocks={blocks}
            today={tbilisiToday()}
            user={
              user
                ? { name: (user.isDemo ? personName(user) : firstNameOf(user)) ?? "", verifiedPhone: user.phoneNumberVerified && user.phoneNumber ? user.phoneNumber : null }
                : null
            }
            phoneConfig={loginConfig.phone}
            houseRules={<HouseRules rules={rules} locale={locale} />}
          />
        )}
      </Container>
    </ContactProvider>
  );
}
