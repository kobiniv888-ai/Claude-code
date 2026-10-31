"use client";

import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition, type MouseEvent, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dirFor } from "@/i18n/locale";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Month navigation and city selector of the Jewish calendar. The calendar grid itself is
 * rendered on the server and passed as `children`; while a new month or city loads it is dimmed.
 * Links work without JavaScript too (they jump to #calendar).
 */
export function CalendarShell({
  monthTitle,
  hebrewMonths,
  prevHref,
  nextHref,
  todayHref,
  citySlug,
  cities,
  children,
}: {
  monthTitle: string;
  hebrewMonths: string;
  prevHref: string | null;
  nextHref: string | null;
  /** Null when the current month is shown. */
  todayHref: string | null;
  citySlug: string;
  /** Each city with the link that selects it. */
  cities: { slug: string; name: string; href: string }[];
  children: ReactNode;
}) {
  const t = useTranslations("jewishLife.calendar");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go(href: string) {
    const [path] = href.split("#");
    startTransition(() => router.push(path, { scroll: false }));
  }

  function onLinkClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    go(href);
  }

  const navButton =
    "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <div className="rounded-2xl border bg-card shadow-card">
      <div className="flex flex-col gap-4 border-b p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h3 className="text-xl font-bold tracking-tight" aria-live="polite">
            {monthTitle}
          </h3>
          <p className="text-sm text-muted-foreground">{hebrewMonths}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-40 flex-1 flex-col gap-1.5 md:flex-none">
            <label id="jl-calendar-city" className="text-xs font-medium text-muted-foreground">
              {t("cityLabel")}
            </label>
            <Select
              value={citySlug}
              dir={dirFor(locale)}
              onValueChange={(slug) => {
                const city = cities.find((c) => c.slug === slug);
                if (city) go(city.href);
              }}
            >
              <SelectTrigger aria-labelledby="jl-calendar-city" className="h-10! w-full bg-card md:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {cities.map((city) => (
                  <SelectItem key={city.slug} value={city.slug}>
                    {city.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <nav aria-label={t("navLabel")} className="flex items-center gap-2">
            {prevHref ? (
              <Link
                href={prevHref}
                scroll={false}
                onClick={(e) => onLinkClick(e, prevHref)}
                className={cn(navButton, "w-10 px-0")}
              >
                <ChevronLeft aria-hidden="true" className="size-5 rtl:-scale-x-100" />
                <span className="sr-only">{t("previous")}</span>
              </Link>
            ) : (
              <span aria-disabled="true" className={cn(navButton, "w-10 px-0 opacity-40")}>
                <ChevronLeft aria-hidden="true" className="size-5 rtl:-scale-x-100" />
                <span className="sr-only">{t("previous")}</span>
              </span>
            )}
            {todayHref ? (
              <Link href={todayHref} scroll={false} onClick={(e) => onLinkClick(e, todayHref)} className={navButton}>
                <CalendarCheck aria-hidden="true" className="size-4" />
                {t("thisMonth")}
              </Link>
            ) : null}
            {nextHref ? (
              <Link
                href={nextHref}
                scroll={false}
                onClick={(e) => onLinkClick(e, nextHref)}
                className={cn(navButton, "w-10 px-0")}
              >
                <ChevronRight aria-hidden="true" className="size-5 rtl:-scale-x-100" />
                <span className="sr-only">{t("next")}</span>
              </Link>
            ) : (
              <span aria-disabled="true" className={cn(navButton, "w-10 px-0 opacity-40")}>
                <ChevronRight aria-hidden="true" className="size-5 rtl:-scale-x-100" />
                <span className="sr-only">{t("next")}</span>
              </span>
            )}
          </nav>
        </div>
      </div>
      <div aria-busy={pending} className={cn("transition-opacity", pending && "pointer-events-none opacity-50")}>
        {children}
      </div>
    </div>
  );
}
