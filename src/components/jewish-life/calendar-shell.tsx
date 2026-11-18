"use client";

import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { dirFor } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { hebrewMonthSpan, isMonthInRange, shiftMonth, yearMonthOf, formatMonthParam } from "@/lib/jewish-life/calendar";
import type { CalendarMonthData } from "@/lib/jewish-life/calendar-month";
import { jewishLifeHref, type JewishLifeParams } from "@/lib/jewish-life/urls";
import { cn } from "@/lib/utils";
import { CalendarMonthView } from "./calendar-month-view";

/**
 * The Jewish calendar: month navigation, city selector and the month itself.
 *
 * Changing the month or the city fetches just that month (GET /api/jewish-life/calendar, cached)
 * and swaps it in place, with a skeleton while it loads — the rest of the page is not rendered
 * again (that took seconds in development). The address bar follows (`?month=…&city=…`), back
 * and forward work, and the links still work without JavaScript (they jump to #calendar).
 */

type View = { month: string; city: string };

const key = ({ month, city }: View) => `${city}|${month}`;

export function CalendarShell({
  initial,
  current,
  today,
  cities,
  params,
}: {
  initial: CalendarMonthData;
  /** The current month, "YYYY-MM" (navigation stays within CALENDAR_RANGE_MONTHS of it). */
  current: string;
  /** Today, YYYY-MM-DD in Georgia time. */
  today: string;
  cities: { slug: string; name: string }[];
  /** The page's other query parameters (kept in the links). */
  params: JewishLifeParams;
}) {
  const t = useTranslations("jewishLife.calendar");
  const locale = useLocale();
  const [view, setView] = useState<View>({ month: initial.month, city: initial.city.slug });
  const [data, setData] = useState<CalendarMonthData>(initial);
  const [loading, setLoading] = useState(false);
  const cache = useRef(new Map<string, Promise<CalendarMonthData>>());
  const latest = useRef(key(view));

  const fetchMonth = useCallback(
    (target: View): Promise<CalendarMonthData> => {
      const id = key(target);
      if (id === key({ month: initial.month, city: initial.city.slug })) return Promise.resolve(initial);
      let request = cache.current.get(id);
      if (!request) {
        const query = new URLSearchParams({ month: target.month, city: target.city, locale });
        request = fetch(`/api/jewish-life/calendar?${query}`).then((response) => {
          if (!response.ok) throw new Error(String(response.status));
          return response.json() as Promise<CalendarMonthData>;
        });
        // A failed request is not cached, so the next try asks again.
        request.catch(() => cache.current.delete(id));
        cache.current.set(id, request);
      }
      return request;
    },
    [initial, locale],
  );

  const show = useCallback(
    async (target: View, fallbackHref: string | null) => {
      const id = key(target);
      latest.current = id;
      setView(target);
      setLoading(true);
      try {
        const next = await fetchMonth(target);
        if (latest.current !== id) return;
        setData(next);
        setLoading(false);
      } catch {
        // Offline or a server error: load the page the normal way.
        if (fallbackHref) window.location.assign(fallbackHref);
        else setLoading(false);
      }
    },
    [fetchMonth],
  );

  /** The query string for a view, keeping the page's other parameters. */
  const urlFor = useCallback(
    (target: View) => {
      const url = new URL(window.location.href);
      if (target.month === current) url.searchParams.delete("month");
      else url.searchParams.set("month", target.month);
      url.searchParams.set("city", target.city);
      url.hash = "calendar";
      return url;
    },
    [current],
  );

  function go(target: View) {
    if (key(target) === latest.current) return;
    const url = urlFor(target);
    window.history.pushState(null, "", url);
    void show(target, url.toString());
  }

  // Back / forward between months.
  useEffect(() => {
    const onPopState = () => {
      const search = new URLSearchParams(window.location.search);
      const month = search.get("month") ?? current;
      const city = search.get("city") ?? initial.city.slug;
      if (!/^\d{4}-\d{2}$/.test(month) || !cities.some((c) => c.slug === city)) return;
      if (key({ month, city }) !== latest.current) void show({ month, city }, null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [cities, current, initial.city.slug, show]);

  const shown = yearMonthOf(`${view.month}-01`);
  const currentMonth = yearMonthOf(`${current}-01`);
  const prev = shiftMonth(shown, -1);
  const next = shiftMonth(shown, 1);
  const target = (month: string, city = view.city): View => ({ month, city });
  const hrefFor = (v: View) => jewishLifeHref(params, { month: v.month === current ? null : v.month, city: v.city }, "calendar");
  const prevView = isMonthInRange(prev, currentMonth) ? target(formatMonthParam(prev)) : null;
  const nextView = isMonthInRange(next, currentMonth) ? target(formatMonthParam(next)) : null;
  const todayView = view.month === current ? null : target(current);
  // Make the next click instant: fetch a neighbouring month when the pointer or focus gets close.
  const warm = (v: View | null) => () => {
    if (v) fetchMonth(v).catch(() => undefined);
  };

  // When the browser is idle, fetch the next month too: the most likely click becomes instant.
  const nextMonth = nextView?.month ?? null;
  useEffect(() => {
    if (!nextMonth || typeof window.requestIdleCallback !== "function") return;
    const id = window.requestIdleCallback(() => fetchMonth({ month: nextMonth, city: view.city }).catch(() => undefined), {
      timeout: 4000,
    });
    return () => window.cancelIdleCallback(id);
  }, [nextMonth, view.city, fetchMonth]);

  function onLinkClick(event: MouseEvent<HTMLAnchorElement>, v: View) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    go(v);
  }

  const navButton =
    "inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  const monthTitle = formatDate(`${view.month}-01`, locale, { month: "long", year: "numeric" });
  const ready = !loading && data.month === view.month && data.city.slug === view.city;
  const hebrewMonths =
    ready && data.days.length ? hebrewMonthSpan(data.days[0].hebrewDate, data.days[data.days.length - 1].hebrewDate) : "";

  return (
    <div className="rounded-2xl border bg-card shadow-card">
      <div className="flex flex-col gap-4 border-b p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h3 className="text-xl font-bold tracking-tight" aria-live="polite">
            {monthTitle}
          </h3>
          <div className="min-h-5 text-sm text-muted-foreground">
            {hebrewMonths || (loading ? <Skeleton className="mt-0.5 h-4 w-36" /> : null)}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-40 flex-1 flex-col gap-1.5 md:flex-none">
            <label id="jl-calendar-city" className="text-xs font-medium text-muted-foreground">
              {t("cityLabel")}
            </label>
            <Select value={view.city} dir={dirFor(locale)} onValueChange={(slug) => go(target(view.month, slug))}>
              <SelectTrigger aria-labelledby="jl-calendar-city" className="h-11! w-full bg-card md:w-44">
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
            {prevView ? (
              <Link
                href={hrefFor(prevView)}
                scroll={false}
                prefetch={false}
                onClick={(e) => onLinkClick(e, prevView)}
                onPointerEnter={warm(prevView)}
                onFocus={warm(prevView)}
                className={cn(navButton, "px-0")}
              >
                <ChevronLeft aria-hidden="true" className="size-5 rtl:-scale-x-100" />
                <span className="sr-only">{t("previous")}</span>
              </Link>
            ) : (
              <span aria-disabled="true" className={cn(navButton, "px-0 opacity-40")}>
                <ChevronLeft aria-hidden="true" className="size-5 rtl:-scale-x-100" />
                <span className="sr-only">{t("previous")}</span>
              </span>
            )}
            {todayView ? (
              <Link
                href={hrefFor(todayView)}
                scroll={false}
                prefetch={false}
                onClick={(e) => onLinkClick(e, todayView)}
                className={navButton}
              >
                <CalendarCheck aria-hidden="true" className="size-4" />
                {t("thisMonth")}
              </Link>
            ) : null}
            {nextView ? (
              <Link
                href={hrefFor(nextView)}
                scroll={false}
                prefetch={false}
                onClick={(e) => onLinkClick(e, nextView)}
                onPointerEnter={warm(nextView)}
                onFocus={warm(nextView)}
                className={cn(navButton, "px-0")}
              >
                <ChevronRight aria-hidden="true" className="size-5 rtl:-scale-x-100" />
                <span className="sr-only">{t("next")}</span>
              </Link>
            ) : (
              <span aria-disabled="true" className={cn(navButton, "px-0 opacity-40")}>
                <ChevronRight aria-hidden="true" className="size-5 rtl:-scale-x-100" />
                <span className="sr-only">{t("next")}</span>
              </span>
            )}
          </nav>
        </div>
      </div>
      <div aria-busy={!ready}>
        {ready ? <CalendarMonthView data={data} today={today} /> : <CalendarSkeleton />}
      </div>
    </div>
  );
}

/** The calendar's shape while a month loads: a 6×7 grid on tablets, rows of days on phones. */
function CalendarSkeleton() {
  return (
    <div role="presentation">
      <div className="hidden p-3 sm:p-4 md:block">
        <div className="mb-2 grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="mx-auto h-4 w-8" />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-md lg:h-32" />
          ))}
        </div>
      </div>
      <ul className="divide-y md:hidden">
        {Array.from({ length: 30 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-24" />
          </li>
        ))}
      </ul>
    </div>
  );
}
