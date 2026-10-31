import { ChevronLeft, ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageWindow, withParams, type SearchParamsRecord } from "@/lib/admin/params";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Page links for admin lists; keeps every other filter in the URL. */
export async function AdminPagination({
  pathname,
  searchParams,
  page,
  pageSize,
  total,
}: {
  pathname: string;
  searchParams: SearchParamsRecord;
  page: number;
  pageSize: number;
  total: number;
}) {
  if (total <= 0) return null;
  const t = await getTranslations("admin.pagination");
  const locale = await getLocale();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const href = (p: number) => `${pathname}${withParams(searchParams, { page: p === 1 ? null : p })}`;
  const linkClass =
    "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border bg-card px-2.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <nav aria-label={t("label")} className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {t("summary", { from: formatNumber(from, locale), to: formatNumber(to, locale), total: formatNumber(total, locale) })}
      </p>
      {pageCount > 1 ? (
        <ul className="flex flex-wrap items-center gap-1.5">
          <li>
            {page > 1 ? (
              <Link href={href(page - 1)} className={linkClass} rel="prev">
                <ChevronLeft aria-hidden className="size-4 rtl:-scale-x-100" />
                <span className="sr-only sm:not-sr-only">{t("previous")}</span>
              </Link>
            ) : null}
          </li>
          {pageWindow(page, pageCount).map((p, i) =>
            p === "gap" ? (
              <li key={`gap-${i}`} aria-hidden className="px-1 text-muted-foreground">
                …
              </li>
            ) : (
              <li key={p}>
                <Link
                  href={href(p)}
                  aria-current={p === page ? "page" : undefined}
                  aria-label={t("page", { page: formatNumber(p, locale) })}
                  className={cn(linkClass, p === page && "border-primary bg-primary text-primary-foreground hover:bg-primary")}
                >
                  {formatNumber(p, locale)}
                </Link>
              </li>
            ),
          )}
          <li>
            {page < pageCount ? (
              <Link href={href(page + 1)} className={linkClass} rel="next">
                <span className="sr-only sm:not-sr-only">{t("next")}</span>
                <ChevronRight aria-hidden className="size-4 rtl:-scale-x-100" />
              </Link>
            ) : null}
          </li>
        </ul>
      ) : null}
    </nav>
  );
}
