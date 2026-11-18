"use client";

import { useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { useLoginDialog } from "@/components/auth/login-dialog";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { activeBottomNavKey, BOTTOM_NAV_ITEMS, bottomNavIndicator, isBottomNavHidden, savedHref, type BottomNavKey } from "./nav-items";

const isPlainClick = (event: React.MouseEvent) =>
  !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0);

/**
 * Phone bottom bar (hidden from 1024px): Home · Search · Post (the raised purple "+" with a white
 * border) · Saved · Log in / Profile. The active tab is purple (lavender in dark mode); a soft
 * purple-tint pill slides between the tabs (translate only) and moves the moment a tab is
 * tapped, before the next page arrives. Signed-out visitors tapping Profile get the login
 * sheet. The bar mirrors itself in RTL and leaves room for the iPhone home indicator.
 * Pages can hide it with <HideBottomNav />; it never shows in /admin.
 */
export function MobileBottomNav({ isSignedIn }: { isSignedIn: boolean }) {
  const t = useTranslations("nav.bottomNav");
  const pathname = usePathname();
  const loginDialog = useLoginDialog();
  // The tab just tapped, until its page arrives (so the pill slides at once).
  const [tapped, setTapped] = useState<{ key: BottomNavKey; from: string } | null>(null);
  if (tapped && tapped.from !== pathname) setTapped(null);

  if (isBottomNavHidden(pathname)) return null;
  const active = tapped?.key ?? activeBottomNavKey(pathname);
  const pill = bottomNavIndicator(active);

  return (
    <nav
      data-bottom-nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-(--z-nav) border-t border-border bg-bottom-nav pb-safe lg:hidden"
    >
      <div className="relative mx-auto h-16 max-w-lg">
        {/* The sliding pill behind the active icon (one column wide; mirrored in RTL). */}
        <span
          aria-hidden="true"
          style={{ "--i": pill.index } as CSSProperties}
          className={cn(
            "pointer-events-none absolute start-0 top-2 flex w-1/5 justify-center",
            "translate-x-[calc(var(--i)*100%)] rtl:translate-x-[calc(var(--i)*-100%)]",
            "transition-[translate,opacity] duration-(--motion-slow) ease-(--ease-soft) motion-reduce:transition-none",
            pill.visible ? "opacity-100" : "opacity-0",
          )}
        >
          <span className="h-8 w-14 rounded-full bg-primary-tint" />
        </span>

        <ul className="relative grid h-16 grid-cols-5">
          {BOTTOM_NAV_ITEMS.map(({ key, href, icon: Icon }) => {
            const current = key === active;

            if (key === "post") {
              return (
                <li key={key} className="flex justify-center">
                  <Link
                    href={href}
                    // Not prefetched: /post's layout carries the whole interface text (~100 KB),
                    // which every page view downloaded in the background for the few who post.
                    prefetch={false}
                    aria-label={t("postLabel")}
                    aria-current={current ? "page" : undefined}
                    onClick={(event) => isPlainClick(event) && setTapped({ key, from: pathname })}
                    className={cn(
                      "group flex flex-col items-center justify-end gap-1 pb-1.5 text-xs font-medium text-muted-foreground outline-none",
                      current && "text-primary-text",
                    )}
                  >
                    <span
                      className={cn(
                        // Raised 16px above the bar (no shadow); the white border sets it off the page.
                        "-mt-4 flex size-12 items-center justify-center rounded-full border-[3px] border-white bg-primary text-primary-foreground",
                        "transition-transform duration-(--motion-fast) ease-(--ease-pop) group-hover:scale-105 group-active:scale-90 motion-reduce:transition-none",
                        "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring",
                      )}
                    >
                      <Icon aria-hidden className="size-6" strokeWidth={2.4} />
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
                  href={isLogin ? "/login" : key === "saved" ? savedHref(isSignedIn) : href}
                  aria-current={current ? "page" : undefined}
                  onClick={(event) => {
                    if (!isPlainClick(event)) return;
                    if (isLogin && loginDialog) {
                      event.preventDefault();
                      loginDialog.openLogin();
                      return;
                    }
                    setTapped({ key, from: pathname });
                  }}
                  className={cn(
                    "group flex flex-1 flex-col items-center justify-start gap-0.5 pt-2 text-xs font-medium text-muted-foreground outline-none",
                    current && "text-primary-text",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-14 items-center justify-center rounded-full transition-[scale] duration-(--motion-fast) group-focus-visible:ring-3 group-focus-visible:ring-ring/50 group-active:scale-95 motion-reduce:transition-none",
                      !current && "group-hover:bg-surface-muted",
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
      </div>
    </nav>
  );
}
