import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarClockIcon, CameraIcon, MapPinIcon, MessageCircleIcon, ShieldCheckIcon, WalletIcon } from "lucide-react";
import { Container } from "@/components/common/container";
import { DraftCards } from "@/components/wizard/start-listing";
import { StartListingButton } from "@/components/wizard/start-listing";
import { ShabbatPaused } from "@/components/wizard/shabbat-paused";
import { siteConfig, type AppLocale } from "@/config/site";
import { requireUser } from "@/lib/auth/session";
import { formatRelativeTime } from "@/lib/format";
import { getSettings, isShabbatModeActive } from "@/lib/settings";
import { loadDrafts } from "@/lib/wizard/server";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "wizard.meta" });
  return { title: t("postTitle"), description: t("postDescription"), robots: { index: false, follow: false } };
}

/** /post — "Continue your draft" and "Start a new listing". Posting needs a verified phone. */
export default async function PostPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale = raw as AppLocale;
  setRequestLocale(locale);
  const user = await requireUser({ phoneVerified: true, next: "/post" });
  const [t, drafts, shabbat, settings] = await Promise.all([
    getTranslations("wizard.start"),
    loadDrafts(user.id, locale),
    isShabbatModeActive(),
    getSettings(),
  ]);

  if (shabbat.active) {
    return (
      <Container size="narrow">
        <ShabbatPaused locale={locale} endsAt={shabbat.endsAt} />
      </Container>
    );
  }

  const now = new Date();
  const needs = [
    { key: "photos", icon: CameraIcon },
    { key: "address", icon: MapPinIcon },
    { key: "price", icon: WalletIcon },
    { key: "contact", icon: MessageCircleIcon },
  ] as const;

  return (
    <Container size="narrow" className="grid gap-8 py-8 sm:py-12">
      <header className="grid gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{t("title")}</h1>
        <p className="max-w-prose text-pretty text-muted-foreground sm:text-lg">{t("subtitle")}</p>
      </header>

      <section className="relative isolate grid gap-5 overflow-hidden rounded-3xl bg-card p-5 shadow-card ring-1 ring-foreground/5 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -end-24 -top-24 -z-10 size-72 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)]"
        />
        <div className="grid gap-1.5">
          <h2 className="text-xl font-semibold">{t("newTitle")}</h2>
          <p className="text-pretty text-muted-foreground">{t("newDescription")}</p>
        </div>
        <div>
          <StartListingButton />
        </div>
        <div className="grid gap-3">
          <h3 className="text-sm font-semibold">{t("howTitle")}</h3>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {needs.map(({ key, icon: Icon }) => (
              <li key={key} className="flex items-start gap-2.5 text-sm">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="pt-1.5 text-pretty">{t(`how.${key}`, { count: siteConfig.listings.minPhotos })}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-2 border-t border-border pt-4 text-sm text-muted-foreground sm:grid-cols-2">
          <p className="flex items-start gap-2">
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-verified" aria-hidden />
            {t("trust")}
          </p>
          <p className="flex items-start gap-2">
            <CalendarClockIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            {t("expiry", { days: settings.listingExpiryDays })}
          </p>
        </div>
      </section>

      <DraftCards
        drafts={drafts.map((d) => ({ ...d, updatedLabel: t("draftUpdated", { time: formatRelativeTime(d.updatedAt, locale, now) }) }))}
      />
    </Container>
  );
}
