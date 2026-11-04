"use client";

import { useLocale } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { isRtl } from "@/i18n/locale";
import { formatNumber } from "@/lib/format";

/**
 * Contact clicks by channel (one series: no legend, the section title names it). Horizontal
 * bars so long channel names fit at 360px; in RTL the axis runs right-to-left (the SVG itself is
 * laid out LTR so text anchors are not flipped twice). A visually hidden
 * table carries the same numbers for screen readers.
 */
export function ClicksByChannelChart({
  data,
  labels,
}: {
  data: { label: string; count: number }[];
  labels: { channel: string; clicks: string; table: string };
}) {
  const locale = useLocale();
  const rtl = isRtl(locale);
  const height = Math.max(180, data.length * 34 + 30);

  return (
    <div>
      <div aria-hidden dir="ltr" className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart accessibilityLayer={false} data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 12 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis
              type="number"
              allowDecimals={false}
              reversed={rtl}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={(v: number) => formatNumber(v, locale)}
            />
            <YAxis
              type="category"
              dataKey="label"
              orientation={rtl ? "right" : "left"}
              width={96}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--foreground)", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              contentStyle={{
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--popover-foreground)", fontWeight: 600 }}
              itemStyle={{ color: "var(--popover-foreground)" }}
              formatter={(value) => [formatNumber(Number(value), locale), labels.clicks]}
            />
            <Bar
              dataKey="count"
              fill="var(--primary)"
              radius={rtl ? [4, 0, 0, 4] : [0, 4, 4, 0]}
              maxBarSize={18}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* sr-only on a wrapper: a table ignores the 1px width and would widen the page (long Georgian headers). */}
      <div className="sr-only">
        <table>
          <caption>{labels.table}</caption>
          <thead>
            <tr>
              <th scope="col">{labels.channel}</th>
              <th scope="col">{labels.clicks}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{formatNumber(row.count, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
