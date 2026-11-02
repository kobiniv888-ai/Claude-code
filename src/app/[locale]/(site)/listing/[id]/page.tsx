import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ContactProvider, type ContactAvailability } from "@/components/contact/contact-provider";
import { MobileContactBar } from "@/components/contact/mobile-contact-bar";
import { Container } from "@/components/common/container";
import { JsonLd } from "@/components/common/json-ld";
import { CardCarousel } from "@/components/ds/card-carousel";
import { SectionHeader } from "@/components/ds/section-header";
import { HideBottomNav } from "@/components/layout/hide-bottom-nav";
import { ListingCard } from "@/components/listing/listing-card";
import { ListingCardSkeleton } from "@/components/listing/listing-card-skeleton";
import { Price } from "@/components/listing/price";
import { AvailabilityPicker } from "@/components/listing-page/availability-picker";
import { BookingBar, BookingBox, DatesSheet } from "@/components/listing-page/booking-bar";
import { ContactBox, HostCard, OwnerHeader, ShabbatReplyNotice, type ShabbatNow } from "@/components/listing-page/contact-box";
import { Gallery } from "@/components/listing-page/gallery";
import { AmenitiesSection, DetailsSection, ImportantToKnow, SalePriceSection } from "@/components/listing-page/info-sections";
import { KosherShabbatSection } from "@/components/listing-page/kosher-shabbat";
import { Highlights, HostLine, TitleBlock } from "@/components/listing-page/listing-header";
import { ListingDescription, ListingTextProvider, TranslationSwitch } from "@/components/listing-page/listing-text";
import { LocationSection } from "@/components/listing-page/location-section";
import { RoomTypesSection } from "@/components/listing-page/room-types";
import { Section } from "@/components/listing-page/section";
import { StatusBanner } from "@/components/listing-page/status-banner";
import { StayProvider } from "@/components/listing-page/stay-dates";
import { bookRequestFrom } from "@/lib/booking/guest";
import { ViewTracker } from "@/components/listing-page/view-tracker";
import { ReportButton } from "@/components/report/report-dialog";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { Link, redirect } from "@/i18n/navigation";
import { isBlockedBetween } from "@/lib/contact/server";
import { stayQuery, stayRequestFrom } from "@/lib/contact/message";
import { formatMoney } from "@/lib/format";
import { isShabbatOrHolidayNow } from "@/lib/hebcal";
import { previewReason } from "@/lib/listing-page/access";
import { georgiaToday } from "@/lib/listing-page/calendar";
import { getCardContext } from "@/lib/listing-page/context";
import { hasKosherShabbat, listingHighlights } from "@/lib/listing-page/highlights";
import { buildListingJsonLd } from "@/lib/listing-page/jsonld";
import { getListingPaths, isListingSaved } from "@/lib/listing-page/load";
import { parseVideoUrl, safeExternalUrl } from "@/lib/listing-page/media";
import { verifiedNearestSynagogue } from "@/lib/listing-page/places";
import { resolveListing } from "@/lib/listing-page/resolve";
import { rangeIsFree } from "@/lib/listing-page/stay";
import type { ListingPageData } from "@/lib/listing-page/types";
import { getSimilarListings } from "@/lib/listing/queries";
import { hasWelcomePledge } from "@/lib/pledge/pledge";
import { listingPath, listingSlugParam, searchPath } from "@/lib/listing/urls";
import { absoluteMediaUrl } from "@/lib/media";
import { absoluteUrl, localizedPath, pageMetadata, X_DEFAULT_LOCALE } from "@/lib/seo";
import { isShabbatModeActive } from "@/lib/settings";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PERIODS = ["NIGHT", "WEEK", "MONTH"] as const;

