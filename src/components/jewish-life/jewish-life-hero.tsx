import { CalendarDays, HeartHandshake, MapPinned, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { IconCircle } from "@/components/ds/icon-circle";
import { ShabbatCandlesIcon, type IconComponent } from "@/components/ds/jewish-icons";
import { HomeMotionStyles } from "@/components/home/home-motion";
import { PhotoSlot } from "@/components/photos/photo-slot";
import type { AppLocale } from "@/config/site";
import { JlContainer } from "./section";

type Tone = "navy" | "coral" | "green" | "amber";

/** The 4 quick actions (brief §2 "keep": community map, Shabbat times, Hebrew calendar, emergency numbers). */
const ACTIONS: readonly { key: "map" | "times" | "calendar" | "emergency"; href: string; icon: IconComponent; tone: Tone }[] = [
  { key: "map", href: "#places", icon: MapPinned, tone: "navy" },
  { key: "times", href: "#shabbat-times", icon: ShabbatCandlesIcon, tone: "coral" },
  { key: "calendar", href: "#calendar", icon: CalendarDays, tone: "green" },
  { key: "emergency", href: "#emergency", icon: Phone, tone: "amber" },
];

/**
 * Top of /jewish-life: a photo of the Great Synagogue of Tbilisi with the title, and the four
 * quick actions as big round icon buttons on a card that overlaps the photo.
 */
export async function JewishLifeHero({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "jewishLife.hero" });

  return (
    <section aria-labelledby="jewish-life-title" className="relative isolate">
      <HomeMotionStyles />
      <div className="relative h-[min(30rem,58svh)] min-h-[21rem] overflow-hidden bg-primary sm:h-[26rem] lg:h-[30rem]">
        <div className="bh-zoom absolute inset-0" data-zoom="a">
          <PhotoSlot
            slot="jewish.tbilisiSynagogue"
            sizes="100vw"
            priority
            className="size-full"
            imageClassName="object-[50%_35%]"
          />
        </div>
        {/* Darker at the bottom so the white title always reads (AA over any photo). */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-t from-black/85 via-black/45 to-black/5"
        />
        <JlContainer className="relative flex h-full flex-col justify-end pb-20 sm:pb-24">
          <p
            className="bh-rise mb-3 inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-small font-semibold text-white ring-1 ring-white/25 backdrop-blur-sm"
            style={{ "--rise-delay": "0ms" } as React.CSSProperties}
          >
            <HeartHandshake aria-hidden="true" className="size-4" />
            {t("eyebrow")}
          </p>
          <h1
            id="jewish-life-title"
            className="bh-rise max-w-2xl text-display text-balance text-white [text-shadow:0_2px_16px_rgb(0_0_0/0.35)]"
            style={{ "--rise-delay": "60ms" } as React.CSSProperties}
          >
            {t("title")}
          </h1>
          <p
            className="bh-rise mt-2 max-w-xl text-body text-pretty text-white/90 sm:text-lg"
            style={{ "--rise-delay": "120ms" } as React.CSSProperties}
          >
            {t("lead")}
          </p>
        </JlContainer>
      </div>

      <JlContainer className="relative z-(--z-raised) -mt-14 sm:-mt-16">
        <nav
          aria-label={t("actionsLabel")}
          className="bh-rise rounded-card bg-card p-2 shadow-raised ring-1 ring-foreground/5 sm:p-3 lg:mx-auto lg:max-w-3xl"
          style={{ "--rise-delay": "180ms" } as React.CSSProperties}
        >
          <ul className="grid grid-cols-4 gap-1 sm:gap-3">
            {ACTIONS.map(({ key, href, icon, tone }) => (
              <li key={key}>
                <a
                  href={href}
                  className="bh-press flex h-full min-h-11 flex-col items-center gap-2 rounded-card px-1 py-2.5 text-center text-caption font-semibold text-foreground outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50 sm:py-3 sm:text-small"
                >
                  <IconCircle icon={icon} tone={tone} size="lg" className="ring-1 ring-foreground/5 sm:size-16 sm:[&_svg]:size-7" />
                  <span className="text-balance">{t(`actions.${key}`)}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </JlContainer>
    </section>
  );
}
