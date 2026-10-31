"use client";

import { Suspense, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Heart, Mail, Menu, Plus, ShieldCheck, UserRound, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { LoginButton } from "@/components/auth/login-dialog";
import { LogoLink } from "@/components/common/logo";
import { ChevronEnd } from "@/components/common/directional-icon";
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
import { activeNavKey, NAV_ITEMS, type NavKey } from "./nav-items";
import { ThemeSegmented } from "./theme-toggle";

function NavList({ active, onNavigate }: { active: NavKey | null; onNavigate: () => void }) {
  const t = useTranslations("nav");
  return (
    <nav aria-label={t("mainNav")}>
      <ul className="grid gap-0.5">
        {NAV_ITEMS.map(({ key, href, icon: Icon }) => {
          const current = key === active;
          return (
            <li key={key}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  current && "bg-secondary text-primary hover:bg-secondary",
                )}
              >
                <Icon aria-hidden className={cn("size-5", current ? "text-primary" : "text-muted-foreground")} />
                <span className="flex-1">{t(`tabs.${key}`)}</span>
                <ChevronEnd aria-hidden className="size-4 text-muted-foreground/60" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NavListWithQuery(props: { onNavigate: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return <NavList active={activeNavKey(pathname, searchParams)} {...props} />;
}

function NavListWithoutQuery(props: { onNavigate: () => void }) {
  return <NavList active={activeNavKey(usePathname())} {...props} />;
}

function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <h3 className="px-1 text-xs font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** Phone header: a menu sheet with every tab, the switchers and account shortcuts. */
export function MobileMenu({ isSignedIn, postLabel }: { isSignedIn: boolean; postLabel: string }) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

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
        className="w-[min(88vw,24rem)] gap-0 p-0 data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm"
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

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          <div className="grid gap-2">
            <Button
              asChild
              className="h-12 rounded-xl bg-terracotta text-base font-semibold text-terracotta-foreground hover:bg-terracotta/90"
            >
              <Link href="/post" onClick={close}>
                <Plus aria-hidden className="size-5" strokeWidth={2.5} />
                {postLabel}
              </Link>
            </Button>
            {isSignedIn ? (
              <Button asChild variant="outline" className="h-12 rounded-xl bg-card text-base">
                <Link href="/account" onClick={close}>
                  <UserRound aria-hidden className="size-5" />
                  {t("menu.account")}
                </Link>
              </Button>
            ) : (
              <div onClickCapture={close}>
                <LoginButton className="h-12 w-full rounded-xl bg-card text-base" />
              </div>
            )}
          </div>

          <div className="mt-5">
            <Suspense fallback={<NavListWithoutQuery onNavigate={close} />}>
              <NavListWithQuery onNavigate={close} />
            </Suspense>
          </div>

          <div className="mt-6 grid gap-6 border-t pt-5">
            <MenuSection title={t("language.label")}>
              <LanguageList onNavigate={close} />
            </MenuSection>
            <MenuSection title={t("currency.label")}>
              <CurrencyChips />
            </MenuSection>
            <MenuSection title={t("theme.label")}>
              <ThemeSegmented />
            </MenuSection>
          </div>

          <ul className="mt-6 grid gap-0.5 border-t pt-4 text-sm">
            {[
              { href: "/account/favorites", label: t("saved"), icon: Heart },
              { href: "/safety", label: t("safety"), icon: ShieldCheck },
              { href: "/contact", label: t("contact"), icon: Mail },
            ].map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={close}
                  className="flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium text-foreground/85 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Icon aria-hidden className="size-[18px] text-muted-foreground" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