function priceText(data: ListingPageData, locale: AppLocale, t: (key: string, values?: Record<string, string>) => string): string | null {
  if (!data.price || data.price <= 0) return null;
  const amount = formatMoney(data.price, data.currency, locale);
  const withPeriod = (PERIODS as readonly string[]).includes(data.pricePeriod)
    ? t(`meta.per.${data.pricePeriod}`, { price: amount })
    : amount;
  return data.priceIsFrom ? t("meta.from", { price: withPeriod }) : withPeriod;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isAppLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "listing" });
  const resolved = await resolveListing(locale, id);
  if (!resolved) return { title: t("notFound.title"), robots: { index: false, follow: true } };
  const { data, access } = resolved;
  const place = [data.neighborhoodName, data.city?.name].filter(Boolean).join(", ");
  const price = priceText(data, locale, t as never);
  const path = listingPath(data.publicId, data.title.shown);
  const meta = pageMetadata({
    locale,
    path,
    title: data.city ? t("meta.title", { title: data.title.shown, city: data.city.name }) : data.title.shown,
    description: [price, place].filter(Boolean).join(" · ") || data.description.shown.slice(0, 160),
    // The photo with the purple bar and logo: ./opengraph-image.tsx.
    image: "route",
    noIndex: access !== "public",
  });
  const paths = await getListingPaths(data.id);
  if (paths) {
    const languages = Object.fromEntries(Object.entries(paths).map(([l, p]) => [l, absoluteUrl(localizedPath(l, p))]));
    languages["x-default"] = absoluteUrl(localizedPath(X_DEFAULT_LOCALE, paths[X_DEFAULT_LOCALE]));
    meta.alternates = { canonical: absoluteUrl(localizedPath(locale, path)), languages };
  }
  return meta;
}

/**
 * The listing page, quiet: every fact once (brief 5.4). Short stays and hotel rooms, top to
 * bottom: gallery, title + facts, host line with the pledge, three highlights, description,
 * amenities, "Kosher and Shabbat" (folded), availability, location, "Good to know", the host
 * card, similar places; a sticky bar with the price and "Book". Rentals and sales: the same page
 * without the calendar, with the WhatsApp / "Show phone" bar.
 */
