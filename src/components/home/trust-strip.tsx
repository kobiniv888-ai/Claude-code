import { BadgeCheckIcon as BadgeCheck, HandCoinsIcon as HandCoins } from "@/components/ds/sprite-icons";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { IconCircle } from "@/components/ds/icon-circle";
import { HebrewBubbleIcon, KosherStampIcon, WelcomeHomeIcon, type IconComponent } from "@/components/ds/jewish-icons";
import type { AppLocale } from "@/config/site";
import { siteName } from "@/lib/seo";

type Tone = "green" | "coral" | "navy";

const ITEMS: readonly { key: string; icon: IconComponent; tone: Tone }[] = [
  { key: "welcome", icon: WelcomeHomeIcon, tone: "green" },
  { key: "jewish", icon: KosherStampIcon, tone: "coral" },
  { key: "hebrew", icon: HebrewBubbleIcon, tone: "navy" },
  { key: "noFees", icon: HandCoins, tone: "navy" },
  { key: "verified", icon: BadgeCheck, tone: "green" },
];

/** The promise in five icons, right under the search card: a sideways scroll on phones, one row on desktop. */
export async function TrustStrip({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "home.trust" });
  return (
    <Container className="px-0 sm:px-6 lg:px-8">
      {/* Scrolls sideways on phones: focusable so keyboard users can scroll it (axe scrollable-region-focusable). */}
      <ul
        aria-label={t("label", { siteName: siteName(locale) })}
        tabIndex={0}
        className="flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto rounded-card px-4 py-4 outline-none scrollbar-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-0 md:grid md:grid-cols-5 md:gap-3 md:overflow-visible md:py-6"
      >
        {ITEMS.map(({ key, icon, tone }) => (
          <li
            key={key}
            className="flex max-w-44 shrink-0 snap-start items-center gap-2.5 rounded-card bg-card py-2 ps-2 pe-3.5 shadow-xs ring-1 ring-foreground/5 md:max-w-none md:py-2.5 md:ps-2.5"
          >
            <IconCircle icon={icon} tone={tone} size="sm" />
            <span className="text-small leading-tight font-semibold text-balance text-foreground">{t(key)}</span>
          </li>
        ))}
      </ul>
    </Container>
  );
}
