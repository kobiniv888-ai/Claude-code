import { Building2, HandCoins, Hotel, House, BedSingle, Sunset, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import type { SearchFilters } from "@/lib/listing/search-params";
import { searchPath } from "@/lib/listing/urls";

type Category = { key: string; icon: LucideIcon; filters: Partial<SearchFilters> };

const CATEGORIES: readonly Category[] = [
  { key: "apartments", icon: Building2, filters: { propertyTypes: ["APARTMENT", "STUDIO", "PENTHOUSE"] } },
  { key: "houses", icon: House, filters: { propertyTypes: ["HOUSE", "VILLA", "COTTAGE"] } },
  { key: "rooms", icon: BedSingle, filters: { propertyTypes: ["ROOM"] } },
  { key: "hotels", icon: Hotel, filters: { deal: "hotels" } },
  { key: "forSale", icon: HandCoins, filters: { deal: "buy" } },
  { key: "shabbat", icon: Sunset, filters: { shabbatFriendly: true, synagogueMaxWalk: 10 } },
];

/** Icon chips for the most common searches. */
export async function QuickCategories({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "home.categories" });
  return (
    <section aria-labelledby="home-categories-title" className="py-8 sm:py-10">
      <Container>
        <h2 id="home-categories-title" className="sr-only">
          {t("title")}
        </h2>
        <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
          {CATEGORIES.map(({ key, icon: Icon, filters }) => (
            <li key={key} className="shrink-0 snap-start">
              <Link
                href={searchPath(filters)}
                className="group flex h-full min-w-36 flex-col items-center gap-2 rounded-2xl border bg-card px-3 py-4 text-center shadow-xs transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="text-sm leading-snug font-semibold text-balance">{t(key)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
