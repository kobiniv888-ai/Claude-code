import { BookOpen, CalendarDays, Flame, MoonStar } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Ltr } from "@/components/common/ltr";
import { siteConfig, type AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatDate, formatDateRange, formatNumber, formatTime } from "@/lib/format";
import { getShabbatTimes, hebrewDate, type ShabbatTimes } from "@/lib/hebcal";
import { utcOffsetLabel } from "@/lib/jewish-life/calendar";
import type { ShabbatCity } from "@/lib/jewish-life/queries";
import { jewishLifeHref, type JewishLifeParams } from "@/lib/jewish-life/urls";
import { cn } from "@/lib/utils";

/** This week's candle lighting and Havdalah for every active city. */
export async function ShabbatTimesTable({
  cities,
  selectedSlug,
  params,
  showHebrewDate,
  locale,
}: {
  cities: ShabbatCity[];
  /** City shown in the calendar below (highlighted). */
  selectedSlug: string;
  params: JewishLifeParams;
  showHebrewDate: boolean;
  locale: AppLocale;
}) {
  const t = await getTranslations({ locale, namespace: "jewishLife.times" });
  const now = new Date();
  const rows = await Promise.all(
    cities.map(async (city) => {
      try {
        return { city, times: await getShabbatTimes({ ...city }, locale, now) };
      } catch (error) {
        console.error(`[jewish-life] Shabbat times failed for ${city.slug}:`, error);
        return { city, times: null as ShabbatTimes | null };
      }
    }),
  );
  const reference = rows.find((r) => r.times)?.times ?? null;
  if (!reference) {
    return (
      <p role="status" className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground shadow-card">
        {t("unavailable")}
      </p>
    );
  }

  const offsets = new Map(rows.map((r) => [r.city.slug, utcOffsetLabel(r.city.timezone, r.times?.candleLighting ?? now)]));
  const distinctOffsets = new Set(offsets.values());
  const multiZone = distinctOffsets.size > 1;
  const sameWeekend = rows.every((r) => !r.times || r.times.erevDate === reference.erevDate);

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <div className="flex flex-col gap-2 border-b bg-secondary/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-center gap-2 font-semibold">
          <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-primary" />
          {formatDateRange(reference.erevDate, reference.shabbatDate, locale, {
            weekday: "short",
            day: "numeric",
            month: "long",
          })}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {reference.parashaTitle ? (
            <span className="flex items-center gap-1.5">
              <BookOpen aria-hidden="true" className="size-4 shrink-0" />
              {reference.parashaTitle}
            </span>
          ) : null}
          {showHebrewDate ? <span>{hebrewDate(reference.shabbatDate, locale)}</span> : null}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[18rem] text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-3 text-start font-medium sm:px-6">
                {t("city")}
              </th>
              <th scope="col" className="px-3 py-3 text-start font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <Flame aria-hidden="true" className="size-3.5 text-primary-text" />
                  {t("candleLighting")}
                </span>
              </th>
              <th scope="col" className="px-3 py-3 text-start font-medium sm:pe-6">
                <span className="inline-flex items-center gap-1.5">
                  <MoonStar aria-hidden="true" className="size-3.5 text-primary" />
                  {t("havdalah")}
                </span>
              </th>
              {multiZone ? (
                <th scope="col" className="px-3 py-3 text-start font-medium sm:pe-6">
                  {t("timeZone")}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ city, times }) => {
              const selected = city.slug === selectedSlug;
              return (
                <tr key={city.slug} className={cn("border-b last:border-b-0", selected && "bg-secondary/60")}>
                  <th scope="row" className="px-4 py-3 text-start font-medium sm:px-6">
                    <Link
                      href={jewishLifeHref(params, { city: city.slug }, "calendar")}
                      aria-current={selected ? "true" : undefined}
                      className="rounded-sm underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {city.name}
                    </Link>
                  </th>
                  <td className="px-3 py-3 font-semibold tabular-nums">
                    {times?.candleLighting ? (
                      <time dateTime={times.candleLighting.toISOString()}>
                        {formatTime(times.candleLighting, locale, city.timezone)}
                        {!sameWeekend ? (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {formatDate(times.erevDate, locale, { weekday: "short", day: "numeric", month: "short" })}
                          </span>
                        ) : null}
                      </time>
                    ) : (
                      <span className="text-muted-foreground">{t("noTime")}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-semibold tabular-nums sm:pe-6">
                    {times?.havdalah ? (
                      <time dateTime={times.havdalah.toISOString()}>
                        {formatTime(times.havdalah, locale, city.timezone)}
                      </time>
                    ) : (
                      <span className="text-xs font-normal text-muted-foreground">
                        {times ? t("noHavdalah") : t("noTime")}
                      </span>
                    )}
                  </td>
                  {multiZone ? (
                    <td className="px-3 py-3 text-muted-foreground sm:pe-6">
                      <Ltr>{offsets.get(city.slug)}</Ltr>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t px-4 py-3 text-xs text-pretty text-muted-foreground sm:px-6">
        {multiZone
          ? t("zoneNoteMulti")
          : t.rich("zoneNote", {
              offset: [...distinctOffsets][0] ?? "",
              zone: (chunks) => <Ltr>{chunks}</Ltr>,
            })}{" "}
        {t("methodNote", {
          candles: formatNumber(siteConfig.shabbat.candleLightingMinutesBefore, locale),
          havdalah: formatNumber(siteConfig.shabbat.havdalahMinutesAfter, locale),
        })}
      </p>
    </div>
  );
}
