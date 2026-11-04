import { AlertTriangle, ArrowRight, Copy, ExternalLink, MapPin, MonitorSmartphone, StickyNote } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { AccountMarkers, ListingStatusBadge, ReportStatusBadge, RiskChip, UserStatusBadge } from "@/components/admin/badges";
import { ExactLocationMapLoader } from "@/components/admin/exact-location-map-loader";
import { AdminPrice, ListingThumb, PublicId, WhenText } from "@/components/admin/listing-bits";
import { ModerationActions } from "@/components/admin/moderation-actions";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { Ltr } from "@/components/common/ltr";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { pickLocalized } from "@/i18n/locale";
import { riskLevel } from "@/lib/admin/risk";
import { getListingForReview, nextInReview } from "@/lib/admin/server/moderation";
import { cityName, coverUrl, realEmail } from "@/lib/admin/server/shared";
import { requireStaff } from "@/lib/auth/session";
import { formatArea, formatDate, formatMoney, formatNumber, formatRelativeTime } from "@/lib/format";
import { listingPath } from "@/lib/listing/urls";
import { photoUrl } from "@/lib/media";
import { getSettings } from "@/lib/settings";
import type { CurrencyCode } from "@/config/site";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/moderation/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.moderation" });
  return { title: t("detailTitle"), robots: { index: false, follow: false } };
}