export default async function ListingPage({ params, searchParams }: Props) {
  const { locale: rawLocale, id } = await params;
  if (!isAppLocale(rawLocale)) notFound();
  const locale: AppLocale = rawLocale;
  setRequestLocale(locale);

  const resolved = await resolveListing(locale, id);
  if (!resolved) notFound();
  const { data, access, user, settings, ownerId } = resolved;
  const query = await searchParams;
  const stay = stayRequestFrom(query);

  // One canonical address per language: /listing/<id>-<slug of the title in this language>.
  const canonical = listingSlugParam(data.publicId, data.title.shown);
  if (id !== canonical) redirect({ href: `/listing/${canonical}${stayQuery(stay)}`, locale });

  const isPublic = access === "public";
  const isOwner = user?.id === ownerId;
  const [t, nonce, shabbatMode, blocked, isFavorite, synagogue] = await Promise.all([
    getTranslations({ locale, namespace: "listing" }),
    headers().then((h) => h.get("x-nonce") ?? undefined),
    isShabbatModeActive(),
    user && !isOwner ? isBlockedBetween(user.id, ownerId) : Promise.resolve(false),
    user ? isListingSaved(user.id, data.id) : Promise.resolve(false),
    verifiedNearestSynagogue(data.nearby, locale),
  ]);

  const availability: ContactAvailability = !isPublic ? "preview" : isOwner ? "own" : blocked ? "blocked" : "ok";
  const nowIso = new Date().toISOString();
  const today = georgiaToday(new Date(nowIso));
  let shabbatNow: ShabbatNow = { active: false, kind: null };
  if (data.city && (data.owner.badges.keepsShabbat || data.noReplyOnShabbat)) {
    try {
      const now = isShabbatOrHolidayNow({ lat: data.city.lat, lng: data.city.lng, timezone: data.city.timezone });
      shabbatNow = { active: now.active, kind: now.kind };
    } catch (error) {
      console.error("[listing] Shabbat check failed", error);
    }
  }

  const reason = previewReason(resolved.accessInput, { demoVisible: settings.demoDataVisible });
  const video = parseVideoUrl(data.videoUrl);
  const tourUrl = safeExternalUrl(data.tour360Url);
  const path = listingPath(data.publicId, data.title.shown);
  const shareUrl = absoluteUrl(localizedPath(locale, path));
  const place = [data.neighborhoodName, data.city?.name].filter(Boolean).join(" · ");
  const cityFilter = data.city ? searchPath({ city: data.city.slug }) : "/search";
  const isStay = data.dealType === "SHORT_STAY" || data.dealType === "HOTEL_ROOM";
  const isSale = data.dealType === "SALE";
  const originalLanguage = siteConfig.i18n.nativeNames[data.originalLocale];
  const jsonLd = buildListingJsonLd(data, {
    url: shareUrl,
    images: data.photos.slice(0, 6).map((p) => absoluteMediaUrl(p.large)),
    inLanguage: locale,
  });
  const welcomes = hasWelcomePledge(data.owner, settings);
  const verified = data.owner.badges.idVerified || data.owner.badges.businessVerified || data.ownerVerified || data.propertyVerified;
  const highlights = listingHighlights(data);
  const showKosher = hasKosherShabbat({
    ...data,
    hostKeepsShabbat: data.owner.badges.keepsShabbat,
    verifiedSynagogue: !!synagogue,
  });
  const tags = [...(data.isDemo ? (["demo"] as const) : []), ...(data.promoted ? (["promoted"] as const) : [])];
  // Booking (short stays, hotel rooms): public listings, not your own. Others keep the contact bar.
  const booking = isStay && isPublic && !isOwner;
  const contactBarShown = !booking && availability === "ok" && data.contactChannels.length > 0;
  // Dates from a search link stay only when every night is free (else the guest picks again).
  const initialDates =
    stay.checkIn && stay.checkOut && stay.checkIn >= today && rangeIsFree(data.blocks, stay.checkIn, stay.checkOut)
      ? { checkIn: stay.checkIn, checkOut: stay.checkOut }
      : { checkIn: null, checkOut: null };
  const report = isPublic && !isOwner ? <ReportButton targetType="LISTING" targetId={data.id} /> : null;

  const page = (
    <>
      <HideBottomNav />
      {reason && !isPublic ? <StatusBanner reason={reason} isOwner={isOwner} /> : null}

      <Container className="hidden pt-5 md:block">
        <nav aria-label={t("breadcrumbs.label")} className="mb-4 text-small text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/search" className="rounded hover:text-foreground hover:underline">
                {t("breadcrumbs.search")}
              </Link>
            </li>
            {data.city ? (
              <>
                <li aria-hidden>/</li>
                <li>
                  <Link href={cityFilter} className="rounded hover:text-foreground hover:underline">
                    {data.city.name}
                  </Link>
                </li>
              </>
            ) : null}
            <li aria-hidden>/</li>
            <li aria-current="page" dir="auto" className="max-w-[40ch] truncate">
              {data.title.shown}
            </li>
          </ol>
        </nav>
      </Container>
      <div className="md:mx-auto md:max-w-content md:px-6">
        <Gallery
          photos={data.photos}
          title={data.title.shown}
          video={video}
          tourUrl={tourUrl}
          backHref={cityFilter}
          shareUrl={shareUrl}
          favorite={isPublic ? { listingId: data.id, isFavorite } : null}
        />
      </div>

      <Container className="pt-4 pb-10 lg:pt-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-x-14">
          <div className="grid min-w-0 content-start gap-8 [&>:empty]:hidden">
            <div className="grid gap-4">
              <TitleBlock data={data} tags={tags} />
              <HostLine data={data} verified={verified} welcomes={welcomes} />
              <Highlights items={highlights} />
            </div>

            <Section id="description" title={t("description.title")}>
              <div className="grid gap-2">
                <ListingDescription footer={<TranslationSwitch auto={data.isAutoTranslated} originalLanguage={originalLanguage} />} />
                <TranslationSwitch auto={data.isAutoTranslated} originalLanguage={originalLanguage} />
              </div>
            </Section>

            <RoomTypesSection rooms={data.roomTypes} />
            <AmenitiesSection amenities={data.amenities} highlights={highlights} />
            {showKosher ? <KosherShabbatSection data={data} synagogue={synagogue} /> : null}
            {isSale ? <SalePriceSection data={data} /> : null}
            {!isStay ? <DetailsSection data={data} /> : null}
            {isStay ? (
              <Section id="availability" title={t("calendar.title")}>
                <AvailabilityPicker />
              </Section>
            ) : null}
            <LocationSection data={data} place={place} />
            <ImportantToKnow data={data} />
            <HostCard data={data} nowIso={nowIso} shabbatNow={shabbatNow} showContact={!booking && !contactBarShown} report={report} />
          </div>

          <aside aria-label={booking ? t("booking.boxLabel") : t("contactBox.label")} className="hidden lg:col-start-2 lg:row-start-1 lg:block">
            <div className="sticky top-[calc(var(--header-height)+1.5rem)]">
              {booking ? <BookingBox /> : <ContactBox data={data} shabbatNow={shabbatNow} />}
            </div>
          </aside>
        </div>

        {isPublic ? (
          <Suspense fallback={<SimilarSkeleton />}>
            <SimilarListings listingId={data.id} locale={locale} cityHref={cityFilter} />
          </Suspense>
        ) : null}
      </Container>

      {booking ? (
        <>
          <BookingBar />
          <DatesSheet />
        </>
      ) : (
        <MobileContactBar
          price={<Price amount={data.price} currency={data.currency} period={data.pricePeriod} from={data.priceIsFrom} size="line" stacked showOriginal={false} className="whitespace-normal" />}
          owner={
            <div className="grid gap-3">
              <OwnerHeader owner={data.owner} sale={isSale} />
              <ShabbatReplyNotice now={shabbatNow} />
            </div>
          }
        />
      )}
      <ViewTracker listingId={data.id} publicId={data.publicId} isPublic={isPublic} />
      {isPublic ? <JsonLd data={jsonLd} nonce={nonce} /> : null}
    </>
  );

  return (
    <ListingTextProvider title={data.title} description={data.description} translated={data.isTranslated}>
      <ContactProvider
        listing={{ id: data.id, publicId: data.publicId, title: data.title.shown, url: shareUrl, dealType: data.dealType, channels: data.contactChannels }}
        availability={availability}
        stay={stay}
        shabbatModeActive={shabbatMode.active}
      >
        {isStay ? (
          <StayProvider
            initial={initialDates}
            guests={stay.guests}
            initialGuests={bookRequestFrom(query, data.maxGuests).guests}
            maxGuests={data.maxGuests}
            instant={data.bookingMode === "INSTANT"}
            blocks={data.blocks}
            today={today}
            minNights={data.minStayNights}
            price={{ amount: data.price, currency: data.currency, period: data.pricePeriod, from: data.priceIsFrom, cleaningFee: data.cleaningFee, weekendPrice: data.weekendPrice }}
            listingPath={path}
          >
            {page}
          </StayProvider>
        ) : (
          page
        )}
      </ContactProvider>
    </ListingTextProvider>
  );
}

