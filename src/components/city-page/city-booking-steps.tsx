import {
  BedDoubleIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  HandCoinsIcon,
  spriteIcon,
  type SpriteIconComponent,
} from "@/components/ds/sprite-icons";
import { CITY_PAGE_TYPE_KEYS, cityPageBookingMode, type CityPageType } from "@/lib/city-pages/core";
import { CitySectionHeading } from "./city-section-heading";
import type { CityPagesT } from "./city-text";

const MessagesIcon = spriteIcon("messages-square");
const WalletIcon = spriteIcon("wallet");
const VideoIcon = spriteIcon("video");
const CircleCheckIcon = spriteIcon("circle-check");

const STEP_ICONS: Record<CityPageType, [SpriteIconComponent, SpriteIconComponent, SpriteIconComponent]> = {
  "short-stays": [CalendarDaysIcon, CalendarCheckIcon, WalletIcon],
  hotels: [BedDoubleIcon, CalendarCheckIcon, WalletIcon],
  monthly: [MessagesIcon, VideoIcon, HandCoinsIcon],
  sale: [MessagesIcon, VideoIcon, CircleCheckIcon],
};

/**
 * "איך מזמינים" / "איך יוצרים קשר": three short steps. Short stays and hotels: choose dates, book
 * on the site, pay on arrival. Monthly rentals and sales: contact the owner, see the place, agree
 * directly. The wording follows the About page, the Help FAQ ("faq-booking-how") and the
 * How-it-works page (its guests' step 3 and FAQ were brought in line with booking in phase 6);
 * "להסבר המלא" opens the latter.
 */
export function CityBookingSteps({ id, type, t }: { id: string; type: CityPageType; t: CityPagesT }) {
  const key = CITY_PAGE_TYPE_KEYS[type];
  const icons = STEP_ICONS[type];
  const title = cityPageBookingMode(type) === "instant" ? t("booking.instantTitle") : t("booking.contactTitle");
  return (
    <section aria-labelledby={id} className="grid grid-cols-1 gap-4">
      <CitySectionHeading id={id} title={title} href="/how-it-works" linkLabel={t("booking.more")} />
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
        {(["step1", "step2", "step3"] as const).map((step, index) => {
          const Icon = icons[index];
          return (
            <li key={step} className="flex gap-3 rounded-card border border-border bg-card p-4">
              <span
                aria-hidden="true"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary-text ring-1 ring-primary-tint-border"
              >
                <Icon className="size-5" />
              </span>
              <div className="grid min-w-0 content-start gap-1">
                <p className="text-caption text-muted-foreground">{t("booking.step", { number: String(index + 1) })}</p>
                <h3 className="text-body font-semibold text-foreground">{t(`booking.${key}.${step}.title`)}</h3>
                <p className="text-small text-pretty text-muted-foreground">{t(`booking.${key}.${step}.body`)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
