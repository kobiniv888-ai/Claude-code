"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import type { ListingStats } from "@/lib/listing/stats";
import { percent } from "@/lib/listing/stats-math";

type Metric = "views" | "saves" | "contacts";
const METRICS: readonly Metric[] = ["views", "saves", "contacts"];
type TableMetric = Metric | "bookings" | "bookedNights";

const axisTick = { fill: "var(--muted-foreground)", fontSize: 12 };

function dayLabel(date: string, locale: string) {
  return formatDate(date, locale, { day: "numeric", month: "short", timeZone: "UTC" });
}

function ChartTooltip({
  active,
  payload,
  label,
  locale,
  name,
  labelFor,
}: {
  active?: boolean;
  payload?: readonly { value?: unknown }[];
  label?: unknown;
  locale: string;
  name: string;
  labelFor: (value: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0].value ?? 0);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="text-xs text-muted-foreground">{labelFor(String(label ?? ""))}</p>
      <p className="font-semibold">
        {name}: {formatNumber(value, locale)}
      </p>
    </div>
  );
}

function dayAxis(locale: string, days: number) {
  return (
    <XAxis
      dataKey="date"
      tick={axisTick}
      tickLine={false}
      axisLine={{ stroke: "var(--border)" }}
      tickFormatter={(value: string) => dayLabel(value, locale)}
      minTickGap={days <= 7 ? 10 : 24}
      interval="preserveStartEnd"
    />
  );
}

