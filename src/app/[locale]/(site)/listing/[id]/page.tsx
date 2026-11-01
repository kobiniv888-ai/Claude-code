import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { FlagIcon } from "lucide-react";
import { ContactProvider, type ContactAvailability } from "@/components/contact/contact-provider";
import { MobileContactBar } from "@/components/contact/mobile-contact-bar";
import { Container } from "@/components/common/container";
import { JsonLd } from "@/components/common/json-ld";
import { SafetyTip } from "@/components/common/safety-tip";
import { CardCarousel } from "@/components/ds/card-carousel";
import { listingBadgeItems, type BadgeItem } from "@/components/ds/badges";
import { SectionHeader } from "@/components/ds/section-header";
import { HideBottomNav } from "@/components/layout/hide-bottom-nav";
import { CompareToggle } from "@/components/listing/compare-toggle";
import { FavoriteButton } from "@/components/listing/favorite-button";
import { ListingCard } from "@/components/listing/listing-card";
import { ListingCardSkeleton } from "@/components/listing/listing-card-skeleton";
import { Price } from "@/components/listing/price";
import { AvailabilityCalendar } from "@/components/listing-page/availability-calendar";
import { ContactBox, HostCard, OwnerHeader, ShabbatReplyNotice, VideoTip, type ShabbatNow } from "@/components/listing-page/contact-box";
import { Gallery } from "@/components/listing-page/gallery";
import { AmenitiesSection, CostsSection, DetailsSection, RulesSection } from "@/components/listing-page/info-sections";
import { KeyFacts } from "@/components/listing-page/key-facts";
import { PriceBlock, TitleBlock } from "@/components/listing-page/listing-header";
import { ListingDescription, ListingTextProvider, TranslationSwitch } from "@/components/listing-page/listing-text";
import { LocationSection } from "@/components/listing-page/location-section";
import { RoomTypesSection } from "@/components/listing-page/room-types";
import { Section } from "@/components/listing-page/section";
import { ShareMenu } from "@/components/listing-page/share-menu";
import { StatusBanner } from "@/components/listing-page/status-banner";
import { TraditionCard } from "@/components/listing-page/tradition-card";
import { ViewTracker } from "@/components/listing-page/view-tracker";
import { ReportButton } from "@/components/report/report-dialog";
import { HolidaysInRange } from "@/components/shabbat";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isBlockedBetween } from "@/lib/contact/server";
import { stayQuery, stayRequestFrom } from "@/lib/contact/message";
import { formatMoney } from "@/lib/format";
import { isShabbatOrHolidayNow } from "@/lib/hebcal";
import { listingAccess, previewReason } from "@/lib/listing-page/access";
import { getCardContext } from "@/lib/listing-page/context";
import { buildListingJsonLd } from "@/lib/listing-page/jsonld";
import { getListingPage, getListingPaths, isListingSaved, toListingViewer } from "@/lib/listing-page/load";
import { parseVideoUrl, safeExternalUrl } from "@/lib/listing-page/media";
import { getCommunityPlacesNear } from "@/lib/listing-page/places";
import type { ListingPageData } from "@/lib/listing-page/types";
import { getSimilarListings } from "@/lib/listing/queries";
import { hasWelcomePledge } from "@/lib/pledge/pledge";
import { listingPath, listingSlugParam, parseListingParam, searchPath } from "@/lib/listing/urls";
import { absoluteMediaUrl } from "@/lib/media";
import { absoluteUrl, localizedPath, pageMetadata, X_DEFAULT_LOCALE } from "@/lib/seo";
import { getSettings, isShabbatModeActive } from "@/lib/settings";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PERIODS = ["NIGHT", "WEEK", "MONTH"] as const;

/** Loads the listing and decides access for this visitor (shared by metadata and the page). */
async function resolve(locale: AppLocale, id: string) {
  const publicId = parseListingParam(id);
  if (!publicId) return null;
  const [loaded, user, settings] = await Promise.all([
    getListingPage(publicId, locale),
    getCurrentUser().catch(() => null),
    getSettings(),
  ]);
  if (!loaded) return null;
  const access = listingAccess(loaded.access, toListingViewer(user), { demoVisible: settings.demoDataVisible });
  if (access === "none") return null;
  return { data: loaded.data, ownerId: loaded.ownerId, accessInput: loaded.access, user, settings, access };
}

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
  const resolved = await resolve(locale, id);
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
    image: data.ogImage ? { url: absoluteMediaUrl(data.ogImage), width: 1200, height: 630 } : undefined,
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