/**
 * The photo widths of CardCarousel's default cards in the main column (85% on phones, 46% from
 * 640px, 31.5% / 23.6% of the column next to the 23rem booking box from 1024px / 1280px).
 */
const SIMILAR_CARD_SIZES = "(min-width: 1280px) 200px, (min-width: 1024px) 250px, (min-width: 640px) 44vw, 80vw";

/** "Similar places": the shared listing card in a swipe row (streams in after the page). */
async function SimilarListings({ listingId, locale, cityHref }: { listingId: string; locale: AppLocale; cityHref: string }) {
  const [t, listings] = await Promise.all([
    getTranslations({ locale, namespace: "listing.similar" }),
    getCardContext(locale).then((context) => getSimilarListings(listingId, context, 8)),
  ]);
  if (listings.length === 0) return null;
  return (
    <section aria-labelledby="similar-title" className="mt-10 grid gap-4 border-t border-border pt-8">
      <SectionHeader id="similar-title" title={t("title")} href={cityHref} linkLabel={t("viewAll")} />
      {/* Cancel the Container's padding: the carousel adds the page gutter itself. */}
      <div className="-mx-4 md:-mx-6">
        <CardCarousel label={t("title")}>
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} sizes={SIMILAR_CARD_SIZES} />
          ))}
        </CardCarousel>
      </div>
    </section>
  );
}

function SimilarSkeleton() {
  return (
    <div className="mt-10 grid gap-4 border-t border-border pt-8" aria-hidden>
      <div className="h-7 w-48 rounded-md skeleton-shimmer" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <ListingCardSkeleton key={i} className="w-[70%] shrink-0 sm:w-[46%] lg:w-[31.5%] xl:w-[23.6%]" />
        ))}
      </div>
    </div>
  );
}
