"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import type { ListingStats } from "@/lib/listing/stats";

type Metric = "views" | "contacts" | "saves";
const METRICS: readonly Metric[] = ["views", "contacts", "saves"];

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

/** One metric over time — one series per chart (small multiples share the x-axis, never a 2nd y-axis). */
function MetricChart({ metric, stats }: { metric: Metric; stats: ListingStats }) {
  const t = useTranslations("account.stats");
  const locale = useLocale();
  const gradientId = `${useId().replace(/:/g, "")}-${metric}`;
  const titleId = `${gradientId}-title`;
  const total = stats.totals[metric];
  const name = t(`metrics.${metric}`);

  return (
    <figure aria-labelledby={titleId} className="min-w-0 rounded-2xl border bg-card p-4 shadow-xs">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span id={titleId} className="text-sm font-semibold">
          {name}
        </span>
        <span className="text-2xl font-bold tabular-nums">{formatNumber(total, locale)}</span>
      </figcaption>
      <p className="text-xs text-muted-foreground">
        {t("allTime", { value: formatNumber(stats.allTime[metric], locale) })}
      </p>
      {/* Time runs left to right in every language, like on a map. */}
      <div dir="ltr" className="mt-3 h-40" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={stats.days} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tickFormatter={(value: string) => dayLabel(value, locale)}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(value: number) => formatNumber(value, locale, { notation: "compact" })}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 3" }}
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
        </ResponsiveContainer>
      </div>
    </figure>
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
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={10}>
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
          <table className="sr-only">
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
        </>
      )}
    </section>
  );
}

/** The listing stats dashboard: totals, three small-multiple charts, contacts per channel and a data table. */
export function ListingStatsCharts({ stats }: { stats: ListingStats }) {
  const t = useTranslations("account.stats");
  const locale = useLocale();
  const days = [...stats.days].reverse();

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {METRICS.map((metric) => (
          <MetricChart key={metric} metric={metric} stats={stats} />
        ))}
      </div>
      <ChannelChart stats={stats} />
      <details className="group min-w-0 rounded-2xl border bg-card shadow-xs">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-6">
          {t("table.toggle")}
        </summary>
        <div className="relative max-h-[28rem] overflow-auto border-t">
          <Table>
            <caption className="sr-only">{t("table.caption")}</caption>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead scope="col">{t("table.date")}</TableHead>
                {METRICS.map((m) => (
                  <TableHead key={m} scope="col" className="text-end">
                    {t(`metrics.${m}`)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.map((day) => (
                <TableRow key={day.date}>
                  <TableCell>{formatDate(day.date, locale, { dateStyle: "medium", timeZone: "UTC" })}</TableCell>
                  {METRICS.map((m) => (
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
