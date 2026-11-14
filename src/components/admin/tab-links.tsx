import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Tabs that are links (the tab lives in the URL), with optional counts. On a phone they wrap onto
 * a second line instead of scrolling sideways, so every tab and its count stays in view (the
 * active one included, e.g. a link from the admin home to the third tab), at a 44px touch height.
 */
export function TabLinks({
  label,
  items,
  active,
}: {
  label: string;
  items: { key: string; href: string; label: string; count?: number; urgent?: boolean }[];
  active: string;
}) {
  const locale = useLocale();
  return (
    <nav aria-label={label} className="mb-4">
      <ul className="flex flex-wrap gap-1 rounded-xl border bg-card p-1 shadow-xs sm:inline-flex">
        {items.map((item) => {
          const current = item.key === active;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-lg px-3 sm:h-9 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                  current && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                )}
              >
                {item.label}
                {item.count !== undefined ? (
                  <span
                    className={cn(
                      "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] tabular-nums",
                      current ? "bg-primary-foreground/20" : item.urgent && item.count > 0 ? "bg-destructive text-destructive-foreground" : "bg-muted",
                    )}
                  >
                    {formatNumber(item.count, locale)}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