export default async function ModerationDetailPage({ params }: PageProps<"/[locale]/admin/moderation/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireStaff("moderation");
  const data = await getListingForReview(id);
  if (!data) notFound();
  const { listing } = data;

  const [t, tf, tFields, tMod, tRisk, tAdmin, tTimes, settings, next] = await Promise.all([
    getTranslations("admin.moderation"),
    getTranslations("admin.moderation.fields"),
    getTranslations("listingFields"),
    getTranslations("moderation"),
    getTranslations("moderation.risk"),
    getTranslations("admin"),
    getTranslations("wizard.times"),
    getSettings(),
    listing.status === "IN_REVIEW" ? nextInReview(listing.id) : Promise.resolve(null),
  ]);
  const n = (v: number) => formatNumber(v, locale);
  const yesNo = (v: boolean | null | undefined) => (v == null ? "—" : v ? tAdmin("common.yes") : tAdmin("common.no"));
  const money = (v: { toString(): string } | null) =>
    v == null ? null : <Ltr>{formatMoney(Number(v.toString()), listing.currency as CurrencyCode, locale)}</Ltr>;
  const list = (ns: string, values: string[]) =>
    values.length ? values.map((v) => (tFields.has(`${ns}.${v}`) ? tFields(`${ns}.${v}`) : v)).join(", ") : null;
  const owner = listing.owner;
  const city = cityName(listing.city, locale);
  const neighborhood = listing.neighborhood ? pickLocalized(listing.neighborhood.names, locale) : null;
  const level = riskLevel(listing.riskScore, settings.reviewRiskThreshold);
  const ownerEmail = realEmail(owner.email);
  const ownerLanguage = siteConfig.i18n.nativeNames[owner.locale as keyof typeof siteConfig.i18n.nativeNames] ?? owner.locale;

  const facts: { label: ReactNode; value: ReactNode }[] = [
    { label: tf("dealType"), value: tFields(`dealType.${listing.dealType}`) },
    { label: tf("propertyType"), value: tFields(`propertyType.${listing.propertyType}`) },
    { label: tf("price"), value: <AdminPrice amount={listing.price} currency={listing.currency} period={listing.pricePeriod} /> },
    { label: tf("deposit"), value: money(listing.deposit) },
    { label: tf("cleaningFee"), value: money(listing.cleaningFee) },
    {
      label: tf("utilities"),
      value: listing.utilitiesIncluded ? tf("utilitiesIncluded") : money(listing.utilitiesEstimate),
    },
    { label: tf("rooms"), value: listing.rooms != null ? n(Number(listing.rooms)) : null },
    { label: tf("bedrooms"), value: listing.bedrooms != null ? n(listing.bedrooms) : null },
    { label: tf("bathrooms"), value: listing.bathrooms != null ? n(listing.bathrooms) : null },
    {
      label: tf("beds"),
      value:
        listing.bedsSingle || listing.bedsDouble || listing.bedsSofa
          ? tf("bedsValue", { single: n(listing.bedsSingle ?? 0), double: n(listing.bedsDouble ?? 0), sofa: n(listing.bedsSofa ?? 0) })
          : null,
    },
    { label: tf("maxGuests"), value: listing.maxGuests != null ? n(listing.maxGuests) : null },
    { label: tf("size"), value: listing.sizeSqm != null ? <Ltr>{formatArea(listing.sizeSqm, locale)}</Ltr> : null },
    {
      label: tf("floor"),
      value: listing.floor != null ? (listing.totalFloors ? `${n(listing.floor)} / ${n(listing.totalFloors)}` : n(listing.floor)) : null,
    },
    { label: tf("elevator"), value: yesNo(listing.elevator) },
    { label: tf("yearBuilt"), value: listing.yearBuilt != null ? <Ltr>{String(listing.yearBuilt)}</Ltr> : null },
    { label: tf("buildingAge"), value: listing.buildingAge ? tFields(`buildingAge.${listing.buildingAge}`) : null },
    { label: tf("condition"), value: listing.condition ? tFields(`condition.${listing.condition}`) : null },
    { label: tf("furnished"), value: yesNo(listing.furnished) },
    { label: tf("heating"), value: list("heating", listing.heating) },
    { label: tf("views"), value: list("view", listing.views) },
    { label: tf("amenities"), value: list("amenity", listing.amenities) },
    { label: tf("kitchenKosher"), value: listing.kitchenKosher ? tFields(`kitchenKosher.${listing.kitchenKosher}`) : null },
    { label: tf("kosherCert"), value: listing.kosherCertName ? <span dir="auto">{listing.kosherCertName}</span> : null },
    { label: tf("shabbatFeatures"), value: list("shabbatFeature", listing.shabbatFeatures) },
    { label: tf("jewishFeatures"), value: list("jewishFeature", listing.jewishFeatures) },
    { label: tf("hotelJewishFeatures"), value: list("hotelJewishFeature", listing.hotelJewishFeatures) },
    { label: tf("sharedRoomFor"), value: listing.sharedRoomFor ? tFields(`sharedRoomFor.${listing.sharedRoomFor}`) : null },
    { label: tf("synagogueWalk"), value: listing.synagogueWalkMin != null ? tf("minutes", { count: listing.synagogueWalkMin }) : null },
    { label: tf("chabadWalk"), value: listing.chabadWalkMin != null ? tf("minutes", { count: listing.chabadWalkMin }) : null },
    { label: tf("minStay"), value: listing.minStayNights != null ? tf("nights", { count: listing.minStayNights }) : null },
    {
      label: tf("discounts"),
      value:
        listing.weeklyDiscountPct || listing.monthlyDiscountPct
          ? tf("discountsValue", { weekly: n(listing.weeklyDiscountPct ?? 0), monthly: n(listing.monthlyDiscountPct ?? 0) })
          : null,
    },
    {
      label: tf("checkInOut"),
      // "גמיש" (round 3) in words, from the post form's own label.
      value:
        listing.checkInFrom || listing.checkOutUntil || listing.checkInFlexible || listing.checkOutFlexible ? (
          <Ltr>{`${listing.checkInFlexible ? tTimes("flexible") : (listing.checkInFrom ?? "—")} / ${listing.checkOutFlexible ? tTimes("flexible") : (listing.checkOutUntil ?? "—")}`}</Ltr>
        ) : null,
    },
    {
      label: tf("rules"),
      value: tf("rulesValue", {
        smoking: yesNo(listing.smokingAllowed),
        pets: yesNo(listing.petsAllowed),
        parties: yesNo(listing.partiesAllowed),
      }),
    },
    {
      label: tf("quietHours"),
      value: listing.quietHoursFrom ? <Ltr>{`${listing.quietHoursFrom}–${listing.quietHoursTo ?? ""}`}</Ltr> : null,
    },
    {
      label: tf("video"),
      value: listing.videoUrl ? (
        <a href={listing.videoUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-primary hover:underline">
          <Ltr className="break-all">{listing.videoUrl}</Ltr>
        </a>
      ) : null,
    },
    {
      label: tf("tour360"),
      value: listing.tour360Url ? (
        <a href={listing.tour360Url} target="_blank" rel="noopener noreferrer nofollow" className="text-primary hover:underline">
          <Ltr className="break-all">{listing.tour360Url}</Ltr>
        </a>
      ) : null,
    },
    { label: tf("originalLocale"), value: siteConfig.i18n.nativeNames[listing.originalLocale as keyof typeof siteConfig.i18n.nativeNames] ?? listing.originalLocale },
    {
      label: tf("stats"),
      value: tf("statsValue", { views: n(listing.viewCount), contacts: n(listing.contactCount), saves: n(listing.saveCount) }),
    },
    { label: tf("created"), value: formatDate(listing.createdAt, locale) },
    { label: tf("published"), value: listing.publishedAt ? formatDate(listing.publishedAt, locale) : null },
    { label: tf("expires"), value: listing.expiresAt ? formatDate(listing.expiresAt, locale) : null },
    { label: tf("contentUpdated"), value: listing.contentUpdatedAt ? formatDate(listing.contentUpdatedAt, locale) : null },
    { label: tf("ownerVerified"), value: listing.ownerVerifiedAt ? formatDate(listing.ownerVerifiedAt, locale) : tAdmin("common.no") },
    { label: tf("propertyVerified"), value: listing.propertyVerifiedAt ? formatDate(listing.propertyVerifiedAt, locale) : tAdmin("common.no") },
  ].filter((f) => f.value !== null && f.value !== "");

  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/moderation", label: t("backToQueue") }}
        title={<span dir="auto">{listing.title || t("untitled")}</span>}
        meta={
          <>
            <PublicId id={listing.publicId} className="text-sm" />
            <ListingStatusBadge status={listing.status} />
            <RiskChip score={listing.riskScore} threshold={settings.reviewRiskThreshold} />
            {listing.isDemo ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{tAdmin("markers.demo")}</span> : null}
            {listing.reviewedAt ? (
              <span className="text-xs">
                {t("lastReview", { name: listing.reviewedBy?.name ?? "—", date: formatDate(listing.reviewedAt, locale) })}
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            {listing.status === "LIVE" ? (
              <Button asChild variant="ghost" size="sm" className="h-9">
                <Link href={listingPath(listing.publicId, listing.title)} target="_blank" rel="noopener">
                  <ExternalLink aria-hidden />
                  {t("viewOnSite")}
                </Link>
              </Button>
            ) : null}
            {next ? (
              <Button asChild variant="ghost" size="sm" className="h-9">
                <Link href={`/admin/moderation/${next.id}`}>
                  {t("nextInQueue")}
                  <ArrowRight aria-hidden className="rtl:-scale-x-100" />
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="sticky top-14 z-20 -mx-4 mb-5 border-y bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ModerationActions listingId={listing.id} status={listing.status} title={listing.title} ownerLocaleLabel={ownerLanguage} />
          <p className="hidden text-xs text-muted-foreground lg:block">{t("shortcutsHint")}</p>
        </div>
        {listing.moderationReason && (listing.status === "NEEDS_CHANGES" || listing.status === "REJECTED") ? (
          <p className="mt-2 text-sm">
            <span className="font-medium">{t("currentReason")}</span>{" "}
            {tMod.has(`reasons.${listing.moderationReason}.label`) ? tMod(`reasons.${listing.moderationReason}.label`) : listing.moderationReason}
            {listing.moderationNote ? (
              <span className="text-muted-foreground" dir="auto">
                {" "}
                — {listing.moderationNote}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <AdminSection
            id="risk"
            title={t("riskTitle")}
            description={t("riskDescription", { threshold: n(settings.reviewRiskThreshold) })}
            actions={<RiskChip score={listing.riskScore} threshold={settings.reviewRiskThreshold} />}
          >
            {data.reasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">{listing.riskScore == null ? t("riskNotChecked") : t("riskNone")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.reasons
                  .slice()
                  .sort((a, b) => b.points - a.points)
                  .map((r, i) => (
                    <li key={`${r.code}-${i}`} className="flex items-start justify-between gap-3 rounded-lg border bg-background p-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{tRisk.has(r.code) ? tRisk(r.code) : r.code}</p>
                        {r.detail ? (
                          <p className="mt-0.5 text-xs break-words text-muted-foreground" dir="auto">
                            {r.detail}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                          level === "high" ? "bg-destructive/10 text-destructive" : "bg-muted",
                        )}
                      >
                        {t("points", { points: `+${n(r.points)}` })}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </AdminSection>

          <AdminSection id="photos" title={t("photosTitle", { count: listing.photos.length })}>
            {listing.photos.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noPhotos")}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {listing.photos.map((photo, i) => (
                  <li key={photo.id} className="relative">
                    <a
                      href={photoUrl(photo, "lg")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photoUrl(photo, "md")}
                        alt={photo.alt || t("photoAlt", { number: n(i + 1) })}
                        loading={i < 2 ? "eager" : "lazy"}
                        className="aspect-[4/3] w-full object-cover"
                      />
                    </a>
                    {photo.isCover ? (
                      <span className="absolute start-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium">{t("cover")}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>

          <AdminSection
            id="duplicates"
            title={t("duplicatesTitle")}
            description={t("duplicatesDescription")}
            className={data.duplicates.length ? "border-destructive/40" : undefined}
          >
            {data.duplicates.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noDuplicates")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.duplicates.map((d) => (
                  <li key={`${d.photoId}-${d.otherPhotoId}`} className="rounded-lg border bg-background p-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl({ url: d.photoUrl, storageKey: d.photoStorageKey }, "sm")} alt={t("thisPhoto")} className="aspect-[4/3] w-full rounded-md object-cover" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl({ url: d.otherUrl, storageKey: d.otherStorageKey }, "sm")} alt={t("otherPhoto")} className="aspect-[4/3] w-full rounded-md object-cover" />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <Copy aria-hidden className="size-3.5 text-destructive" />
                      <span>{t("distance", { distance: n(d.distance) })}</span>
                      <span aria-hidden>·</span>
                      <Link href={`/admin/moderation/${d.otherListingId}`} className="font-medium text-primary hover:underline">
                        <PublicId id={d.otherPublicId} className="text-primary" /> <span dir="auto">{d.otherTitle}</span>
                      </Link>
                      <ListingStatusBadge status={d.otherStatus} className="h-5" />
                      <span className="text-muted-foreground">
                        {d.otherOwnerId === listing.ownerId ? t("sameOwner") : t("otherOwner", { name: d.otherOwnerName })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>

          <AdminSection id="text" title={t("textTitle")}>
            <Tabs defaultValue={listing.originalLocale} className="gap-3">
              <TabsList className="flex h-auto w-full flex-wrap justify-start">
                <TabsTrigger value={listing.originalLocale}>{t("original")}</TabsTrigger>
                {listing.translations
                  .filter((tr) => !tr.isOriginal)
                  .map((tr) => (
                    <TabsTrigger key={tr.locale} value={tr.locale}>
                      {siteConfig.i18n.nativeNames[tr.locale as keyof typeof siteConfig.i18n.nativeNames] ?? tr.locale}
                    </TabsTrigger>
                  ))}
              </TabsList>
              <TabsContent value={listing.originalLocale}>
                <h3 className="font-medium" dir="auto">
                  {listing.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap" dir="auto">
                  {listing.description || t("noDescription")}
                </p>
              </TabsContent>
              {listing.translations
                .filter((tr) => !tr.isOriginal)
                .map((tr) => (
                  <TabsContent key={tr.locale} value={tr.locale}>
                    <p className="mb-2 text-xs text-muted-foreground">
                      {tr.editedByOwner ? t("translationOwner") : tr.isAuto ? t("translationAuto") : t("translationManual")}
                    </p>
                    <h3 className="font-medium" dir="auto">
                      {tr.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap" dir="auto">
                      {tr.description}
                    </p>
                  </TabsContent>
                ))}
            </Tabs>
          </AdminSection>

          <AdminSection id="details" title={t("detailsTitle")}>
            <FactList items={facts} />
            {listing.roomTypes.length ? (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-medium">{t("roomTypes")}</h3>
                <ul className="divide-y rounded-lg border">
                  {listing.roomTypes.map((room) => (
                    <li key={room.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span dir="auto">{pickLocalized(room.names, locale)}</span>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <AdminPrice amount={room.price} currency={room.currency} period={room.pricePeriod} className="text-foreground" />
                        {room.maxGuests ? <span>· {tf("guests", { count: room.maxGuests })}</span> : null}
                        {room.quantity ? <span>· ×{n(room.quantity)}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </AdminSection>

          <AdminSection id="reports" title={t("reportsTitle", { count: data.reports.length })}>
            {data.reports.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noReports")}</p>
            ) : (
              <ul className="divide-y">
                {data.reports.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Link href={`/admin/reports/${r.id}`} className="font-medium hover:underline">
                        {tFields(`reportReason.${r.reason}`)}
                      </Link>
                      <ReportStatusBadge status={r.status} className="h-5" />
                      <span className="text-xs text-muted-foreground">
                        {r.reporter ? <span dir="auto">{r.reporter.name}</span> : tAdmin("common.guest")} · <WhenText date={r.createdAt} />
                      </span>
                    </div>
                    {r.details ? (
                      <p className="text-sm text-muted-foreground" dir="auto">
                        {r.details}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <AdminSection id="location" title={t("locationTitle")} description={t("locationDescription")}>
            <p className="mb-2 flex items-start gap-1.5 text-sm">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                {[neighborhood, city].filter(Boolean).join(", ") || "—"}
                {listing.address ? (
                  <span className="block text-muted-foreground" dir="auto">
                    {listing.address}
                  </span>
                ) : null}
              </span>
            </p>
            {listing.cadastralCode ? (
              <p className="mb-2 text-xs text-muted-foreground">
                {tf("cadastralCode")}: <Ltr className="font-mono text-foreground">{listing.cadastralCode}</Ltr>
              </p>
            ) : null}
            {listing.lat != null && listing.lng != null ? (
              <>
                <div className="h-56 overflow-hidden rounded-lg border">
                  <ExactLocationMapLoader
                    lat={listing.lat}
                    lng={listing.lng}
                    approx={listing.approxLat != null && listing.approxLng != null ? { lat: listing.approxLat, lng: listing.approxLng } : null}
                    label={t("mapLabel")}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  <Ltr className="font-mono">{`${listing.lat.toFixed(6)}, ${listing.lng.toFixed(6)}`}</Ltr> · {t("mapLegend")}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noLocation")}</p>
            )}
          </AdminSection>

          <AdminSection id="contact" title={t("contactTitle")}>
            {data.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noContacts")}</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {data.contacts.map((c) => (
                  <li key={`${c.channel}-${c.value}`} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{tFields(`contactChannel.${c.channel}`)}</span>
                    <Ltr className="truncate font-mono text-xs">{c.value}</Ltr>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {listing.contactHoursFrom ? (
                <>
                  {tf("contactHours")} <Ltr>{`${listing.contactHoursFrom}–${listing.contactHoursTo ?? ""}`}</Ltr>
                  {" · "}
                </>
              ) : null}
              {listing.noReplyOnShabbat ? tf("noReplyOnShabbat") : null}
            </p>
          </AdminSection>

          <AdminSection
            id="owner"
            title={t("ownerTitle")}
            actions={
              <Link href={`/admin/users/${owner.id}`} className="text-sm font-medium text-primary hover:underline">
                {t("openProfile")}
              </Link>
            }
          >
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium" dir="auto">
                  {owner.businessName || owner.name}
                </span>
                <UserStatusBadge status={owner.status} className="h-5" />
              </div>
              <AccountMarkers user={owner} />
              <FactList
                className="sm:grid-cols-1"
                items={[
                  { label: tAdmin("common.joined"), value: `${formatDate(owner.createdAt, locale)} · ${formatRelativeTime(owner.createdAt, locale)}` },
                  { label: tAdmin("common.phone"), value: owner.phoneNumber ? <Ltr>{owner.phoneNumber}</Ltr> : "—" },
                  { label: tAdmin("common.email"), value: ownerEmail ? <Ltr className="break-all">{ownerEmail}</Ltr> : "—" },
                  { label: tAdmin("common.language"), value: ownerLanguage },
                  {
                    label: t("idVerification"),
                    value: owner.idVerifiedAt
                      ? t("verifiedOnBy", { date: formatDate(owner.idVerifiedAt, locale), name: data.idVerifiedBy ?? "—" })
                      : data.pendingVerification ? (
                          <Link href={`/admin/verifications/${data.pendingVerification.id}`} className="text-primary hover:underline">
                            {t("verificationPending")}
                          </Link>
                        ) : (
                          tAdmin("common.no")
                        ),
                  },
                  {
                    label: t("ownerReports"),
                    value: t("ownerReportsValue", { against: n(data.ownerReportsAgainst), listings: n(data.ownerListingReports) }),
                  },
                ]}
              />
              {data.devices.length > 0 ? (
                <div className="rounded-lg border border-border-strong/50 bg-surface-muted p-2.5 text-xs">
                  <p className="flex items-center gap-1.5 font-medium">
                    <MonitorSmartphone aria-hidden className="size-4" />
                    {t("sharedDevices", { count: data.devices.length })}
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                    {data.devices.map((d) => (
                      <li key={d.id}>
                        <Link href={`/admin/users/${d.id}`} className="text-primary hover:underline" dir="auto">
                          {d.name}
                        </Link>
                        {d.status !== "ACTIVE" ? <UserStatusBadge status={d.status} className="ms-1 h-5" /> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {data.otherListings.length ? (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t("otherListings", { count: data.otherListings.length })}</h3>
                <ul className="flex flex-col gap-2">
                  {data.otherListings.map((l) => (
                    <li key={l.id}>
                      <Link href={`/admin/moderation/${l.id}`} className="flex items-center gap-2 rounded-lg p-1 hover:bg-muted">
                        <ListingThumb src={coverUrl(l.photos)} alt="" className="size-9" />
                        <span className="min-w-0 flex-1 truncate text-sm" dir="auto">
                          {l.title}
                        </span>
                        <ListingStatusBadge status={l.status} className="h-5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <StickyNote aria-hidden className="size-3.5" />
                {t("notes")}
              </h3>
              {data.notes.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("noNotes")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.notes.map((note) => (
                    <li key={note.id} className="rounded-lg bg-surface-muted p-2 text-xs">
                      <p className="whitespace-pre-wrap" dir="auto">
                        {note.body}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {note.author?.name ?? "—"} · <WhenText date={note.createdAt} />
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </AdminSection>

          {listing.status === "HIDDEN" ? (
            <p className="flex items-start gap-2 rounded-xl border border-border-strong/50 bg-surface-muted p-3 text-xs">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t("hiddenHint")}
            </p>
          ) : null}
        </aside>
      </div>
    </>
  );
}
