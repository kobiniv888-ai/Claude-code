import { ArrowRight, BookOpen, CalendarDays, Clock, Flame, MoonStar } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Ltr } from "@/components/common/ltr";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatDate, formatTime } from "@/lib/format";
import { getHolidaysInRange, getShabbatTimes, hebrewDate, holidayName, type ShabbatTimes } from "@/lib/hebcal";
import { utcOffsetLabel } from "@/lib/jewish-life/calendar";
import { cn } from "@/lib/utils";
import { resolveLocale, userWantsHebrewDates, type HeadingLevel, type ShabbatCityInput } from "./shared";

export type ShabbatTimesCardProps = {
  /** The place: `{ name, lat, lng, timezone }` (name already in the visitor's language). */
  city: ShabbatCityInput;
  /** "full" (home page, Jewish Life) or "compact" (listing sidebar, small spaces). Default "full". */
  variant?: "full" | "compact";
  /** Show the Hebrew date. Default: the signed-in user's "Show Hebrew dates" setting. */
  hebrewDates?: boolean;
  /** Default: the request locale. */
  locale?: AppLocale;
  /** Heading element for the card title. Default "h3". */
  headingLevel?: HeadingLevel;
  /** Link to the full times and calendar on /jewish-life. Default true. */
  showMoreLink?: boolean;
  /** For tests and previews: "now". */
  now?: Date;
  className?: string;
};

type Loaded = {
  times: ShabbatTimes;
  /** When a holiday reading replaces the weekly portion. */
  holidayReading: string | null;
};

async function load(city: ShabbatCityInput, locale: AppLocale, now?: Date): Promise<Loaded | null> {
  try {
    const times = await getShabbatTimes({ ...city }, locale, now);
    let holidayReading: string | null = null;
    if (!times.parasha) {
      const holidays = await getHolidaysInRange(times.shabbatDate, times.shabbatDate, locale);
      const main = holidays.find((h) => !h.isErev) ?? holidays[0];
      holidayReading = main ? await holidayName(main.key, locale) : null;
    }
    return { times, holidayReading };
  } catch (error) {
    console.error("[shabbat] could not compute Shabbat times:", error);
    return null;
  }
}

/**
 * This week's candle lighting, Havdalah and Torah portion for one city, in the CITY's time zone.
 *
 *   <ShabbatTimesCard city={{ name: "Tbilisi", lat: 41.7151, lng: 44.8271, timezone: "Asia/Tbilisi" }} />
 *   <ShabbatTimesCard city={city} variant="compact" headingLevel="h4" />
 *
 * Server component. From Friday until Havdalah it shows the current Shabbat, then the next one.
 */
export async function ShabbatTimesCard({
  city,
  variant = "full",
  hebrewDates,
  locale: localeProp,
  headingLevel: Heading = "h3",
  showMoreLink = true,
  now,
  className,
}: ShabbatTimesCardProps) {
  const locale = await resolveLocale(localeProp);
  const t = await getTranslations({ locale, namespace: "shabbat" });
  const [data, showHebrew] = await Promise.all([
    load(city, locale, now),
    hebrewDates ?? userWantsHebrewDates(),
  ]);
  const compact = variant === "compact";

  if (!data) {
    return (
      <div
        role="status"
        className={cn("flex items-start gap-3 rounded-2xl border bg-card p-4 text-sm shadow-card", className)}
      >
        <Clock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-semibold">{t("card.title", { city: city.name })}</p>
          <p className="mt-1 text-muted-foreground">{t("card.unavailable")}</p>
        </div>
      </div>
    );
  }

  const { times, holidayReading } = data;
  const zone = city.timezone;
  const offset = utcOffsetLabel(zone, times.candleLighting ?? now ?? new Date());
  const reading = times.parashaTitle ?? (holidayReading ? t("card.holidayReading", { name: holidayReading }) : null);
  const dayFormat: Intl.DateTimeFormatOptions = compact
    ? { weekday: "short", day: "numeric", month: "short" }
    : { weekday: "long", day: "numeric", month: "long" };
  const headingId = `shabbat-${city.lat.toFixed(3)}-${city.lng.toFixed(3)}-${variant}`.replace(/[^a-z0-9-]/gi, "_");

  const rows = [
    {
      key: "candles",
      icon: Flame,
      label: t("card.candleLighting"),
      time: times.candleLighting,
      day: times.erevDate,
      empty: t("card.noTime"),
      iconClass: "text-terracotta",
    },
    {
      key: "havdalah",
      icon: MoonStar,
      label: t("card.havdalah"),
      time: times.havdalah,
      day: times.shabbatDate,
      empty: t("card.noHavdalah"),
      iconClass: "text-primary",
    },
  ] as const;

  return (
    <section
      aria-labelledby={headingId}
      className={cn("flex flex-col rounded-2xl border bg-card shadow-card", compact ? "p-4" : "p-5 sm:p-6", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {compact ? null : <p className="text-xs font-semibold text-accent-foreground">{t("card.thisWeek")}</p>}
          <Heading id={headingId} className={cn("font-semibold text-balance", compact ? "text-base" : "mt-1 text-lg")}>
            {t("card.title", { city: city.name })}
          </Heading>
          {reading ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <BookOpen aria-hidden="true" className="size-3.5 shrink-0" />
              <span>{reading}</span>
            </p>
          ) : null}
        </div>
        <span
          aria-hidden="true"
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-terracotta/10 text-terracotta",
            compact ? "size-9" : "size-11",
          )}
        >
          <Flame className={compact ? "size-4" : "size-5"} />
        </span>
      </div>

      <dl className={cn("grid grid-cols-2", compact ? "mt-3 gap-2" : "mt-5 gap-3")}>
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.key} className={cn("rounded-xl bg-muted/70", compact ? "px-3 py-2.5" : "p-3 sm:p-4")}>
              <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", row.iconClass)} />
                {row.label}
              </dt>
              <dd className="mt-1">
                {row.time ? (
                  <time
                    dateTime={row.time.toISOString()}
                    className={cn("block font-bold tracking-tight tabular-nums", compact ? "text-lg" : "text-2xl")}
                  >
                    {formatTime(row.time, locale, zone)}
                  </time>
                ) : (
                  <span className="block text-sm font-medium">{row.empty}</span>
                )}
                <span className="mt-0.5 block text-xs text-muted-foreground">{formatDate(row.day, locale, dayFormat)}</span>
              </dd>
            </div>
          );
        })}
      </dl>

      {showHebrew ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm">
          <CalendarDays aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span>{t("card.hebrewDate", { date: hebrewDate(times.shabbatDate, locale) })}</span>
        </p>
      ) : null}

      <p className={cn("text-xs text-muted-foreground", compact ? "mt-2" : "mt-3")}>
        {t.rich("card.localTime", { city: city.name, offset, zone: (chunks) => <Ltr>{chunks}</Ltr> })}
      </p>

      {showMoreLink ? (
        <Link
          href="/jewish-life#shabbat-times"
          className={cn(
            "inline-flex min-h-6 items-center gap-1.5 self-start rounded-md text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            compact ? "mt-2" : "mt-4",
          )}
        >
          {t("card.moreLink")}
          <ArrowRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        </Link>
      ) : null}
    </section>
  );
}
