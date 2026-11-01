import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarClockIcon, CameraIcon, MapPinIcon, MessageCircleIcon, ShieldCheckIcon, WalletIcon } from "lucide-react";
import { Container } from "@/components/common/container";
import { IconCircle } from "@/components/ds/icon-circle";
import { WelcomeHomeIcon } from "@/components/ds/jewish-icons";
import { PhotoSlot } from "@/components/photos/photo-slot";
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
    <Container size="narrow" className="grid gap-8 py-6 sm:py-12">
      <section aria-labelledby="post-title" className="overflow-hidden rounded-card bg-card shadow-card ring-1 ring-foreground/5">
        <div className="relative aspect-[16/9] sm:aspect-[21/9]">
          <PhotoSlot slot="cta.listYourProperty" alt="" sizes="(min-width: 768px) 720px, 100vw" priority className="size-full" imageClassName="object-[50%_60%]" />
          <span aria-hidden className="absolute inset-0 bg-linear-to-t from-black/45 to-transparent" />
        </div>
        <div className="grid gap-5 p-5 sm:p-8">
          <header className="grid gap-2">
            <h1 id="post-title" className="text-h1 text-balance">
              {t("title")}
            </h1>
            <p className="max-w-prose text-body text-pretty text-muted-foreground">{t("subtitle")}</p>
          </header>
          <div className="grid gap-1.5">
            <h2 className="text-h3">{t("newTitle")}</h2>
            <p className="text-small text-pretty text-muted-foreground">{t("newDescription")}</p>
          </div>
          <div>
            <StartListingButton />
          </div>
          <div className="grid gap-3">
            <h3 className="text-small font-bold">{t("howTitle")}</h3>
            <ul className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
              {needs.map(({ key, icon }) => (
                <li key={key} className="flex items-center gap-2.5 text-small">
                  <IconCircle icon={icon} tone="navy" size="sm" />
                  <span className="min-w-0 text-pretty break-words">{t(`how.${key}`, { count: siteConfig.listings.minPhotos })}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="flex items-start gap-3 rounded-card bg-verified-soft p-3.5 text-small font-semibold text-pretty ring-1 ring-verified/20">
            <IconCircle icon={WelcomeHomeIcon} tone="green" size="sm" className="bg-card" />
            <span className="pt-1.5">{t("pledgeNote")}</span>
          </p>
          <div className="grid gap-2 border-t border-border pt-4 text-small text-muted-foreground sm:grid-cols-2">
            <p className="flex items-start gap-2">
              <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-verified" aria-hidden />
              {t("trust")}
            </p>
            <p className="flex items-start gap-2">
              <CalendarClockIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {t("expiry", { days: settings.listingExpiryDays })}
            </p>
          </div>
        </div>
      </section>

      <DraftCards
        drafts={drafts.map((d) => ({ ...d, updatedLabel: t("draftUpdated", { time: formatRelativeTime(d.updatedAt, locale, now) }) }))}
      />
    </Container>
  );
}
