import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { chipStyles } from "@/components/ds/chip";
import { IconCircle } from "@/components/ds/icon-circle";
import { KosherStampIcon, ShabbatCandlesIcon, SynagogueIcon, WelcomeHomeIcon, type IconComponent } from "@/components/ds/jewish-icons";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { serializeSearchQuery, type SearchFilters } from "@/lib/listing/search-params";

const SEARCHES: readonly { key: "synagogue" | "kosher" | "shabbat"; icon: IconComponent; filters: Partial<SearchFilters> }[] = [
  { key: "synagogue", icon: SynagogueIcon, filters: { synagogueMaxWalk: 10 } },
  { key: "kosher", icon: KosherStampIcon, filters: { kitchen: "kosher" } },
  { key: "shabbat", icon: ShabbatCandlesIcon, filters: { shabbatFriendly: true } },
];

/**
 * The promise, said plainly on the Jewish life page: every host on Bayit welcomes Israelis and
 * Jews, with three one-tap searches (near a synagogue, kosher kitchen, Shabbat-friendly).
 */
export async function WelcomeStrip({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "jewishLife" });

  return (
    <section aria-labelledby="jl-welcome-title" className="pt-section">
      <div className="overflow-hidden rounded-card bg-verified-soft ring-1 ring-verified/20">
        <div className="flex items-start gap-3 p-4 sm:items-center sm:gap-5 sm:p-6">
          <IconCircle icon={WelcomeHomeIcon} tone="green" size="md" className="bg-card ring-1 ring-verified/20 sm:size-14 sm:[&_svg]:size-6" />
          <div className="grid min-w-0 flex-1 gap-1">
            <h2 id="jl-welcome-title" className="text-h3 text-balance text-foreground">
              {t("welcome.title")}
            </h2>
            <p className="text-small text-pretty text-muted-foreground sm:text-body">{t("welcome.body")}</p>
          </div>
        </div>
        <nav aria-label={t("welcome.searchLabel")} className="border-t border-verified/15 px-4 py-3 sm:px-6">
          <ul className="flex flex-wrap gap-2">
            {SEARCHES.map(({ key, icon: Icon, filters }) => (
              <li key={key}>
                <Link href={`/search?${serializeSearchQuery(filters)}`} className={chipStyles({ size: "md", active: false })}>
                  <Icon aria-hidden="true" className="text-verified" />
                  {t(`welcome.search.${key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}

/** "A warm welcome for Jewish travelers": the longer introduction, folded away (short copy first). */
export async function IntroDetails({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "jewishLife.intro" });
  return (
    <details className="group mt-4 rounded-card border bg-card shadow-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 py-3 font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-6 [&::-webkit-details-marker]:hidden">
        {t("title")}
        <ChevronDown
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground transition-transform duration-(--motion-base) group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="space-y-3 px-4 pb-5 text-body leading-relaxed text-pretty text-foreground/85 sm:px-6">
        <p>{t("p1")}</p>
        <p>{t("p2")}</p>
        <p>{t("p3")}</p>
      </div>
    </details>
  );
}