export default async function ListingPage({ params, searchParams }: Props) {
  const { locale: rawLocale, id } = await params;
  if (!isAppLocale(rawLocale)) notFound();
  const locale: AppLocale = rawLocale;
  setRequestLocale(locale);

  const resolved = await resolve(locale, id);
  if (!resolved) notFound();
  const { data, access, user, settings, ownerId } = resolved;
  const query = await searchParams;
  const stay = stayRequestFrom(query);

  // One canonical address per language: /listing/<id>-<slug of the title in this language>.
  const canonical = listingSlugParam(data.publicId, data.title.shown);
  if (id !== canonical) redirect({ href: `/listing/${canonical}${stayQuery(stay)}`, locale });

  const isPublic = access === "public";
  const isOwner = user?.id === ownerId;
  const [t, nonce, shabbatMode, blocked, isFavorite, communityPlaces] = await Promise.all([
    getTranslations({ locale, namespace: "listing" }),
    headers().then((h) => h.get("x-nonce") ?? undefined),
    isShabbatModeActive(),
    user && !isOwner ? isBlockedBetween(user.id, ownerId) : Promise.resolve(false),
    user ? isListingSaved(user.id, data.id) : Promise.resolve(false),
    getCommunityPlacesNear(data.approx, locale),
  ]);

  const availability: ContactAvailability = !isPublic ? "preview" : isOwner ? "own" : blocked ? "blocked" : "ok";
  const nowIso = new Date().toISOString();
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
  const place = [data.neighborhoodName, data.city?.name].filter(Boolean).join(", ");
  const cityFilter = data.city ? searchPath({ city: data.city.slug }) : "/search";
  const isStay = data.dealType === "SHORT_STAY" || data.dealType === "HOTEL_ROOM";
  const originalLanguage = siteConfig.i18n.nativeNames[data.originalLocale];
  const jsonLd = buildListingJsonLd(data, {
    url: shareUrl,
    images: data.photos.slice(0, 6).map((p) => absoluteMediaUrl(p.large)),
    inLanguage: locale,
  });
  const welcomes = hasWelcomePledge(data.owner, settings);
  const verified = data.owner.badges.idVerified || data.ownerVerified || data.propertyVerified;
  const priceDropped =
    !!data.priceDroppedAt && Date.parse(nowIso) - Date.parse(data.priceDroppedAt) <= siteConfig.listings.priceDropLabelDays * 86_400_000;
  // The title row: the promise first, then trust and honest status tags (demo, promoted…).
  const badges: BadgeItem[] = [
    ...listingBadgeItems({ welcomes, verified }),
    ...(data.isDemo ? [{ kind: "demo" as const }] : []),
    ...(data.promoted ? [{ kind: "promoted" as const }] : []),
    ...(data.isNew ? [{ kind: "new" as const }] : []),
    ...(priceDropped ? [{ kind: "priceDropped" as const }] : []),
    ...(data.owner.badges.business ? [{ kind: "business" as const }] : []),
  ];
  const barShown = availability === "ok" && data.contactChannels.length > 0;
  const ownerHeader = (
    <div className="grid gap-3">
      <OwnerHeader owner={data.owner} ownerVerified={data.ownerVerified} propertyVerified={data.propertyVerified} welcomes={welcomes} />
      <ShabbatReplyNotice now={shabbatNow} />
    </div>
  );

  return (
    <ListingTextProvider title={data.title} description={data.description} translated={data.isTranslated}>
      <ContactProvider
        listing={{ id: data.id, publicId: data.publicId, title: data.title.shown, url: shareUrl, dealType: data.dealType, channels: data.contactChannels }}
        availability={availability}
        stay={stay}
        shabbatModeActive={shabbatMode.active}
      >
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
        <div className="md:mx-auto md:max-w-7xl md:px-6 lg:px-8">
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

        <Container className="pt-5 pb-12 lg:pt-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-x-12">
            <div className="grid min-w-0 content-start gap-8">
              <div className="grid gap-5">
                <TitleBlock
                  data={data}
                  badges={badges}
                  actions={
                    isPublic ? (
                      <div className="flex items-center gap-2">
                        <div className="hidden items-center gap-2 md:flex">
                          <ShareMenu url={shareUrl} title={data.title.shown} />
                          <FavoriteButton listingId={data.id} title={data.title.shown} isFavorite={isFavorite} variant="outline" />
                        </div>
                        <CompareToggle publicId={data.publicId} className="h-11 rounded-full" />
                      </div>
                    ) : undefined
                  }
                />
                <PriceBlock data={data} priceDropped={priceDropped} className="lg:hidden" />
                <KeyFacts data={data} />
              </div>

              <TraditionCard data={data} locale={locale} />

              <Section id="description" title={t("description.title")}>
                <div className="grid gap-3">
                  <TranslationSwitch auto={data.isAutoTranslated} originalLanguage={originalLanguage} />
                  <ListingDescription />
                </div>
              </Section>

              <RoomTypesSection rooms={data.roomTypes} />
              <AmenitiesSection amenities={data.amenities} />
              <RulesSection data={data} />
              <CostsSection data={data} />
              {data.dealType !== "SALE" ? <AvailabilityCalendar blocks={data.blocks} nowIso={nowIso} /> : null}
              {isStay && stay.checkIn && stay.checkOut ? (
                <HolidaysInRange start={stay.checkIn} end={stay.checkOut} locale={locale} headingLevel="h3" showHints={false} />
              ) : null}
              <LocationSection data={data} place={place} places={communityPlaces} />
              <DetailsSection data={data} />

              <Section id="host" title={t("host.title")}>
                <HostCard data={data} welcomes={welcomes} nowIso={nowIso} shabbatNow={shabbatNow} showContact={!barShown} />
              </Section>

              {siteConfig.features.reviews ? (
                <Section id="reviews" title={t("reviews.title")}>
                  <p className="text-muted-foreground">{t("reviews.empty")}</p>
                </Section>
              ) : null}

              <section aria-label={t("safety.label")} className="grid gap-3">
                <SafetyTip compact />
                <VideoTip publicId={data.publicId} className="px-1 lg:hidden" />
                {isPublic && !isOwner ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                    <p className="flex items-center gap-2 text-small text-muted-foreground">
                      <FlagIcon className="size-4" aria-hidden />
                      {t("safety.reportHint")}
                    </p>
                    <ReportButton targetType="LISTING" targetId={data.id} />
                  </div>
                ) : null}
              </section>
            </div>

            <aside aria-label={t("contactBox.label")} className="hidden lg:col-start-2 lg:row-start-1 lg:block">
              <div className="sticky top-[calc(var(--header-height)+1.5rem)]">
                <ContactBox data={data} shabbatNow={shabbatNow} />
              </div>
            </aside>
          </div>

          {isPublic ? (
            <Suspense fallback={<SimilarSkeleton />}>
              <SimilarListings listingId={data.id} locale={locale} cityHref={cityFilter} />
            </Suspense>
          ) : null}
        </Container>

        <MobileContactBar
          price={<Price amount={data.price} currency={data.currency} period={data.pricePeriod} from={data.priceIsFrom} size="bar" stacked showOriginal={false} />}
          owner={ownerHeader}
        />
        <ViewTracker listingId={data.id} publicId={data.publicId} isPublic={isPublic} />
        {isPublic ? <JsonLd data={jsonLd} nonce={nonce} /> : null}
      </ContactProvider>
    </ListingTextProvider>
  );
}

