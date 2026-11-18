import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChartColumnIcon, EyeOffIcon, FilePlus2Icon, PencilIcon, SearchXIcon, TimerIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState } from "@/components/common/states";
import { GuideCustomPicker, GuideListingPicker } from "@/components/pricing/guide-picker";
import { GuideView } from "@/components/pricing/guide-view";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/session";
import { getDisplayCurrency } from "@/lib/currency";
import { RateLimitError } from "@/lib/errors";
import { isolate } from "@/lib/format";
import {
  getCustomPriceGuide,
  getGuideCities,
  getGuideListingOptions,
  getListingPriceGuides,
  type CustomGuideView,
  type ListingGuideView,
} from "@/lib/pricing/guide-server";
import { PRICE_GUIDE_RATE_LIMIT, priceGuideRateKey } from "@/lib/pricing/limits";
import { guidePageHref, parseGuidePageQuery } from "@/lib/pricing/page-params";
import { assertRateLimit } from "@/lib/rate-limit";
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { priceStepFor } from "@/lib/wizard/steps";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PATH = "/account/listings/price-guide";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricing.meta" });
  return pageMetadata({ locale, path: PATH, title: t("title"), description: t("description"), noIndex: true });
}

type Answer =
  | { kind: "none" }
  | { kind: "listing"; view: ListingGuideView }
  | { kind: "custom"; view: CustomGuideView }
  | { kind: "listing_not_found" }
  | { kind: "city_not_found" }
  | { kind: "rate_limited" };

/**
 * /account/listings/price-guide — "מדריך מחירים" under "הנכסים שלי" (round 3, brief 5): what similar
 * places cost, for one of the host's listings or for a city, deal type, property type and size.
 * Hosts only: a signed-in user with at least one listing (a draft counts); never guests. Every
 * answer is rate-limited (shared with the post form's panel) and never counts the host's own places.
 */
