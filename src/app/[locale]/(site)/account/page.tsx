import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LogoutButton } from "@/components/auth/logout-button";
import { PageHeader } from "@/components/common/page-header";
import { buttonStyles } from "@/components/ds/button";
import { AccountPledgeBanner } from "@/components/pledge/account-pledge-banner";
import { AttentionList, ListingCountTiles, QuickActions, VerificationProgressCard } from "@/components/account/overview";
import { siteConfig, type AppLocale } from "@/config/site";
import { accountGreeting } from "@/lib/account/greeting";
import { getAccountOverview } from "@/lib/account/queries";
import { requireUser } from "@/lib/auth/session";
import { countActiveSavedSearches } from "@/lib/saved-searches/server";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.meta" });
  return pageMetadata({ locale, path: "/account", title: t("overview"), description: t("description"), noIndex: true });
}

/** /account — greeting, verification progress, listing counts, things to do and quick actions. */
export default async function AccountOverviewPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser({ next: "/account" });
  const t = await getTranslations("account.overview");
  const [overview, savedSearches] = await Promise.all([getAccountOverview(user), countActiveSavedSearches(user.id)]);
  const greeting = accountGreeting(user.name, user.isDemo, user.firstName);

  return (
    <div>
      <PageHeader
        title={
          greeting.kind === "demo" ? (
            t("greetingDemo")
          ) : greeting.kind === "none" ? (
            t("greetingNoName")
          ) : (
            <>
              {t("greeting")} <span dir="auto">{greeting.name}</span>
              {greeting.kind === "demoName" ? <> {t("demoTag")}</> : null}
            </>
          )
        }
        description={t("lead", { siteName: siteConfig.localizedName[locale as AppLocale] ?? siteConfig.name })}
      />
      <div className="grid gap-4 sm:gap-6">
        <AccountPledgeBanner userId={user.id} />
        <QuickActions idVerified={!!user.idVerifiedAt} favorites={overview.favorites} openTickets={overview.openTickets} savedSearches={savedSearches} />
        {overview.attention.length > 0 ? (
          <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <AttentionList items={overview.attention} />
            <VerificationProgressCard progress={overview.progress} />
          </div>
        ) : (
          <>
            {/* Nothing waiting: a slim line, and the trust card gets the full width (no empty card). */}
            <AttentionList items={overview.attention} />
            <VerificationProgressCard progress={overview.progress} />
          </>
        )}
        <ListingCountTiles counts={overview.counts} />
        {/* Round 3, bug 2.9: logging out at the bottom of the account page. */}
        <div className="flex justify-center border-t pt-4 sm:justify-start">
          <LogoutButton className={buttonStyles({ variant: "outline", size: "md", className: "w-full px-5 sm:w-fit" })} />
        </div>
      </div>
    </div>
  );
}
