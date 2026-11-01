"use client";

import { useEffect, useMemo, useState } from "react";
import { createTranslator, useLocale } from "next-intl";
import type countdownMessages from "../../../messages/en/shabbatCountdown.json";
import { ArrowEnd } from "@/components/common/directional-icon";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/locale";
import { formatTime } from "@/lib/format";
import { shabbatPhase, type CountdownPart } from "@/lib/home/countdown";
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
 * The candle flicker and glow (transform and opacity only; off with reduced motion). A hoisted
 * <style> rather than a CSS module: next.config's Turbopack rule treats every *.css as plain CSS.
 */
const SHABBAT_MOTION_CSS = `
.bs-flame {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: bs-flicker 2.6s ease-in-out infinite alternate;
}
.bs-flame2 {
  animation-duration: 3.1s;
  animation-delay: -1.2s;
}
.bs-glow {
  animation: bs-glow 3.4s ease-in-out infinite alternate;
}
@keyframes bs-flicker {
  0% {
    transform: scale(1, 1) rotate(0deg);
    opacity: 1;
  }
  30% {
    transform: scale(0.94, 1.06) rotate(-2deg);
    opacity: 0.92;
  }
  60% {
    transform: scale(1.04, 0.95) rotate(1.5deg);
    opacity: 1;
  }
  100% {
    transform: scale(0.97, 1.03) rotate(-1deg);
    opacity: 0.88;
  }
}
@keyframes bs-glow {
  from {
    opacity: 0.55;
    transform: scale(1);
  }
  to {
    opacity: 0.8;
    transform: scale(1.08);
  }
}
@media (prefers-reduced-motion: reduce) {
  .bs-flame,
  .bs-glow {
    animation: none;
  }
}
`;

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
    <article
      aria-labelledby={headingId}
      className={cn(
        "relative isolate overflow-hidden rounded-card bg-(--brand-primary) p-5 text-white shadow-raised sm:p-6",
        className,
      )}
    >
      <style href="bayit-shabbat-motion" precedence="medium">
        {SHABBAT_MOTION_CSS}
      </style>
      {/* Warm candle glow, decorative. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -top-16 -end-12 -z-10 size-56 rounded-full bg-amber-300/25 blur-3xl",
          "bs-glow",
        )}
      />
      <div className="flex items-start gap-4">
        <Candles className="h-16 w-12 shrink-0 sm:h-20 sm:w-14" />
        <div className="grid min-w-0 gap-1">
          <Heading id={headingId} className="text-small font-semibold text-white/80">
            {t("title")}
            {city.parashaTitle ? (
              <>
                {" · "}
                <span dir="auto">{city.parashaTitle}</span>
              </>
            ) : null}
          </Heading>
          <p className="text-h3 leading-snug font-bold text-balance text-white">{status}</p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-input bg-white/10 px-3 py-2.5 ring-1 ring-white/15">
          <dt className="text-caption text-white/75">{t("candleLighting")}</dt>
          <dd className="text-h3 font-bold tabular-nums">
            <bdi>{time(candles)}</bdi>
          </dd>
        </div>
        <div className="rounded-input bg-white/10 px-3 py-2.5 ring-1 ring-white/15">
          <dt className="text-caption text-white/75">{t("havdalah")}</dt>
          <dd className="text-h3 font-bold tabular-nums">
            <bdi>{time(havdalah)}</bdi>
          </dd>
        </div>
      </dl>

      <div className={cn("mt-4 flex items-center justify-between gap-3", scrollChips ? "flex-col items-stretch" : "flex-wrap")}>
        {cities.length > 1 ? (
          <div
            role="group"
            aria-label={t("cities")}
            className={cn(
              "flex gap-2",
              // Many cities: one row that scrolls sideways (the card's padding stays visible as a gutter).
              scrollChips
                ? "-mx-5 snap-x scroll-px-5 overflow-x-auto px-5 pb-1 scrollbar-none sm:-mx-6 sm:scroll-px-6 sm:px-6"
                : "flex-wrap",
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
                  // Plain string: cn() would drop text-small next to a text color (custom size names).
                  className={`inline-flex min-h-11 shrink-0 snap-start items-center rounded-full px-4 text-small font-semibold whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-white/60 ${
                    pressed ? "bg-white text-(--brand-primary)" : "bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20"
                  }`}
                >
                  {option.name}
                </button>
              );
            })}
          </div>
        ) : (
          <span />
        )}
        <span className="text-caption text-white/75">{t("localTime")}</span>
      </div>

      {moreHref ? (
        <Link
          href={moreHref}
          className="group mt-3 -mb-1 inline-flex min-h-11 items-center gap-1 rounded-full text-small font-semibold text-white underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-white/60"
        >
          {t("more")}
          <ArrowEnd className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </article>
  );
}

/** Two Shabbat candles with flickering flames (decorative SVG). */
function Candles({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 64" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="bayit-flame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff7d6" />
          <stop offset="0.55" stopColor="#ffd166" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <ellipse cx="14" cy="13" rx="7" ry="9" fill="#fcd34d" opacity="0.18" />
      <ellipse cx="34" cy="13" rx="7" ry="9" fill="#fcd34d" opacity="0.18" />
      <path className={"bs-flame"} d="M14 4c-2.6 3.2-4 5.6-4 7.7a4 4 0 0 0 8 0c0-2.1-1.4-4.5-4-7.7Z" fill="url(#bayit-flame)" />
      <path
        className={cn("bs-flame", "bs-flame2")}
        d="M34 4c-2.6 3.2-4 5.6-4 7.7a4 4 0 0 0 8 0c0-2.1-1.4-4.5-4-7.7Z"
        fill="url(#bayit-flame)"
      />
      <rect x="10" y="20" width="8" height="34" rx="1.5" fill="#f8fafc" />
      <rect x="30" y="20" width="8" height="34" rx="1.5" fill="#f8fafc" />
      <path d="M14 16.5v3.5M34 16.5v3.5" stroke="#1f2937" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="4" y="54" width="40" height="5" rx="2.5" fill="#cbd5e1" />
    </svg>
  );
}
