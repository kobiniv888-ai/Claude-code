"use client";

import {
  BadgeCheck,
  ExternalLink,
  FileText,
  Flag,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Mail,
  Menu,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { LogoMark } from "@/components/common/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { isRtl } from "@/i18n/locale";
import { signOut } from "@/lib/auth/client";
import {
  groupAdminNav,
  isAdminNavActive,
  navBadge,
  type AdminCounts,
  type AdminNavItem,
  type AdminNavKey,
} from "@/lib/admin/nav";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICONS: Record<AdminNavKey, LucideIcon> = {
  overview: LayoutDashboard,
  moderation: Inbox,
  reports: Flag,
  users: Users,
  verifications: BadgeCheck,
  tickets: LifeBuoy,
  content: FileText,
  settings: Settings,
  roles: ShieldCheck,
  audit: ScrollText,
  outbox: Mail,
};

function NavBadge({ item, counts }: { item: AdminNavItem; counts: AdminCounts | null }) {
  const t = useTranslations("admin.nav");
  const locale = useLocale();
  const { count, urgent } = navBadge(item, counts);
  if (!count) return null;
  return (
    <span
      className={cn(
        "ms-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
        urgent ? "bg-destructive text-white" : "bg-primary/10 text-primary",
      )}
    >
      <span aria-hidden>{formatNumber(count, locale)}</span>
      <span className="sr-only">{t(urgent ? "badgeUrgent" : "badge", { count })}</span>
    </span>
  );
}

function NavLinks({
  items,
  counts,
  onNavigate,
}: {
  items: AdminNavItem[];
  counts: AdminCounts | null;
  onNavigate?: () => void;
}) {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="flex flex-col gap-5">
      {groupAdminNav(items).map(({ group, items: groupItems }) => (
        <div key={group}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t(`groups.${group}`)}
          </p>
          <ul className="grid gap-0.5">
            {groupItems.map((item) => {
              const Icon = ICONS[item.key];
              const active = isAdminNavActive(pathname, item.href);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active && pathname === item.href ? "page" : active ? "true" : undefined}
                    className={cn(
                      "flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50",
                      active && "bg-sidebar-accent text-sidebar-primary",
                    )}
                  >
                    <Icon aria-hidden className={cn("size-4 shrink-0", active ? "text-sidebar-primary" : "text-muted-foreground")} />
                    <span className="min-w-0 truncate">{t(item.key)}</span>
                    <NavBadge item={item} counts={counts} />
                  </Link>
                  {item.children && active ? (
                    <ul className="ms-6 mt-0.5 grid gap-0.5 border-s ps-2">
                      {item.children.map((child) => {
                        const childActive = isAdminNavActive(pathname, child.href);
                        return (
                          <li key={child.key}>
                            <Link
                              href={child.href}
                              onClick={onNavigate}
                              aria-current={childActive ? "page" : undefined}
                              className={cn(
                                "flex min-h-8 items-center rounded-md px-2 text-[13px] text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                                childActive && "font-medium text-sidebar-primary",
                              )}
                            >
                              {t(`contentChildren.${child.key}`)}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  const t = useTranslations("admin.shell");
  return (
    <Link
      href="/admin"
      className="flex items-center gap-2.5 rounded-lg px-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <LogoMark size={28} />
      <span className="text-sm leading-tight font-semibold">{t("panel")}</span>
    </Link>
  );
}

/** The desktop sidebar (lg and up). */
export function AdminSidebar({ items, counts }: { items: AdminNavItem[]; counts: AdminCounts | null }) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4">
      <div className="px-2">
        <Brand />
      </div>
      <NavLinks items={items} counts={counts} />
    </div>
  );
}

/** The menu button and sheet for phones and tablets. */
export function AdminMobileNav({ items, counts }: { items: AdminNavItem[]; counts: AdminCounts | null }) {
  const t = useTranslations("admin.shell");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const total = counts ? counts.inReview + counts.openReports + counts.activeTickets + counts.pendingVerifications : 0;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative lg:hidden" aria-label={t("openMenu")}>
          <Menu aria-hidden />
          {total > 0 ? (
            <span aria-hidden className="absolute end-1.5 top-1.5 size-2 rounded-full bg-destructive" />
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isRtl(locale) ? "right" : "left"}
        className="w-[min(85vw,18rem)] gap-0 bg-sidebar p-0 data-[side=left]:sm:max-w-xs data-[side=right]:sm:max-w-xs"
      >
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-start">
            <Brand />
          </SheetTitle>
          <SheetDescription className="sr-only">{t("menuDescription")}</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-3 py-4">
          <NavLinks items={items} counts={counts} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ViewSiteLink() {
  const t = useTranslations("admin.shell");
  return (
    <Button asChild variant="ghost" size="sm" className="h-9">
      <Link href="/" target="_blank" rel="noopener">
        <ExternalLink aria-hidden />
        <span className="hidden sm:inline">{t("viewSite")}</span>
        <span className="sr-only sm:hidden">{t("viewSite")}</span>
      </Link>
    </Button>
  );
}

export function SignOutButton() {
  const t = useTranslations("admin.shell");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-9"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await signOut();
          router.replace("/");
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
    >
      <LogOut aria-hidden className="rtl:-scale-x-100" />
      <span className="hidden sm:inline">{pending ? t("signingOut") : t("signOut")}</span>
      <span className="sr-only sm:hidden">{t("signOut")}</span>
    </Button>
  );
}
