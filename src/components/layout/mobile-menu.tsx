"use client";

import { Suspense, useId, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Compass,
  Heart,
  Info,
  LifeBuoy,
  Mail,
  MapPinned,
  Menu,
  Phone,
  Plus,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { LoginButton } from "@/components/auth/login-dialog";
import { LogoLink } from "@/components/common/logo";
import { ChevronEnd } from "@/components/common/directional-icon";
import { buttonStyles } from "@/components/ds/button";
import { IconCircle, type IconCircleProps } from "@/components/ds/icon-circle";
import { ShabbatCandlesIcon, SynagogueIcon, type IconComponent } from "@/components/ds/jewish-icons";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Link, usePathname } from "@/i18n/navigation";
import { isRtl } from "@/i18n/locale";
import { cn } from "@/lib/utils";
import { CurrencyChips } from "./currency-switcher";
import { LanguageList } from "./language-switcher";
import { activeNavKey, NAV_ITEMS, normalizePath, type NavKey } from "./nav-items";
import { ThemeSegmented } from "./theme-toggle";

type Tone = NonNullable<IconCircleProps["tone"]>;
type Row = { id: string; href: string; label: string; icon: IconComponent; tone: Tone; current?: boolean };

/** One livo-style row: an icon in a tinted circle, the label and a chevron. */
function MenuRow({ row, onNavigate }: { row: Row; onNavigate: () => void }) {
  return (
    <li>
      <Link
        href={row.href}
        onClick={onNavigate}
        aria-current={row.current ? "page" : undefined}
        className={cn(
          "group flex min-h-12 items-center gap-3 rounded-input px-2 py-1 text-body font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
          row.current && "bg-navy-soft font-semibold hover:bg-navy-soft",
        )}
      >
        <IconCircle icon={row.icon} tone={row.tone} size="sm" />
        <span className="min-w-0 flex-1 truncate">{row.label}</span>
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
    <section aria-labelledby={id} className={cn("grid gap-1.5", className)}>
      <h3 id={id} className="px-2 text-caption font-semibold tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

const SEARCH_TONES: Partial<Record<NavKey, Tone>> = { rent: "navy", buy: "navy", hotels: "navy", map: "green" };

/** "Find a place": rent, buy, hotels, map (matched with the query, like the desktop tabs) and saved. */
function SearchRows({ active, onNavigate }: { active: NavKey | null; onNavigate: () => void }) {
  const t = useTranslations("nav");
  const path = normalizePath(usePathname());
  const rows: Row[] = [
    ...NAV_ITEMS.filter((item) => item.key in SEARCH_TONES).map((item) => ({
      id: item.key,
      href: item.href,
      label: t(`tabs.${item.key}`),
      icon: item.icon,
      tone: SEARCH_TONES[item.key] ?? "navy",
      current: item.key === active,
    })),
    {
      id: "saved",
      href: "/account/favorites",
      label: t("saved"),
      icon: Heart,
      tone: "coral",
      current: path === "/account/favorites",
    },
  ];
  return (
    <ul className="grid gap-0.5">
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
 * Phone header: the side menu. Post and log in (or My account) on top, then grouped rows with an
 * icon in a tinted circle — find a place, Jewish life, help & safety — the language, currency and
 * theme pickers, and the legal pages.
 */
// `postLabel` is kept for callers; the menu uses the short "Post" label next to "Log in".
export function MobileMenu({ isSignedIn }: { isSignedIn: boolean; postLabel?: string }) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const path = normalizePath(usePathname());

  const jewishRows: Row[] = [
    { id: "home", href: "/jewish-life", label: t("menu.links.jewishLifeHome"), icon: SynagogueIcon, tone: "navy", current: path === "/jewish-life" },
    { id: "times", href: "/jewish-life#shabbat-times", label: t("menu.links.shabbatTimes"), icon: ShabbatCandlesIcon, tone: "coral" },
    { id: "calendar", href: "/jewish-life#calendar", label: t("menu.links.calendar"), icon: CalendarDays, tone: "green" },
    { id: "places", href: "/jewish-life#places", label: t("menu.links.communityMap"), icon: MapPinned, tone: "navy" },
    { id: "emergency", href: "/jewish-life#emergency", label: t("menu.links.emergency"), icon: Phone, tone: "amber" },
  ];
  const helpRows: Row[] = [
    { id: "help", href: "/help", label: t("tabs.help"), icon: LifeBuoy, tone: "navy" },
    { id: "safety", href: "/safety", label: t("safety"), icon: ShieldCheck, tone: "green" },
    { id: "contact", href: "/contact", label: t("contact"), icon: Mail, tone: "navy" },
    { id: "about", href: "/about", label: t("tabs.about"), icon: Info, tone: "neutral" },
    { id: "how", href: "/how-it-works", label: t("menu.links.howItWorks"), icon: Compass, tone: "neutral" },
  ].map((row) => ({ ...row, tone: row.tone as Tone, current: path === row.href }));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className="h-10 gap-2 rounded-full border-border bg-card ps-3 pe-2.5 shadow-xs"
          // The visible language code is part of the name (WCAG 2.5.3 label in name).
          aria-label={`${t("menu.open")} · ${locale.toUpperCase()}`}
        >
          <span aria-hidden className="text-xs font-semibold text-muted-foreground" dir="ltr">
            {locale.toUpperCase()}
          </span>
          <span aria-hidden className="h-4 w-px bg-border" />
          <Menu aria-hidden className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isRtl(locale) ? "left" : "right"}
        showCloseButton={false}
        className="gap-0 p-0 data-[side=left]:w-[min(88vw,24rem)] data-[side=right]:w-[min(88vw,24rem)] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm"
      >
        <SheetHeader className="flex-row items-center justify-between border-b py-3 ps-5 pe-3">
          <SheetTitle className="sr-only">{t("menu.title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("mainNav")}</SheetDescription>
          <LogoLink size="sm" onClick={close} />
          <SheetClose asChild>
            <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label={tc("close")}>
              <X aria-hidden className="size-5" />
            </Button>
          </SheetClose>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          {/* Side by side when both labels fit, stacked otherwise (long Arabic or Russian labels). */}
          <div className="flex flex-wrap gap-2 px-1">
            <Link href="/post" onClick={close} className={buttonStyles({ variant: "accent", size: "md", className: "min-w-fit flex-1 px-4" })}>
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
                <LoginButton className="h-11 flex-1 rounded-full bg-card px-4 text-base font-semibold" />
              </div>
            )}
          </div>

          <nav aria-label={t("mainNav")} className="mt-5 grid gap-5">
            <MenuGroup title={t("menu.groups.search")}>
              <Suspense fallback={<SearchRowsWithoutQuery onNavigate={close} />}>
                <SearchRowsWithQuery onNavigate={close} />
              </Suspense>
            </MenuGroup>

            <MenuGroup title={t("menu.groups.jewish")}>
              <ul className="grid gap-0.5">
                {jewishRows.map((row) => (
                  <MenuRow key={row.id} row={row} onNavigate={close} />
                ))}
              </ul>
            </MenuGroup>

            <MenuGroup title={t("menu.groups.help")}>
              <ul className="grid gap-0.5">
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
                    className="flex min-h-11 items-center rounded-lg px-2 text-small text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {t(`menu.links.${key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </MenuGroup>
        </div>
      </SheetContent>
    </Sheet>
  );
}
