import { getTranslations } from "next-intl/server";
import { CalendarCheckIcon, ChevronRightIcon, HandCoinsIcon, SearchIcon, type SpriteIconComponent } from "@/components/ds/sprite-icons";
import type { AppLocale } from "@/config/site";
import { HomeSection } from "./home-section";

const STEPS: readonly { key: "search" | "book" | "pay"; icon: SpriteIconComponent }[] = [
  { key: "search", icon: SearchIcon },
  { key: "book", icon: CalendarCheckIcon },
  { key: "pay", icon: HandCoinsIcon },
];

/**
 * "How it works" (brief round 2, 5.2): one compact row of three steps for guests:
 * search → book on the site → pay the host on arrival. (The host's steps live on the post page.)
 */
export async function HowItWorks({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "home.howItWorks" });
  return (
    <HomeSection id="home-how-title" title={t("title")}>
      <ol className="grid grid-cols-3 gap-4 sm:max-w-2xl sm:gap-8">
        {STEPS.map(({ key, icon: Icon }, index) => (
          <li key={key} className="relative flex min-w-0 flex-col items-center gap-2 text-center">
            {index > 0 ? (
              // In the gap before this step, pointing in the reading direction.
              <ChevronRightIcon
                className="absolute top-3.5 -start-4 size-4 text-muted-foreground rtl:-scale-x-100 sm:-start-6"
                aria-hidden="true"
              />
            ) : null}
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary-tint text-primary-text ring-1 ring-primary-tint-border">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="text-small leading-snug font-medium text-pretty text-foreground">{t(`steps.${key}`)}</span>
          </li>
        ))}
      </ol>
    </HomeSection>
  );
}
