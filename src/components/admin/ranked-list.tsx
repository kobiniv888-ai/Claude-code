import { getLocale } from "next-intl/server";
import { formatNumber } from "@/lib/format";

/** A short ranked list with proportional bars (top cities). */
export async function RankedList({ items, empty }: { items: { key: string; label: string; count: number }[]; empty: string }) {
  const locale = await getLocale();
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ol className="flex flex-col gap-2.5">
      {items.map((item, i) => (
        <li key={item.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="me-2 text-xs text-muted-foreground tabular-nums">{formatNumber(i + 1, locale)}</span>
              {item.label}
            </span>
            <span className="font-medium tabular-nums">{formatNumber(item.count, locale)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary/70" style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