/** "Similar places": the shared listing card in a swipe row (streams in after the page). */
async function SimilarListings({ listingId, locale, cityHref }: { listingId: string; locale: AppLocale; cityHref: string }) {
  const [t, listings] = await Promise.all([
    getTranslations({ locale, namespace: "listing.similar" }),
    getCardContext(locale).then((context) => getSimilarListings(listingId, context, 8)),
  ]);
  if (listings.length === 0) return null;
  return (
    <section aria-labelledby="similar-title" className="mt-14 grid gap-4 border-t border-border/70 pt-10">
      <SectionHeader id="similar-title" title={t("title")} href={cityHref} linkLabel={t("viewAll")} />
      {/* Cancel the Container's padding: the carousel adds the page gutter itself. */}
      <div className="-mx-4 md:-mx-6">
        <CardCarousel label={t("title")}>
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </CardCarousel>
      </div>
    </section>
  );
}

function SimilarSkeleton() {
  return (
    <div className="mt-14 grid gap-4 border-t border-border/70 pt-10" aria-hidden>
      <div className="h-8 w-48 rounded-md skeleton-shimmer" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <ListingCardSkeleton key={i} className="w-[85%] shrink-0 sm:w-[46%] lg:w-[31.5%] xl:w-[23.6%]" />
        ))}
      </div>
    </div>
  );
}
