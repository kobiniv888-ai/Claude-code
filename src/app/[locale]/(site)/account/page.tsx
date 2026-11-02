import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/common/page-header";
import { AccountPledgeBanner } from "@/components/pledge/account-pledge-banner";
import { AttentionList, ListingCountTiles, QuickActions, VerificationProgressCard } from "@/components/account/overview";
import { siteConfig, type AppLocale } from "@/config/site";
import { accountGreeting } from "@/lib/account/greeting";
import { getAccountOverview } from "@/lib/account/queries";
import { requireUser } from "@/lib/auth/session";
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
  const overview = await getAccountOverview(user);
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
        <QuickActions idVerified={!!user.idVerifiedAt} favorites={overview.favorites} openTickets={overview.openTickets} />
        <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <AttentionList items={overview.attention} />
          <VerificationProgressCard progress={overview.progress} />
        </div>
        <ListingCountTiles counts={overview.counts} />
      </div>
    </div>
  );
}
