import { CalendarDaysIcon as CalendarDays, MapPinnedIcon as MapPinned, PhoneIcon as Phone, UtensilsCrossedIcon as UtensilsCrossed, type SpriteIconComponent as LucideIcon } from "@/components/ds/sprite-icons";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { IconCircle } from "@/components/ds/icon-circle";
import { Reveal } from "@/components/ds/reveal";
import { SectionHeader } from "@/components/ds/section-header";
import { PhotoSlot } from "@/components/photos/photo-slot";
import { ShabbatCountdownCard } from "@/components/shabbat/shabbat-countdown-card";
import type { PhotoSlotKey } from "@/config/photos";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const SYNAGOGUES: readonly { key: "tbilisi" | "batumi"; slot: PhotoSlotKey; href: string }[] = [
  { key: "tbilisi", slot: "jewish.tbilisiSynagogue", href: "/jewish-life?type=synagogue&placeCity=tbilisi#places" },
  { key: "batumi", slot: "jewish.batumiSynagogue", href: "/jewish-life?type=synagogue&placeCity=batumi#places" },
];

const LINKS: readonly { key: string; icon: LucideIcon; href: string; tone: "navy" | "coral" | "green" | "amber" }[] = [
  { key: "map", icon: MapPinned, href: "/jewish-life#places", tone: "navy" },
  { key: "kosher", icon: UtensilsCrossed, href: "/jewish-life?type=kosher-restaurant,kosher-shop#places", tone: "coral" },
  { key: "calendar", icon: CalendarDays, href: "/jewish-life#calendar", tone: "green" },
  { key: "emergency", icon: Phone, href: "/jewish-life#emergency", tone: "amber" },
];

/**
 * "Jewish life in Georgia": this week's Shabbat (candles + live countdown), photos of the
 * synagogues of Tbilisi and Batumi, and round quick links into the Jewish life page.
 */
export async function JewishLifeBand({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "home.jewishLife" });
  return (
    <section aria-labelledby="home-jewish-title" className="my-[calc(var(--section-space)*0.55)] bg-navy-soft/60 py-section">
      <Container>
        <SectionHeader id="home-jewish-title" title={t("title")} subtitle={t("lead")} href="/jewish-life" linkLabel={t("all")} className="mb-5 sm:mb-7" />
        <Reveal className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-6">
          <div className="grid content-start gap-4">
            <ShabbatCountdownCard locale={locale} />
            <nav aria-label={t("links.label")}>
              <ul className="grid grid-cols-4 gap-2 sm:gap-3">
                {LINKS.map(({ key, icon, href, tone }) => (
                  <li key={key}>
                    <Link
                      href={href}
                      className={`bh-press flex h-full flex-col items-center gap-2 rounded-card px-1 py-3 text-center text-caption font-semibold text-foreground outline-none hover:bg-card/70 focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-small`}
                    >
                      <IconCircle icon={icon} tone={tone} size="lg" className="shadow-xs ring-1 ring-foreground/5" />
                      <span className="text-balance">{t(`links.${key}`)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <ul aria-label={t("synagogues.label")} className="grid grid-cols-2 gap-3 sm:gap-4">
            {SYNAGOGUES.map(({ key, slot, href }) => (
              <li key={key}>
                <Link
                  href={href}
                  className={cn(
                    "group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-card bg-muted p-3 shadow-card outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-4 lg:aspect-auto lg:h-full lg:min-h-80",
                    "bh-press",
                  )}
                >
                  <span className={cn("absolute inset-0 -z-10", "bh-zoom-hover")}>
                    <PhotoSlot slot={slot} sizes="(min-width: 1024px) 28vw, 48vw" className="size-full" />
                  </span>
                  <span aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-linear-to-t from-black/80 to-transparent" />
                  <span className="text-small leading-snug font-bold text-balance text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.5)] sm:text-base">
                    {t(`synagogues.${key}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
