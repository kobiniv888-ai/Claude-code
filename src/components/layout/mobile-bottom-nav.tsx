"use client";

import { useTranslations } from "next-intl";
import { useLoginDialog } from "@/components/auth/login-dialog";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { activeBottomNavKey, BOTTOM_NAV_ITEMS, isBottomNavHidden } from "./nav-items";

/**
 * Phone bottom bar (hidden from 1024px): Home · Search · Post (raised) · Saved · Profile.
 * Signed-out visitors tapping Profile get the login dialog. The bar mirrors itself in RTL
 * (it is a flex/grid row) and leaves room for the iPhone home indicator.
 * Pages can hide it with <HideBottomNav />; it never shows in /admin.
 */
export function MobileBottomNav({ isSignedIn }: { isSignedIn: boolean }) {
  const t = useTranslations("nav.bottomNav");
  const pathname = usePathname();
  const loginDialog = useLoginDialog();
  if (isBottomNavHidden(pathname)) return null;
  const active = activeBottomNavKey(pathname);

  return (
    <nav
      data-bottom-nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 pb-safe shadow-[0_-4px_24px_rgb(16_24_40/0.06)] backdrop-blur-xl backdrop-saturate-150 lg:hidden dark:shadow-[0_-4px_24px_rgb(0_0_0/0.35)]"
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
        {BOTTOM_NAV_ITEMS.map(({ key, href, icon: Icon }) => {
          const current = key === active;

          if (key === "post") {
            return (
              <li key={key} className="flex justify-center">
                <Link
                  href={href}
                  aria-label={t("postLabel")}
                  aria-current={current ? "page" : undefined}
                  className="group flex flex-col items-center justify-end gap-1 pb-1.5 text-[11px] font-semibold text-foreground outline-none"
                >
                  <span className="-mt-6 flex size-14 items-center justify-center rounded-full bg-terracotta text-terracotta-foreground shadow-float ring-4 ring-background transition-transform duration-200 group-hover:scale-[1.03] group-focus-visible:ring-ring/60 group-active:scale-95">
                    <Icon aria-hidden className="size-7" strokeWidth={2.4} />
                  </span>
                  {t("post")}
                </Link>
              </li>
            );
          }

          const isLogin = key === "profile" && !isSignedIn;
          const label = isLogin ? t("login") : t(key);
          return (
            <li key={key} className="flex">
              <Link
                href={isLogin ? "/login" : href}
                aria-current={current ? "page" : undefined}
                onClick={(event) => {
                  if (!isLogin || !loginDialog) return;
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                  event.preventDefault();
                  loginDialog.openLogin();
                }}
                className={cn(
                  "group flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground outline-none transition-colors",
                  current && "font-semibold text-primary",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-14 items-center justify-center rounded-full transition-colors group-hover:bg-muted group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
                    current && "bg-primary/10 group-hover:bg-primary/10",
                  )}
                >
                  <Icon
                    aria-hidden
                    className={cn("size-[22px]", current && key === "saved" && "fill-current")}
                    strokeWidth={current ? 2.2 : 1.9}
                  />
                </span>
                <span className="max-w-full truncate px-0.5">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
