"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  BellRingIcon,
  CalendarCheck2Icon,
  GitCompareArrowsIcon,
  HeartIcon,
  HouseIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  LuggageIcon,
  MessagesSquareIcon,
  SettingsIcon,
  ShieldCheckIcon,
  StarIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { Container } from "@/components/common/container";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCompare } from "@/hooks/use-compare";
import { Link, usePathname } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { activeAccountNav, isFullWidthAccountPage, type AccountNavItem, type AccountNavKey } from "@/lib/account/nav";
import { safeDisplayName } from "@/lib/auth/first-name";
import { cn } from "@/lib/utils";

const ICONS: Record<AccountNavKey, LucideIcon> = {
  overview: LayoutDashboardIcon,
  trips: LuggageIcon,
  listings: HouseIcon,
  hostBookings: CalendarCheck2Icon,
  favorites: HeartIcon,
  compare: GitCompareArrowsIcon,
  messages: MessagesSquareIcon,
  savedSearches: BellRingIcon,
  reviews: StarIcon,
  tickets: LifeBuoyIcon,
  verification: ShieldCheckIcon,
  settings: SettingsIcon,
};

function shortCount(value: number, locale: string): string {
  return value > 99 ? `${formatNumber(99, locale)}+` : formatNumber(value, locale);
}

function Count({ value, label }: { value: number; label: string }) {
  const locale = useLocale();
  if (value <= 0) return null;
  return (
    <span className="ms-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
      <span aria-hidden="true">{shortCount(value, locale)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * The dashboard frame: a side navigation on desktop and a horizontally scrollable tab strip on
 * phones. The seven tabs come first (brief 5.8); the secondary pages (compare, support…) follow
 * in a quieter list on desktop, and on phones only while they are open or have something waiting.
 * The listing editor (/account/listings/<id>/edit) has its own chrome and is shown alone.
 */
export function AccountShell({
  items,
  user,
  waitingTickets,
  children,
}: {
  items: AccountNavItem[];
  user: { name: string; image: string | null; initial: string | null };
  waitingTickets: number;
  children: ReactNode;
}) {
  const t = useTranslations("account.nav");
  const locale = useLocale();
  const pathname = usePathname();
  const compare = useCompare();
  const active = activeAccountNav(pathname, items);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const strip = stripRef.current;
    const current = strip?.querySelector<HTMLElement>("[aria-current='page']");
    if (strip && current) current.scrollIntoView({ block: "nearest", inline: "center" });
  }, [active]);

  if (isFullWidthAccountPage(pathname)) return <>{children}</>;

  const counts: Partial<Record<AccountNavKey, { value: number; label: string }>> = {
    tickets: { value: waitingTickets, label: t("ticketsWaiting", { count: waitingTickets }) },
    compare: { value: compare.count, label: t("compareCount", { count: compare.count }) },
  };
  const tabs = items.filter((item) => item.tab);
  const more = items.filter((item) => !item.tab);
  // Phones: the tabs, plus a secondary page while it is open or has something waiting.
  const stripItems = [...tabs, ...more.filter((item) => item.key === active || (counts[item.key]?.value ?? 0) > 0)];

  const sideLink = (item: AccountNavItem, quiet: boolean) => {
    const Icon = ICONS[item.key];
    const current = item.key === active;
    const count = counts[item.key];
    return (
      <li key={item.key}>
        <Link
          href={item.href}
          aria-current={current ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 font-medium text-muted-foreground transition-colors outline-none",
            quiet ? "text-small" : "text-sm",
            "hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
            current && "bg-secondary text-primary hover:bg-secondary hover:text-primary",
          )}
        >
          <Icon className={cn("shrink-0", quiet ? "size-4.5" : "size-5")} aria-hidden="true" />
          <span className="min-w-0 text-pretty">{t(item.key)}</span>
          {count ? <Count value={count.value} label={count.label} /> : null}
        </Link>
      </li>
    );
  };

  return (
    <Container className="pb-16 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 lg:pb-20">
      <aside className="hidden lg:block">
        <div className="sticky top-24 flex flex-col gap-4 pt-8">
          <div className="flex items-center gap-3 px-2">
            <Avatar className="size-11">
              {user.image ? <AvatarImage src={user.image} alt="" /> : null}
              <AvatarFallback>{user.initial ?? <UserRoundIcon className="size-5" aria-hidden />}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("heading")}</p>
              {/* Never a phone number or an email as a name (bug 8.2). */}
              <p className="truncate font-semibold" dir="auto">
                {safeDisplayName(user.name)}
              </p>
            </div>
          </div>
          <nav aria-label={t("label")} className="grid gap-3">
            <ul className="flex flex-col gap-0.5">{tabs.map((item) => sideLink(item, false))}</ul>
            {more.length > 0 && (
              <ul className="flex flex-col gap-0.5 border-t border-border pt-3">{more.map((item) => sideLink(item, true))}</ul>
            )}
          </nav>
        </div>
      </aside>

      <div className="min-w-0">
        <nav aria-label={t("label")} className="-mx-4 border-b bg-background sm:-mx-6 lg:hidden">
          <div
            ref={stripRef}
            className="relative flex gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden"
          >
            {stripItems.map((item) => {
              const Icon = ICONS[item.key];
              const current = item.key === active;
              const count = counts[item.key];
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none",
                    "hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                    current && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {t(item.key)}
                  {count && count.value > 0 ? (
                    <span
                      className={cn(
                        "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                        current ? "bg-primary-foreground/20" : "bg-primary text-primary-foreground",
                      )}
                    >
                      <span aria-hidden="true">{shortCount(count.value, locale)}</span>
                      <span className="sr-only">{count.label}</span>
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </nav>
        {/* Pages (including the ticket pages) bring their own Container; the frame already has the gutters. */}
        <div className="*:max-w-none! *:px-0!">{children}</div>
      </div>
    </Container>
  );
}
