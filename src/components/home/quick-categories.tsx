import { getTranslations } from "next-intl/server";
import { ShabbatCandlesIcon } from "@/components/ds/jewish-icons";
import { PhotoSlot } from "@/components/photos/photo-slot";
import type { PhotoSlotKey } from "@/config/photos";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import type { SearchFilters } from "@/lib/listing/search-params";
import { searchPath } from "@/lib/listing/urls";
import { cn } from "@/lib/utils";
import { HomeSection } from "./home-section";

type Category = { key: string; slot: PhotoSlotKey; filters: Partial<SearchFilters> };

const CATEGORIES: readonly Category[] = [
  { key: "apartments", slot: "category.apartments", filters: { propertyTypes: ["APARTMENT", "STUDIO", "PENTHOUSE"] } },
  { key: "houses", slot: "category.houses", filters: { propertyTypes: ["HOUSE", "VILLA", "COTTAGE"] } },
  { key: "rooms", slot: "category.rooms", filters: { propertyTypes: ["ROOM"] } },
  { key: "hotels", slot: "category.hotels", filters: { deal: "hotels" } },
  { key: "forSale", slot: "category.sale", filters: { deal: "buy" } },
  { key: "shabbat", slot: "category.shabbat", filters: { shabbatFriendly: true, synagogueMaxWalk: 10 } },
];

/** Photo tiles for the most common searches: 2 columns on phones, 3 on tablets and desktop. */
export async function QuickCategories({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "home.categories" });
  return (
    <HomeSection id="home-categories-title" title={t("title")}>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        {CATEGORIES.map(({ key, slot, filters }) => (
          <li key={key}>
            <Link
              href={searchPath(filters)}
              className={cn(
                "group relative isolate flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-card bg-muted p-3 text-white shadow-card outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 sm:aspect-[16/10] sm:p-4",
                "bh-press",
              )}
            >
              <span className={cn("absolute inset-0 -z-10", "bh-zoom-hover")} aria-hidden="true">
                <PhotoSlot slot={slot} sizes="(min-width: 768px) 30vw, 48vw" alt="" className="size-full" />
              </span>
              <span aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-t from-black/75 via-black/20 to-transparent" />
              {key === "shabbat" ? (
                <span className="mb-1.5 inline-flex size-8 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30 backdrop-blur-sm">
                  <ShabbatCandlesIcon className="size-4.5 text-amber-100" aria-hidden="true" />
                </span>
              ) : null}
              <span className="text-base leading-snug font-bold text-balance text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.45)] sm:text-h3">
                {t(key)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}
