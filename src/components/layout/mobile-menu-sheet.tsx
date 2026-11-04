"use client";

import { Suspense, useId, type ReactNode, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import {
  Compass,
  Heart,
  Info,
  LifeBuoy,
  Mail,
  Phone,
  Plus,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { LoginButton } from "@/components/auth/login-dialog";
import { LogoutButton } from "@/components/auth/logout-button";
import { Logo } from "@/components/brand/logo";
import { ChevronEnd } from "@/components/common/directional-icon";
import { buttonStyles } from "@/components/ds/button";
import { SynagogueIcon, type IconComponent } from "@/components/ds/jewish-icons";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Link, usePathname } from "@/i18n/navigation";
import { isRtl } from "@/i18n/locale";
import { cn } from "@/lib/utils";
import { CurrencyChips } from "./currency-chips";
import { LanguageList } from "./language-list";
import { activeNavKey, DEAL_NAV_KEYS, NAV_ITEMS, normalizePath, type NavKey } from "./nav-items";
import { ThemeSegmented } from "./theme-segmented";

type Row = { id: string; href: string; label: string; icon: IconComponent; current?: boolean };

/** What the sheet shows: the whole menu, or only the language list (from the header's "HE" pill). */
export type MenuView = "menu" | "language";

/** One row: a grey icon (purple when it is the current page), the label and a chevron. */
function MenuRow({ row, onNavigate }: { row: Row; onNavigate: () => void }) {
  return (
    <li>
      <Link
        href={row.href}
        onClick={onNavigate}
        aria-current={row.current ? "page" : undefined}
        className={cn(
          "group flex min-h-12 items-center gap-3 rounded-input px-3 py-1 text-body text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50",
          row.current && "bg-primary-tint font-medium text-primary-text hover:bg-primary-tint",
        )}
      >
        <row.icon aria-hidden className={cn("size-5 shrink-0", row.current ? "text-primary-text" : "text-muted-foreground")} />
        {/* Long labels (Georgian, Russian) wrap instead of being cut off (bug 8.3). */}
        <span className="min-w-0 flex-1 py-1.5 leading-snug text-pretty">{row.label}</span>
        <ChevronEnd
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground/70 transition-transform duration-(--motion-fast) group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none"
        />
      </Link>
    </li>
  );
}

function MenuGroup({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("grid grid-cols-1 gap-1.5", className)}>
      <h3 id={id} className="px-2 text-caption font-semibold tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

const SEARCH_KEYS: readonly NavKey[] = [...DEAL_NAV_KEYS, "map"];

/**
 * "Find a place": the home page's four deal tabs (short stay, monthly, buy, hotels), the map — all
 * matched with the query, like the desktop tabs — and saved.
 */
function SearchRows({ active, onNavigate }: { active: NavKey | null; onNavigate: () => void }) {
  const t = useTranslations("nav");
  const path = normalizePath(usePathname());
  const rows: Row[] = [
    ...NAV_ITEMS.filter((item) => SEARCH_KEYS.includes(item.key)).map((item) => ({
      id: item.key,
      href: item.href,
      label: t(`tabs.${item.key}`),
      icon: item.icon,
      current: item.key === active,
    })),
    {
      id: "saved",
      href: "/account/favorites",
      label: t("saved"),
      icon: Heart,
      current: path === "/account/favorites",
    },
  ];
  return (
    <ul className="grid grid-cols-1 gap-0.5">
      {rows.map((row) => (
        <MenuRow key={row.id} row={row} onNavigate={onNavigate} />
      ))}
    </ul>
  );
}

function SearchRowsWithQuery(props: { onNavigate: () => void }) {
  return <SearchRows active={activeNavKey(usePathname(), useSearchParams())} {...props} />;
}

function SearchRowsWithoutQuery(props: { onNavigate: () => void }) {
  return <SearchRows active={activeNavKey(usePathname())} {...props} />;
}

const legalLinks = [
  { key: "listingRules", href: "/legal/listing-rules" },
  { key: "terms", href: "/legal/terms" },
  { key: "privacy", href: "/legal/privacy" },
  { key: "cookies", href: "/legal/cookies" },
  { key: "accessibility", href: "/legal/accessibility" },
] as const;

/**
 * Phone header: the side menu. Post and log in (or My account) on top, then grouped rows — find a
 * place, one "Jewish life in Georgia" row (the hub has its own tabs), help & safety with the
 * emergency numbers — the language, currency and theme pickers, and the legal pages.
 *
 * Loaded on demand by <MobileMenu> (./mobile-menu), which renders the trigger button: Radix Dialog
 * and the rows' icons are not part of every page's first load. Focus goes back to that button
 * when the sheet closes.
 */
export function MobileMenuSheet({
  isSignedIn,
  adminLabel,
  open,
  setOpen,
  view = "menu",
  trigger,
}: {
  isSignedIn: boolean;
  /** Staff only: shows an "Admin panel" link (the admin pages check the role themselves). */
  adminLabel?: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  view?: MenuView;
  /** The menu button, to give focus back to on close. */
  trigger: RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const locale = useLocale();
  const close = () => setOpen(false);
  const path = normalizePath(usePathname());

  // Round 3: one row for Jewish life (it was five); its sub-pages count as the current page.
  const jewishRow: Row = {
    id: "jewish-life",
    href: "/jewish-life",
    label: t("menu.links.jewishLifeHome"),
    icon: SynagogueIcon,
    current: path === "/jewish-life" || path.startsWith("/jewish-life/"),
  };
  // Emergency numbers live on the safety page too (/safety#emergency): every traveller needs them.
  const helpRows: Row[] = [
    { id: "help", href: "/help", label: t("tabs.help"), icon: LifeBuoy },
    { id: "safety", href: "/safety", label: t("safety"), icon: ShieldCheck },
    { id: "emergency", href: "/safety#emergency", label: t("menu.links.emergency"), icon: Phone },
    { id: "contact", href: "/contact", label: t("contact"), icon: Mail },
    { id: "about", href: "/about", label: t("menu.links.ourStory"), icon: Info },
    { id: "how", href: "/how-it-works", label: t("menu.links.howItWorks"), icon: Compass },
  ].map((row) => ({ ...row, current: path === row.href }));

  const menuBody = (
      <>
          {/* Side by side when both labels fit, stacked otherwise (long Arabic or Russian labels). */}
          <div className="flex flex-wrap gap-2 px-1">
            <Link href="/post" onClick={close} className={buttonStyles({ variant: "primary", size: "md", className: "min-w-fit flex-1 px-4" })}>
              <Plus aria-hidden className="size-5" strokeWidth={2.5} />
              {t("bottomNav.post")}
            </Link>
            {isSignedIn ? (
              <Link href="/account" onClick={close} className={buttonStyles({ variant: "outline", size: "md", className: "min-w-fit flex-1 px-4" })}>
                <UserRound aria-hidden className="size-5" />
                {t("menu.account")}
              </Link>
            ) : (
              <div onClickCapture={close} className="flex min-w-fit flex-1">
                <LoginButton className="h-12 flex-1 rounded-button bg-card px-4 text-base font-medium" />
              </div>
            )}
            {adminLabel && (
              <Link href="/admin" onClick={close} className={buttonStyles({ variant: "secondary", size: "md", className: "w-full px-4" })}>
                <ShieldCheck aria-hidden className="size-5" />
                {adminLabel}
              </Link>
            )}
          </div>

          <nav aria-label={t("mainNav")} className="mt-5 grid grid-cols-1 gap-5">
            <MenuGroup title={t("menu.groups.search")}>
              <Suspense fallback={<SearchRowsWithoutQuery onNavigate={close} />}>
                <SearchRowsWithQuery onNavigate={close} />
              </Suspense>
            </MenuGroup>

            <ul className="grid grid-cols-1 gap-0.5">
              <MenuRow row={jewishRow} onNavigate={close} />
            </ul>

            <MenuGroup title={t("menu.groups.help")}>
              <ul className="grid grid-cols-1 gap-0.5">
                {helpRows.map((row) => (
                  <MenuRow key={row.id} row={row} onNavigate={close} />
                ))}
              </ul>
            </MenuGroup>
          </nav>

          <div className="mt-6 grid gap-5 border-t px-2 pt-5">
            <MenuGroup title={t("language.label")} className="px-0 [&>h3]:px-0">
              <LanguageList onNavigate={close} />
            </MenuGroup>
            <MenuGroup title={t("currency.label")} className="[&>h3]:px-0">
              <CurrencyChips />
            </MenuGroup>
            <MenuGroup title={t("theme.label")} className="[&>h3]:px-0">
              <ThemeSegmented />
            </MenuGroup>
          </div>

          <MenuGroup title={t("menu.groups.legal")} className="mt-6 border-t px-0 pt-5">
            <ul className="grid grid-cols-2 gap-x-2">
              {legalLinks.map(({ href, key }) => (
                <li key={key}>
                  <Link
                    href={href}
                    onClick={close}
                    className="flex min-h-11 items-center rounded-lg px-2 text-small text-muted-foreground outline-none hover:bg-surface-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {t(`menu.links.${key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </MenuGroup>

          {/* Round 3, bug 2.9: logging out from the phone menu (signs out, clears this device's private data). */}
          {isSignedIn ? (
            <div className="mt-5 border-t pt-4">
              <LogoutButton
                className="flex min-h-12 w-full rounded-input px-3 text-body font-medium text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-70 [&>svg]:text-muted-foreground"
              />
            </div>
          ) : null}
      </>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        // The language pill opens a short bottom sheet; the menu button the side menu.
        side={view === "language" ? "bottom" : isRtl(locale) ? "left" : "right"}
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus({ preventScroll: true });
        }}
        className="gap-0 p-0 data-[side=left]:w-[min(88vw,24rem)] data-[side=right]:w-[min(88vw,24rem)] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm"
      >
        {view === "language" ? (
          <>
            <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong" />
            <SheetHeader className="flex-row items-center justify-between border-b border-border py-2 ps-5 pe-3">
              <SheetTitle className="text-body font-semibold">{t("language.label")}</SheetTitle>
              <SheetDescription className="sr-only">{t("language.label")}</SheetDescription>
              <SheetClose asChild>
                <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label={tc("close")}>
                  <X aria-hidden className="size-5" />
                </Button>
              </SheetClose>
            </SheetHeader>
            <div className="px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
              <LanguageList onNavigate={close} />
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="flex-row items-center justify-between border-b border-border py-3 ps-5 pe-3">
              <SheetTitle className="sr-only">{t("menu.title")}</SheetTitle>
              <SheetDescription className="sr-only">{t("mainNav")}</SheetDescription>
              <Logo size={18} onClick={close} />
              <SheetClose asChild>
                <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label={tc("close")}>
                  <X aria-hidden className="size-5" />
                </Button>
              </SheetClose>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
              {menuBody}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
