import { getTranslations } from "next-intl/server";
import { ChevronEnd, ChevronStart } from "@/components/common/directional-icon";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import type { SearchFilters } from "@/lib/listing/search-params";
import { searchPath } from "@/lib/listing/urls";
import { paginationItems } from "@/lib/search/pagination";
import { cn } from "@/lib/utils";

const itemClass =
  "inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-full px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Numbered pages with previous/next (server-rendered links that keep every filter), so each page
 * has its own URL and the browser's back button returns to the same place.
 */
export async function ResultsPagination({
  filters,
  page,
  pageCount,
  locale,
}: {
  filters: SearchFilters;
  page: number;
  pageCount: number;
  locale: AppLocale;
}) {
  if (pageCount <= 1) return null;
  const t = await getTranslations({ locale, namespace: "search.pagination" });
  const href = (n: number) => searchPath({ ...filters, page: n });

  return (
    <nav aria-label={t("label")} className="flex flex-col items-center gap-3 pt-6">
      <ul className="flex flex-wrap items-center justify-center gap-1">
        <li>
          {page > 1 ? (
            <Link href={href(page - 1)} rel="prev" className={cn(itemClass, "hover:bg-muted")}>
              <ChevronStart className="size-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t("previous")}</span>
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(itemClass, "text-muted-foreground/60")}>
              <ChevronStart className="size-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t("previous")}</span>
            </span>
          )}
        </li>
        {paginationItems(page, pageCount).map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-muted-foreground">
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                href={href(item)}
                aria-label={t("page", { page: formatNumber(item, locale) })}
                aria-current={item === page ? "page" : undefined}
                className={cn(
                  itemClass,
                  item === page ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {formatNumber(item, locale)}
              </Link>
            </li>
          ),
        )}
        <li>
          {page < pageCount ? (
            <Link href={href(page + 1)} rel="next" className={cn(itemClass, "hover:bg-muted")}>
              <span className="sr-only sm:not-sr-only">{t("next")}</span>
              <ChevronEnd className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(itemClass, "text-muted-foreground/60")}>
              <span className="sr-only sm:not-sr-only">{t("next")}</span>
              <ChevronEnd className="size-4" aria-hidden="true" />
            </span>
          )}
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">
        {t("summary", { page: formatNumber(page, locale), pages: formatNumber(pageCount, locale) })}
      </p>
    </nav>
  );
}
