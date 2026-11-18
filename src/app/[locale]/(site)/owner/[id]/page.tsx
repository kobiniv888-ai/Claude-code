import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BanIcon, CalendarCheckIcon, HouseIcon, LanguagesIcon, MessageCircleReplyIcon, PercentIcon, StarIcon, UserRoundIcon } from "lucide-react";
import { Container } from "@/components/common/container";
import { EmptyState } from "@/components/common/states";
import { ListingGrid } from "@/components/listing/listing-grid";
import { OwnerAvatar } from "@/components/listing-page/owner-avatar";
import { OwnerBadges } from "@/components/listing-page/owner-badges";
import { BlockButton } from "@/components/report/block-button";
import { ReportButton } from "@/components/report/report-dialog";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { getCurrentUser } from "@/lib/auth/session";
import { hasBlocked } from "@/lib/contact/server";
import { formatDate, formatNumber } from "@/lib/format";
import { getCardContext } from "@/lib/listing-page/context";
import { languageName, replyTimeBucket } from "@/lib/listing-page/helpers";
import { getOwnerProfile } from "@/lib/listing-page/owner";
import { countOwnerListings, getOwnerListings } from "@/lib/listing/queries";
import { ownerPath } from "@/lib/listing/urls";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string; id: string }> };

function decodeId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id: rawId } = await params;
  if (!isAppLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "owner" });
  const id = decodeId(rawId);
  const owner = await getOwnerProfile(id);
  if (!owner) return { title: t("notFound.title"), robots: { index: false, follow: true } };
  const count = await countOwnerListings(owner.id);
  return pageMetadata({
    locale,
    path: ownerPath(owner.id),
    title: t("meta.title", { name: owner.name }),
    description: t("meta.description", { name: owner.name, count, formatted: formatNumber(count, locale) }),
    image: owner.image ?? undefined,
    // Never indexed (round 3, brief 10, the careful option): a host's name stays out of search
    // results, and the page only repeats their listing cards. Links are still followed.
    noIndex: true,
  });
}

export default async function OwnerPage({ params }: Props) {
  const { locale: rawLocale, id: rawId } = await params;
  if (!isAppLocale(rawLocale)) notFound();
  const locale: AppLocale = rawLocale;
  setRequestLocale(locale);

  const owner = await getOwnerProfile(decodeId(rawId));
  if (!owner) notFound();

  const [t, user, ctx] = await Promise.all([
    getTranslations({ locale, namespace: "owner" }),
    getCurrentUser().catch(() => null),
    getCardContext(locale),
  ]);
  const isSelf = user?.id === owner.id;
  const [listings, blocked] = await Promise.all([
    getOwnerListings(owner.id, ctx, 48),
    user && !isSelf ? hasBlocked(user.id, owner.id) : Promise.resolve(false),
  ]);
  const bucket = replyTimeBucket(owner.avgReplyMinutes);
  const facts = [
    { key: "member", icon: CalendarCheckIcon, label: t("memberSince"), value: formatDate(owner.memberSince, locale, { month: "long", year: "numeric" }) },
    owner.languages.length > 0 && {
      key: "languages",
      icon: LanguagesIcon,
      label: t("languages"),
      value: owner.languages.map((code) => languageName(code, locale)).join(", "),
    },
    owner.replyRate !== null && { key: "rate", icon: PercentIcon, label: t("replyRate"), value: t("replyRateValue", { count: owner.replyRate }) },
    bucket && { key: "time", icon: MessageCircleReplyIcon, label: t("replyTime"), value: t(`replyTimes.${bucket}`) },
    { key: "listings", icon: HouseIcon, label: t("activeListings"), value: formatNumber(listings.length, locale) },
  ].filter(Boolean) as { key: string; icon: typeof HouseIcon; label: string; value: string }[];

  return (
    <Container className="py-8 sm:py-10">
      <header className="grid gap-6 rounded-3xl border bg-card p-5 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <OwnerAvatar name={owner.name} image={owner.image} size={96} />
          <div className="grid min-w-0 gap-3">
            <div className="grid gap-1">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <UserRoundIcon className="size-4" aria-hidden />
                {owner.badges.business ? t("businessProfile") : t("ownerProfile")}
              </p>
              <h1 dir="auto" className="text-h1 text-balance">
                {owner.name}
              </h1>
            </div>
            <OwnerBadges badges={owner.badges} />
          </div>
        </div>

        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map(({ key, icon: Icon, label, value }) => (
            // dt/dd must be direct children of the group <div>, so the icon sits inside the <dt>.
            <div key={key} className="relative grid ps-8">
              <dt className="text-sm text-muted-foreground">
                <Icon className="absolute start-0 top-0.5 size-5 text-primary" aria-hidden />
                {label}
              </dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        {owner.bio ? (
          <section aria-labelledby="bio-title" className="grid gap-2 border-t pt-5">
            <h2 id="bio-title" className="font-semibold">
              {t("about", { name: owner.name })}
            </h2>
            <p dir="auto" className="leading-relaxed whitespace-pre-line text-foreground/90">
              {owner.bio}
            </p>
          </section>
        ) : null}

        {isSelf ? (
          <p className="rounded-xl bg-secondary/70 p-3 text-sm">{t("selfNote")}</p>
        ) : (
          <div className="grid gap-3 border-t pt-5">
            {blocked ? (
              <p className="flex gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground" role="status">
                <BanIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t("blockedNote")}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <ReportButton targetType="USER" targetId={owner.id} variant="outline" />
              <BlockButton userId={owner.id} name={owner.name} initialBlocked={blocked} />
            </div>
            <p className="text-xs text-muted-foreground">{t("privacyNote")}</p>
          </div>
        )}
      </header>

      <section aria-labelledby="listings-title" className="mt-10 grid gap-5">
        <h2 id="listings-title" className="text-xl font-semibold tracking-tight">
          {t("listingsTitle", { name: owner.name })}
        </h2>
        <ListingGrid
          listings={listings}
          columns={4}
          label={t("listingsTitle", { name: owner.name })}
          empty={
            <EmptyState
              icon={HouseIcon}
              bordered
              title={t("noListings")}
              description={t("noListingsHint")}
              action={{ label: t("browse"), href: "/search" }}
            />
          }
        />
      </section>

      {siteConfig.features.reviews ? (
        <section aria-labelledby="reviews-title" className="mt-10 grid gap-3 border-t pt-8">
          <h2 id="reviews-title" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <StarIcon className="size-5 text-primary" aria-hidden />
            {t("reviews")}
          </h2>
          <p className="text-muted-foreground">{t("noReviews")}</p>
        </section>
      ) : null}
    </Container>
  );
}
