"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { activeNavKey, DESKTOP_TAB_ITEMS, type NavKey } from "./nav-items";

/** Desktop tab row on the purple header: Short stay · Monthly · Buy · Hotels · Map · Jewish Life · Help.
 * White links (lavender for the current one in dark mode) with a bar under the current one. */
function Tabs({ active }: { active: NavKey | null }) {
  const t = useTranslations("nav");
  return (
    <nav aria-label={t("mainNav")} className="-ms-3">
      <ul className="flex items-center gap-0.5">
        {DESKTOP_TAB_ITEMS.map(({ key, href, icon: Icon }) => {
          const current = key === active;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "group relative flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-header-fg/80 outline-none transition-colors hover:text-header-fg focus-visible:ring-3 focus-visible:ring-ring/60",
                  "after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:origin-center after:scale-x-0 after:rounded-t-full after:bg-header-fg after:transition-transform after:duration-(--motion-base) after:ease-(--ease-soft) hover:after:scale-x-50 dark:after:bg-primary-text",
                  current && "text-header-fg after:scale-x-100 hover:after:scale-x-100 dark:text-primary-text",
                )}
              >
                <Icon
                  aria-hidden
                  className={cn("size-4 transition-colors", current ? "text-current" : "text-header-fg/70 group-hover:text-header-fg")}
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
