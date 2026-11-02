import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { Chip } from "@/components/ds/chip";
import {
  BedDoubleIcon,
  BuildingIcon,
  HotelIcon,
  HouseIcon,
  KeyRoundIcon,
  MoonStarIcon,
  type SpriteIconComponent,
} from "@/components/ds/sprite-icons";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { HOME_CATEGORY_FILTERS, HOME_CATEGORY_KEYS, type HomeCategoryKey } from "@/lib/home/categories";
import { searchPath } from "@/lib/listing/urls";

const ICONS: Record<HomeCategoryKey, SpriteIconComponent> = {
  apartments: BuildingIcon,
  houses: HouseIcon,
  rooms: BedDoubleIcon,
  hotels: HotelIcon,
  forSale: KeyRoundIcon,
  kosherShabbat: MoonStarIcon,
};

/**
 * The category row (brief round 2, 5.2): small icon chips that scroll sideways on phones and
 * open the search with a filter. "Kosher & Shabbat" is the Jewish quick filter.
 */
export async function CategoryChips({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "home.categories" });
  return (
    <nav aria-label={t("label")}>
      <Container className="px-0 sm:px-6 lg:px-8">
        {/* py-1.5: room for the chips' 44px touch area and focus ring inside the scroller. */}
        <ul className="flex gap-2 overflow-x-auto overscroll-x-contain px-4 py-1.5 scrollbar-none sm:flex-wrap sm:px-0 md:justify-center">
          {HOME_CATEGORY_KEYS.map((key) => {
            const Icon = ICONS[key];
            return (
              <li key={key} className="shrink-0">
                <Chip asChild className="[&_svg]:text-primary">
                  <Link href={searchPath(HOME_CATEGORY_FILTERS[key])}>
                    <Icon aria-hidden="true" />
                    {t(key)}
                  </Link>
                </Chip>
              </li>
            );
          })}
        </ul>
      </Container>
    </nav>
  );
}
