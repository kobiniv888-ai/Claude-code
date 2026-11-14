"use client";

import { useEffect, useMemo, useState } from "react";
import { createTranslator, useLocale } from "next-intl";
import type countdownMessages from "../../../messages/en/shabbatCountdown.json";
import { ArrowEnd } from "@/components/common/directional-icon";
import { chipStyles } from "@/components/ds/chip";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/locale";
import { formatTime } from "@/lib/format";
import { shabbatPhase, type CountdownPart } from "@/lib/home/countdown";
import { ShabbatCandlesIcon } from "@/components/ds/jewish-icons";
import { cn } from "@/lib/utils";

/** The shape of messages/<locale>/shabbatCountdown.json. */
export type CountdownMessages = typeof countdownMessages;

export type CountdownCity = {
  slug: string;
  name: string;
  /** ISO instants (null when there is none this week, e.g. a Yom Tov right after Shabbat). */
  candleLighting: string | null;
  havdalah: string | null;
  parashaTitle: string | null;
  timezone: string;
};

const TICK_MS = 30_000;

/**
 * The client part of <ShabbatCountdownCard>: the live countdown ("Shabbat starts in 2 days and
 * 4 hours" / "Shabbat shalom · ends at 18:32"), the times and the city chips. It starts from the
 * server's clock (no hydration mismatch) and then follows the device clock every 30 seconds.
 */
export function ShabbatCountdown({
  cities,
  initialSlug,
  serverNow,
  messages,
  headingLevel: Heading = "h3",
  moreHref,
  className,
}: {
  cities: CountdownCity[];
  /** City shown first (default: the first one). */
  initialSlug?: string;
  serverNow: string;
  /** messages/<locale>/shabbatCountdown.json (this namespace is not sent to every page). */
  messages: CountdownMessages;
  headingLevel?: "h2" | "h3";
  /** "All Shabbat times →" link; none when omitted. */
  moreHref?: string;
  className?: string;
}) {
  const locale = useLocale();
  const t = useMemo(
    () => createTranslator({ locale: intlLocale(locale), messages: { c: messages }, namespace: "c" }),
    [locale, messages],
  );
  const [now, setNow] = useState(() => new Date(serverNow));
  const [slug, setSlug] = useState(
    (initialSlug && cities.some((c) => c.slug === initialSlug) ? initialSlug : cities[0]?.slug) ?? "",
  );

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, TICK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  const city = cities.find((c) => c.slug === slug) ?? cities[0];
  if (!city) return null;

  const candles = city.candleLighting ? new Date(city.candleLighting) : null;
  const havdalah = city.havdalah ? new Date(city.havdalah) : null;
  const phase = shabbatPhase(now, candles, havdalah);
  const time = (date: Date | null) => (date ? formatTime(date, locale, city.timezone) : "–");

  const duration = (parts: CountdownPart[]) => {
    const words = parts.map((part) => t(`units.${part.unit}`, { count: part.count }));
    if (words.length < 2) return words[0] ?? "";
    return t("pair", { first: words[0], second: words[1], digit: /^\d/.test(words[1]) ? "yes" : "no" });
  };

  const status =
    phase.phase === "before"
      ? t("before", { time: duration(phase.parts) })
      : phase.phase === "during"
        ? havdalah
          ? t("during", { time: time(havdalah) })
          : t("duringNoEnd")
        : phase.phase === "after"
          ? t("after")
          : t("unknown");

  const headingId = `shabbat-countdown-${city.slug}`;
  const scrollChips = cities.length > 3;

  return (
    // Round 2: a calm card (border, no fill, no flames); the two times sit on the lavender tint.
    <article aria-labelledby={headingId} className={cn("min-w-0 rounded-card border border-border bg-card p-4 sm:p-5", className)}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary-text"
        >
          <ShabbatCandlesIcon className="size-5" />
        </span>
        <div className="grid min-w-0 gap-0.5">
          <Heading id={headingId} className="text-small text-muted-foreground">
            {t("title")}
            {city.parashaTitle ? (
              <>
                {" · "}
                <span dir="auto">{city.parashaTitle}</span>
              </>
            ) : null}
          </Heading>
          <p className="text-body font-semibold text-balance text-foreground">
            {status}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-input bg-primary-tint px-3 py-2.5">
          <dt className="text-caption text-muted-foreground">{t("candleLighting")}</dt>
          <dd className="text-h2 font-semibold text-foreground tabular-nums">
            <bdi>{time(candles)}</bdi>
          </dd>
        </div>
        <div className="rounded-input bg-primary-tint px-3 py-2.5">
          <dt className="text-caption text-muted-foreground">{t("havdalah")}</dt>
          <dd className="text-h2 font-semibold text-foreground tabular-nums">
            <bdi>{time(havdalah)}</bdi>
          </dd>
        </div>
      </dl>

      {cities.length > 1 ? (
        <div
          role="group"
          aria-label={t("cities")}
          className={cn(
            "mt-3 flex gap-2",
            // Many cities: one row that scrolls sideways (the card's padding stays visible as a gutter).
            scrollChips ? "-mx-4 snap-x scroll-px-4 overflow-x-auto px-4 py-1 scrollbar-none sm:-mx-5 sm:scroll-px-5 sm:px-5" : "flex-wrap py-1",
          )}
        >
          {cities.map((option) => {
            const pressed = option.slug === city.slug;
            return (
              <button
                key={option.slug}
                type="button"
                aria-pressed={pressed}
                onClick={() => setSlug(option.slug)}
                className={cn(chipStyles({ size: "md", active: pressed }), "snap-start")}
              >
                {option.name}
              </button>
            );
          })}
        </div>
      ) : null}
      <p className="mt-2 text-caption text-muted-foreground">{t("localTime")}</p>

      {moreHref ? (
        <Link
          href={moreHref}
          className="mt-2 -mb-1 inline-flex min-h-11 items-center gap-1 rounded-full text-small font-medium text-primary-text outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("more")}
          <ArrowEnd className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </article>
  );
}