/** One metric over time: one series per chart (small multiples share the x-axis, never a 2nd y-axis). */
function MetricChart({ metric, stats, hotel = false }: { metric: Metric | "bookedNights"; stats: ListingStats; hotel?: boolean }) {
  const t = useTranslations("account.stats");
  const locale = useLocale();
  const gradientId = `${useId().replace(/:/g, "")}-${metric}`;
  const titleId = `${gradientId}-title`;
  const total = stats.totals[metric];
  const name = t(`metrics.${metric === "bookedNights" && hotel ? "roomNights" : metric}`);
  const allTime = metric === "bookedNights" ? null : stats.allTime[metric];
  const tooltip = (
    <Tooltip
      cursor={metric === "bookedNights" ? { fill: "var(--muted)" } : { stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 3" }}
      content={(props) => (
        <ChartTooltip
          active={props.active}
          payload={props.payload as readonly { value?: unknown }[] | undefined}
          label={props.label}
          locale={locale}
          name={name}
          labelFor={(d) => formatDate(d, locale, { dateStyle: "medium", timeZone: "UTC" })}
        />
      )}
    />
  );
  const yAxis = (
    <YAxis
      allowDecimals={false}
      tick={axisTick}
      tickLine={false}
      axisLine={false}
      width={36}
      tickFormatter={(value: number) => formatNumber(value, locale, { notation: "compact" })}
    />
  );

  return (
    <figure aria-labelledby={titleId} className="min-w-0 rounded-2xl border bg-card p-4 shadow-xs">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span id={titleId} className="text-sm font-semibold">
          {name}
        </span>
        <span className="text-2xl font-bold tabular-nums">{formatNumber(total, locale)}</span>
      </figcaption>
      <p className="text-xs text-muted-foreground">
        {allTime === null ? t(hotel ? "roomNightsHint" : "bookedNightsHint") : t("allTime", { value: formatNumber(allTime, locale) })}
      </p>
      {/* Time runs left to right in every language, like on a map. The table below has the numbers. */}
      <div dir="ltr" className="mt-3 h-36" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          {metric === "bookedNights" ? (
            <BarChart accessibilityLayer={false} data={stats.days} margin={{ top: 6, right: 16, bottom: 0, left: 4 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              {dayAxis(locale, stats.range)}
              {yAxis}
              {tooltip}
              <Bar dataKey="bookedNights" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            </BarChart>
          ) : (
            <AreaChart accessibilityLayer={false} data={stats.days} margin={{ top: 6, right: 16, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              {dayAxis(locale, stats.range)}
              {yAxis}
              {tooltip}
              <Area
                type="monotone"
                dataKey={metric}
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                isAnimationActive={false}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** A thin bar for a share (0–1); the number next to it carries the meaning. */
function Meter({ rate }: { rate: number | null }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div className="h-full rounded-full bg-chart-1" style={{ width: `${rate === null ? 0 : Math.max(rate > 0 ? 2 : 0, percent(rate))}%` }} />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid min-w-0 content-start gap-1 rounded-xl bg-surface-muted p-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
      {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

/** Short stays and hotels: bookings made, nights booked and occupancy (hotels per room type too). */
function BookingsSection({ stats, hotel }: { stats: ListingStats; hotel: boolean }) {
  const t = useTranslations("account.stats.bookings");
  const tm = useTranslations("account.stats.metrics");
  const locale = useLocale();
  const n = (value: number) => formatNumber(value, locale);
  const occupancy = stats.occupancy;
  const rateText = occupancy?.rate == null ? t("noRate") : t("rate", { value: n(percent(occupancy.rate)) });
  const ofText = occupancy
    ? t(hotel ? "roomNightsOf" : "nightsOf", { count: occupancy.offeredNights, booked: n(occupancy.bookedNights), offered: n(occupancy.offeredNights) })
    : undefined;

  return (
    <section aria-labelledby="bookings-title" className="min-w-0 rounded-2xl border bg-card p-4 shadow-xs sm:p-6">
      <h2 id="bookings-title" className="font-semibold">
        {t("title")}
      </h2>
      <p className="text-sm text-muted-foreground">{t(hotel ? "leadHotel" : "lead")}</p>
      <p className="text-sm text-muted-foreground">{t("closedNotOffered")}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={tm("bookings")} value={n(stats.totals.bookings)} />
        <Stat label={tm(hotel ? "roomNights" : "bookedNights")} value={n(stats.totals.bookedNights)} />
        <div className="col-span-2 grid min-w-0 content-start gap-1 rounded-xl bg-surface-muted p-3 sm:col-span-1">
          <dt className="text-sm text-muted-foreground">{t("occupancy")}</dt>
          <dd className="text-2xl font-bold tabular-nums">{rateText}</dd>
          <dd className="grid gap-1.5">
            <Meter rate={occupancy?.rate ?? null} />
            {ofText ? <span className="text-xs text-muted-foreground">{ofText}</span> : null}
          </dd>
        </div>
      </dl>

      {hotel ? (
        stats.roomTypes.length === 0 ? (
          <p className="mt-4 rounded-xl bg-muted px-3 py-4 text-center text-sm text-muted-foreground">{t("noRoomTypes")}</p>
        ) : (
          <div className="mt-5 min-w-0">
            <h3 className="text-sm font-semibold">{t("roomTypesTitle")}</h3>
            <ul className="mt-2 grid gap-2">
              {stats.roomTypes.map((room) => (
                <li key={room.id} className="grid gap-1.5 rounded-xl border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span dir="auto" className="min-w-0 font-medium break-words">
                      {room.name || t("unnamedRoom")}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {room.rate === null ? t("noRate") : t("rate", { value: n(percent(room.rate)) })}
                    </span>
                  </div>
                  <Meter rate={room.rate} />
                  <p className="text-xs text-muted-foreground">
                    {t("roomTypeLine", {
                      count: room.quantity,
                      rooms: n(room.quantity),
                      booked: n(room.bookedNights),
                      offered: n(room.offeredNights),
                    })}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
    </section>
  );
}

function ChannelChart({ stats }: { stats: ListingStats }) {
  const t = useTranslations("account.stats");
  const channelName = useTranslations("listingFields.contactChannel");
  const locale = useLocale();
  const rows = Object.entries(stats.byChannel)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([channel, count]) => ({
      channel,
      name: channelName.has(channel) ? channelName(channel) : channel,
      count: count ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <section aria-labelledby="channels-title" className="min-w-0 rounded-2xl border bg-card p-4 shadow-xs sm:p-6">
      <h2 id="channels-title" className="font-semibold">
        {t("channels.title")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("channels.lead")}</p>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl bg-muted px-3 py-4 text-center text-sm text-muted-foreground">{t("channels.empty")}</p>
      ) : (
        <>
          <div dir="ltr" className="mt-4" style={{ height: Math.max(120, rows.length * 44) }} aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart accessibilityLayer={false} data={rows} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={10}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={axisTick} tickLine={false} axisLine={false} width={96} />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  content={(props) => (
                    <ChartTooltip
                      active={props.active}
                      payload={props.payload as readonly { value?: unknown }[] | undefined}
                      label={props.label}
                      locale={locale}
                      name={t("metrics.contacts")}
                      labelFor={(v) => v}
                    />
                  )}
                />
                <Bar dataKey="count" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive={false}>
                  <LabelList
                    dataKey="count"
                    position="right"
                    className="fill-foreground text-xs font-semibold"
                    formatter={(value: unknown) => formatNumber(Number(value ?? 0), locale)}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* sr-only on a wrapper: a table ignores the 1px width and would widen the page (long Georgian caption). */}
          <div className="sr-only">
            <table>
              <caption>{t("channels.title")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("channels.channel")}</th>
                  <th scope="col">{t("metrics.contacts")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.channel}>
                    <th scope="row">{row.name}</th>
                    <td>{formatNumber(row.count, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * The listing stats dashboard (round 3, brief 6.2): views, saves and contact taps (small
 * multiples), contact taps per method, bookings / booked nights / occupancy for short stays and
 * hotels (per room type for hotels) and every day in a table.
 */
export function ListingStatsCharts({ stats, hotel = false }: { stats: ListingStats; hotel?: boolean }) {
  const t = useTranslations("account.stats");
  const locale = useLocale();
  const days = [...stats.days].reverse();
  const columns: TableMetric[] = stats.bookable ? [...METRICS, "bookings", "bookedNights"] : [...METRICS];

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {METRICS.map((metric) => (
          <MetricChart key={metric} metric={metric} stats={stats} />
        ))}
      </div>
      {stats.bookable ? (
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[2fr_1fr]">
          <BookingsSection stats={stats} hotel={hotel} />
          <MetricChart metric="bookedNights" stats={stats} hotel={hotel} />
        </div>
      ) : null}
      <ChannelChart stats={stats} />
      <details className="group min-w-0 rounded-2xl border bg-card shadow-xs">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-6">
          {t("table.toggle")}
        </summary>
        <div className="relative max-h-[28rem] overflow-auto border-t">
          <Table>
            <caption className="sr-only">{t(stats.bookable ? "table.captionBookable" : "table.caption")}</caption>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead scope="col">{t("table.date")}</TableHead>
                {columns.map((m) => (
                  <TableHead key={m} scope="col" className="text-end">
                    {t(`metrics.${m === "bookedNights" && hotel ? "roomNights" : m}`)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.map((day) => (
                <TableRow key={day.date}>
                  <TableCell>{formatDate(day.date, locale, { dateStyle: "medium", timeZone: "UTC" })}</TableCell>
                  {columns.map((m) => (
                    <TableCell key={m} className="text-end tabular-nums">
                      {formatNumber(day[m], locale)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </div>
  );
}
