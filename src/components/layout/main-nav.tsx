"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { activeNavKey, NAV_ITEMS, type NavKey } from "./nav-items";

/** Desktop tab row: Rent · Buy · Hotels · Map · Jewish Life · About · Help. */
function Tabs({ active }: { active: NavKey | null }) {
  const t = useTranslations("nav");
  return (
    <nav aria-label={t("mainNav")} className="-ms-3">
      <ul className="flex items-center gap-0.5">
        {NAV_ITEMS.map(({ key, href, icon: Icon }) => {
          const current = key === active;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "group relative flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                  "after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:origin-center after:scale-x-0 after:rounded-t-full after:bg-primary after:transition-transform after:duration-300 after:ease-(--ease-soft) hover:after:scale-x-50",
                  current && "text-foreground after:scale-x-100 hover:after:scale-x-100",
                )}
              >
                <Icon
                  aria-hidden
                  className={cn("size-4 transition-colors", current ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground")}
                />
                {t(`tabs.${key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function TabsWithQuery() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return <Tabs active={activeNavKey(pathname, searchParams)} />;
}

function TabsWithoutQuery() {
  const pathname = usePathname();
  return <Tabs active={activeNavKey(pathname)} />;
}

export function MainNav() {
  return (
    <Suspense fallback={<TabsWithoutQuery />}>
      <TabsWithQuery />
    </Suspense>
  );
}
