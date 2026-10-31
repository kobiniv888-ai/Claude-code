import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EyeIcon, HashIcon, MapIcon, MapPinIcon, RefreshCwIcon, ShieldCheckIcon, SparklesIcon, StarIcon } from "lucide-react";
import { ContactProvider, type ContactAvailability } from "@/components/contact/contact-provider";
import { MobileContactBar } from "@/components/contact/mobile-contact-bar";
import { Container } from "@/components/common/container";
import { JsonLd } from "@/components/common/json-ld";
import { Ltr } from "@/components/common/ltr";
import { SafetyTip } from "@/components/common/safety-tip";
import { HideBottomNav } from "@/components/layout/hide-bottom-nav";
import { CompareToggle } from "@/components/listing/compare-toggle";
import { FavoriteButton } from "@/components/listing/favorite-button";
import { FeatureList } from "@/components/listing/feature-list";
import { ListingBadges, ListingLabels } from "@/components/listing/badges";
import { ListingGrid } from "@/components/listing/listing-grid";
import { Price } from "@/components/listing/price";
import { AreaMapLoader } from "@/components/listing-page/area-map-loader";
import { AvailabilityCalendar } from "@/components/listing-page/availability-calendar";
import { ContactBox, OwnerHeader, ShabbatReplyNotice, type ShabbatNow } from "@/components/listing-page/contact-box";
import { Gallery } from "@/components/listing-page/gallery";
import { CostsSection, DetailsSection, RulesSection } from "@/components/listing-page/info-sections";
import { JewishSection } from "@/components/listing-page/jewish-section";
import { KeyFacts } from "@/components/listing-page/key-facts";
import { ListingDescription, ListingTextProvider, ListingTitle, TranslationSwitch } from "@/components/listing-page/listing-text";
import { NearbySection } from "@/components/listing-page/nearby-section";
import { RoomTypesSection } from "@/components/listing-page/room-types";
import { Section } from "@/components/listing-page/section";
import { ShareMenu } from "@/components/listing-page/share-menu";
import { StatusBanner } from "@/components/listing-page/status-banner";
import { ViewTracker } from "@/components/listing-page/view-tracker";
import { ReportButton } from "@/components/report/report-dialog";
import { HolidaysInRange, ShabbatTimesCard } from "@/components/shabbat";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isBlockedBetween } from "@/lib/contact/server";
import { stayQuery, stayRequestFrom } from "@/lib/contact/message";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { isShabbatOrHolidayNow } from "@/lib/hebcal";
import { listingAccess, previewReason } from "@/lib/listing-page/access";
import { getCardContext } from "@/lib/listing-page/context";
import { buildListingJsonLd } from "@/lib/listing-page/jsonld";
import { getListingPage, getListingPaths, isListingSaved, toListingViewer } from "@/lib/listing-page/load";
import { parseVideoUrl, safeExternalUrl } from "@/lib/listing-page/media";
import type { ListingPageData } from "@/lib/listing-page/types";
import { getSimilarListings } from "@/lib/listing/queries";
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
  const [t, nonce, shabbatMode, blocked, similar, isFavorite] = await Promise.all([
    getTranslations({ locale, namespace: "listing" }),
    headers().then((h) => h.get("x-nonce") ?? undefined),
    isShabbatModeActive(),
    user && !isOwner ? isBlockedBetween(user.id, ownerId) : Promise.resolve(false),
    isPublic ? getCardContext(locale).then((c) => getSimilarListings(data.id, c, 8)) : Promise.resolve([]),
    user ? isListingSaved(user.id, data.id) : Promise.resolve(false),
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
  const badges = {
    verified: data.owner.badges.idVerified || data.ownerVerified,
    business: data.owner.badges.business,
    shabbatFriendly: data.isShabbatFriendly,
    kosherKitchen: data.kitchenKosher === "KOSHER",
    synagogueWalkMin: null,
  };
  const priceDropped =
    !!data.priceDroppedAt && Date.parse(nowIso) - Date.parse(data.priceDroppedAt) <= siteConfig.listings.priceDropLabelDays * 86_400_000;

  return (
    <ListingTextProvider title={data.title} description={data.description} translated={data.isTranslated}>
      <ContactProvider
        listing={{ id: data.id, publicId: data.publicId, title: data.title.shown, dealType: data.dealType, channels: data.contactChannels }}
        availability={availability}
        stay={stay}
        shabbatModeActive={shabbatMode.active}
      >
        <HideBottomNav />
        {reason && !isPublic ? <StatusBanner reason={reason} isOwner={isOwner} /> : null}
        <Container className="pt-4 pb-12 sm:pt-6">
          <nav aria-label={t("breadcrumbs.label")} className="mb-3 text-sm text-muted-foreground">
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
              <li aria-current="page">
                {t.rich("header.listingId", { id: data.publicId, ltr: (chunks) => <Ltr>{chunks}</Ltr> })}
              </li>
            </ol>
          </nav>

          <Gallery photos={data.photos} title={data.title.shown} video={video} tourUrl={tourUrl} />

          <div className="mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-x-12">
            <header className="grid content-start gap-4">
              <ListingLabels badges={{ isNew: data.isNew, priceDropped, promoted: data.promoted, demo: data.isDemo }} />
              <div className="grid gap-2">
                <ListingTitle />
                <TranslationSwitch auto={data.isAutoTranslated} originalLanguage={originalLanguage} />
              </div>
              {place ? (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPinIcon className="size-4 shrink-0" aria-hidden />
                  <span>{place}</span>
                </p>
              ) : null}
              <div className="lg:hidden">
                <Price amount={data.price} currency={data.currency} period={data.pricePeriod} from={data.priceIsFrom} size="lg" />
              </div>
              <KeyFacts data={data} />
              <ListingBadges badges={badges} size="md" />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <HashIcon className="size-4" aria-hidden />
                  {t.rich("header.listingId", { id: data.publicId, ltr: (chunks) => <Ltr>{chunks}</Ltr> })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <RefreshCwIcon className="size-4" aria-hidden />
                  {t("header.updated", { date: formatDate(data.contentUpdatedAt, locale, { day: "numeric", month: "long", year: "numeric" }) })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <EyeIcon className="size-4" aria-hidden />
                  {t("header.views", { count: data.viewCount, formatted: formatNumber(data.viewCount, locale) })}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ShareMenu url={shareUrl} title={data.title.shown} />
                {isPublic ? (
                  <>
                    <FavoriteButton listingId={data.id} title={data.title.shown} isFavorite={isFavorite} variant="outline" />
                    <CompareToggle publicId={data.publicId} />
                  </>
                ) : null}
              </div>
            </header>

            <aside aria-label={t("contactBox.label")} className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <div className="lg:sticky lg:top-[calc(var(--header-height)+1.5rem)]">
                <ContactBox data={data} shabbatNow={shabbatNow} nowIso={nowIso} />
              </div>
            </aside>

            <div className="grid min-w-0 content-start gap-10">
              <Section id="description" title={t("description.title")}>
                <ListingDescription />
              </Section>

              <RoomTypesSection rooms={data.roomTypes} />

              {data.amenities.length ? (
                <Section id="amenities" title={t("amenities.title")} icon={SparklesIcon}>
                  <FeatureList group="amenity" keys={data.amenities} />
                </Section>
              ) : null}

              <JewishSection data={data} />
              <RulesSection data={data} />
              <CostsSection data={data} />
              <DetailsSection data={data} />
              {data.dealType !== "SALE" ? <AvailabilityCalendar blocks={data.blocks} nowIso={nowIso} /> : null}

              {data.approx ? (
                <Section id="map" title={t("map.title")} description={t("map.note")} icon={MapIcon}>
                  <div dir="ltr" className="isolate h-72 overflow-hidden rounded-2xl border sm:h-96">
                    <AreaMapLoader lat={data.approx.lat} lng={data.approx.lng} label={t("map.label", { place: place || data.title.shown })} />
                  </div>
                </Section>
              ) : null}

              <NearbySection nearby={data.nearby} />

              {data.city ? (
                <section aria-label={t("shabbat.label")} className="grid gap-4 border-t pt-8">
                  <ShabbatTimesCard
                    city={{ name: data.city.name, lat: data.city.lat, lng: data.city.lng, timezone: data.city.timezone }}
                    locale={locale}
                    headingLevel="h2"
                  />
                  {isStay && stay.checkIn && stay.checkOut ? (
                    <HolidaysInRange start={stay.checkIn} end={stay.checkOut} locale={locale} headingLevel="h3" showHints={false} />
                  ) : null}
                </section>
              ) : null}

              {siteConfig.features.reviews ? (
                <Section id="reviews" title={t("reviews.title")} icon={StarIcon}>
                  <p className="text-muted-foreground">{t("reviews.empty")}</p>
                </Section>
              ) : null}

              <section aria-label={t("safety.label")} className="grid gap-3 border-t pt-8">
                <SafetyTip />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheckIcon className="size-4" aria-hidden />
                    {t("safety.reportHint")}
                  </p>
                  {isPublic && !isOwner ? <ReportButton targetType="LISTING" targetId={data.id} /> : null}
                </div>
              </section>
            </div>
          </div>

          {similar.length ? (
            <section aria-labelledby="similar-title" className="mt-14 grid gap-5 border-t pt-10">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h2 id="similar-title" className="text-xl font-semibold tracking-tight">
                  {t("similar.title")}
                </h2>
                <Link href={cityFilter} className="text-sm font-semibold text-primary hover:underline">
                  {t("similar.viewAll")}
                </Link>
              </div>
              <ListingGrid listings={similar} columns={4} priorityCount={0} label={t("similar.title")} />
            </section>
          ) : null}
        </Container>

        <MobileContactBar
          owner={
            <div className="grid gap-3">
              <OwnerHeader owner={data.owner} ownerVerified={data.ownerVerified} propertyVerified={data.propertyVerified} />
              <ShabbatReplyNotice now={shabbatNow} />
            </div>
          }
        />
        <ViewTracker listingId={data.id} publicId={data.publicId} isPublic={isPublic} />
        {isPublic ? <JsonLd data={jsonLd} nonce={nonce} /> : null}
      </ContactProvider>
    </ListingTextProvider>
  );
}
