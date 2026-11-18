import { getTranslations } from "next-intl/server";
import { chipStyles } from "@/components/ds/chip";
import { ShabbatCandlesIcon, type IconComponent } from "@/components/ds/jewish-icons";
import { spriteIcon } from "@/components/ds/sprite-icons";
import type { AppLocale } from "@/config/site";
import { cn } from "@/lib/utils";
import { JumpNavSpy } from "./jump-nav-spy";
import { JlContainer } from "./section";

/**
 * The hub's sections, in page order. The ids are linked from the side menu
 * (/jewish-life#shabbat-times, #calendar, #places, #emergency): keep them.
 */
export const JL_SECTIONS: readonly { id: string; key: "times" | "calendar" | "places" | "emergency" | "guides"; icon: IconComponent }[] = [
  { id: "shabbat-times", key: "times", icon: ShabbatCandlesIcon },
  { id: "calendar", key: "calendar", icon: spriteIcon("calendar-days") },
  { id: "places", key: "places", icon: spriteIcon("map-pinned") },
  { id: "emergency", key: "emergency", icon: spriteIcon("phone") },
  { id: "guides", key: "guides", icon: spriteIcon("book-open") },
];

const NAV_ID = "jl-jump-nav";

/**
 * "On this page": a sticky row of chips under the header (it follows the header when it hides on
 * scroll, data-follow-header), so the hub is five short stops instead of one endless scroll.
 * Plain anchors (works without JavaScript); a tiny client spy marks the section in view.
 */
export async function JumpNav({ locale, sections = JL_SECTIONS }: { locale: AppLocale; sections?: typeof JL_SECTIONS }) {
  const t = await getTranslations({ locale, namespace: "jewishLife.jump" });
  return (
    <nav
      id={NAV_ID}
      aria-label={t("label")}
      data-follow-header=""
      className="sticky top-(--header-height) z-(--z-sticky) border-b border-border bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85"
    >
      <JlContainer>
        <ul className="-mx-gutter flex snap-x gap-2 overflow-x-auto scroll-px-gutter px-gutter py-2.5 scrollbar-none sm:mx-0 sm:px-0">
          {sections.map(({ id, key, icon: Icon }) => (
            <li key={id} className="snap-start">
              <a
                href={`#${id}`}
                className={cn(
                  chipStyles({ size: "md", active: false }),
                  "aria-[current=location]:border-primary-tint-border aria-[current=location]:bg-primary-tint aria-[current=location]:text-primary-text aria-[current=location]:[&_svg]:text-primary-text",
                )}
              >
                <Icon aria-hidden="true" />
                {t(key)}
              </a>
            </li>
          ))}
        </ul>
      </JlContainer>
      <JumpNavSpy navId={NAV_ID} ids={sections.map((s) => s.id)} />
    </nav>
  );
}