export default async function PriceGuidePage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale = raw as AppLocale;
  setRequestLocale(locale);
  const user = await requireUser({ next: PATH });
  const query = parseGuidePageQuery(await searchParams);
  const t = await getTranslations("pricing");
  const tl = await getTranslations("account.listings");

  const listings = await getGuideListingOptions(user.id);
  const header = (
    <PageHeader
      breadcrumbs={[{ label: tl("title"), href: "/account/listings" }, { label: t("page.title") }]}
      title={t("page.title")}
      description={
        <span className="grid gap-2">
          <span>{t("page.lead")}</span>
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <EyeOffIcon className="size-3.5" aria-hidden />
            {t("badge")} · {t("badgeHint")}
          </span>
        </span>
      }
    />
  );

  // Hosts only: without a single listing there is nothing to price (and nobody to probe for).
  if (listings.length === 0) {
    return (
      <div>
        {header}
        <EmptyState
          bordered
          icon={FilePlus2Icon}
          title={t("page.notHostTitle")}
          description={t("page.notHostBody")}
          action={{ label: t("page.post"), href: "/post", icon: FilePlus2Icon }}
        />
      </div>
    );
  }

  let answer: Answer = { kind: "none" };
  const asks = query.mode === "listing" ? query.listingId !== null : query.citySlug !== null;
  if (asks) {
    try {
      await assertRateLimit(priceGuideRateKey(user.id), PRICE_GUIDE_RATE_LIMIT);
      if (query.mode === "listing") {
        const view = await getListingPriceGuides(query.listingId!, user.id, { locale });
        answer = view ? { kind: "listing", view } : { kind: "listing_not_found" };
      } else {
        const currency = await getDisplayCurrency(user.currency, locale);
        const view = await getCustomPriceGuide({
          ownerId: user.id,
          citySlug: query.citySlug!,
          dealType: query.dealType,
          propertyType: query.propertyType,
          size: query.size,
          currency,
          locale,
        });
        answer = view ? { kind: "custom", view } : { kind: "city_not_found" };
      }
    } catch (error) {
      if (!(error instanceof RateLimitError)) throw error;
      answer = { kind: "rate_limited" };
    }
  }

  const cities = query.mode === "custom" ? await getGuideCities(locale) : [];
  const customInitial =
    query.mode === "custom" ? query : { mode: "custom" as const, citySlug: null, dealType: "SHORT_STAY" as const, propertyType: "APARTMENT" as const, size: null };
  const tabs = [
    { mode: "listing" as const, label: t("page.modeListing"), href: guidePageHref({ mode: "listing", listingId: null }) },
    { mode: "custom" as const, label: t("page.modeCustom"), href: guidePageHref(customInitial) },
  ];

  return (
    <div className="grid gap-4">
      {header}

      <nav aria-label={t("page.tabsLabel")} className="-mt-2">
        <ul className="flex flex-wrap gap-1.5">
          {tabs.map((tab) => {
            const current = tab.mode === query.mode;
            return (
              <li key={tab.mode}>
                <Link
                  href={tab.href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10",
                    current ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="grid gap-4 rounded-card bg-card p-4 shadow-card ring-1 ring-foreground/5 sm:p-6" aria-label={t("page.tabsLabel")}>
        {query.mode === "listing" ? (
          <GuideListingPicker
            selected={query.listingId}
            listings={listings.map((l) => ({
              id: l.id,
              // The host's title is isolated, so a title that starts in another script ("Studio …"
              // in a Hebrew page) doesn't pull the number and the "·" to its side.
              label: `${l.title ? isolate(l.title) : t("page.untitled")} · ${tl("id")} ${l.publicId}${l.hasCity ? "" : ` · ${t("page.noCity")}`}`,
            }))}
          />
        ) : (
          <GuideCustomPicker key={JSON.stringify(customInitial)} cities={cities.map((c) => ({ slug: c.slug, name: c.name }))} initial={customInitial} />
        )}
      </section>

      <Answer answer={answer} locale={locale} />
    </div>
  );
}

async function Answer({ answer, locale }: { answer: Answer; locale: AppLocale }) {
  const t = await getTranslations("pricing");
  const tl = await getTranslations("account.listings");
  switch (answer.kind) {
    case "none":
      return <EmptyState bordered size="sm" icon={ChartColumnIcon} title={t("page.pickTitle")} description={t("page.pickBody")} headingLevel="h2" />;
    case "rate_limited":
      return <ErrorState bordered size="sm" icon={TimerIcon} title={t("panel.rateLimited")} headingLevel="h2" />;
    case "listing_not_found":
      return <EmptyState bordered size="sm" icon={SearchXIcon} title={t("page.listingNotFound")} headingLevel="h2" />;
    case "city_not_found":
      return <EmptyState bordered size="sm" icon={SearchXIcon} title={t("page.cityNotFound")} headingLevel="h2" />;
    case "custom":
      return (
        <section className="grid gap-4 rounded-card bg-card p-4 shadow-card ring-1 ring-foreground/5 sm:p-6" data-testid="price-guide-answer">
          <h2 className="text-h3 text-foreground">{answer.view.cityName}</h2>
          <GuideView
            guide={answer.view.guide}
            widened={answer.view.widened}
            dealType={answer.view.dealType}
            propertyType={answer.view.propertyType}
            place={{ city: answer.view.cityName, neighborhood: null }}
            locale={locale}
          />
        </section>
      );
    case "listing": {
      const { view } = answer;
      const hotel = view.dealType === "HOTEL_ROOM";
      const step = priceStepFor({ dealType: view.dealType, propertyType: view.propertyType });
      return (
        <section className="grid gap-5 rounded-card bg-card p-4 shadow-card ring-1 ring-foreground/5 sm:p-6" data-testid="price-guide-answer">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid min-w-0 gap-1">
              <h2 className="text-h3 text-foreground">
                <bdi dir="auto">{view.title || tl("untitled")}</bdi>
              </h2>
              <p className="text-xs text-muted-foreground">
                {tl("id")} <Ltr>{view.publicId}</Ltr>
              </p>
            </div>
            <Button asChild variant="outline" className="h-11 rounded-xl px-4 sm:h-10">
              <Link href={`/account/listings/${view.listingId}/edit?step=${hotel ? "rooms" : step}`}>
                <PencilIcon aria-hidden />
                {t("page.editPrice")}
              </Link>
            </Button>
          </header>
          {view.needsCity ? (
            <p className="rounded-xl bg-surface-muted px-3 py-2.5 text-sm text-muted-foreground">{t("panel.needsCity")}</p>
          ) : view.needsRooms ? (
            <p className="rounded-xl bg-surface-muted px-3 py-2.5 text-sm text-muted-foreground">{t("panel.needsRooms")}</p>
          ) : (
            view.items.map((item, i) => (
              <div key={item.roomTypeId ?? "listing"} className={cn(i > 0 && "border-t border-border pt-5")}>
                <GuideView
                  guide={item.guide}
                  widened={item.widened}
                  dealType={view.dealType}
                  propertyType={view.propertyType}
                  place={view.place ?? { city: "", neighborhood: null }}
                  locale={locale}
                  title={hotel ? item.roomName : null}
                  mine={{ price: item.price, currency: item.currency, period: item.period }}
                />
              </div>
            ))
          )}
        </section>
      );
    }
  }
}
