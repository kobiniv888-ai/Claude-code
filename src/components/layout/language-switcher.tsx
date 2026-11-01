"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { chipStyles } from "@/components/ds/chip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { locales, siteConfig, type AppLocale } from "@/config/site";
import { dirFor } from "@/i18n/locale";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { pathWithQuery } from "./nav-items";

/**
 * Language menu with the native names (never flags). Each item links to the same page and
 * query in that language; next-intl remembers the choice in the NEXT_LOCALE cookie.
 */

const nativeNames = siteConfig.i18n.nativeNames;

/** The current page (path + query, without the locale) — the target for every language link. */
function useSamePageHref() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return pathWithQuery(pathname, searchParams);
}

type Props = { variant?: "header" | "footer"; align?: "start" | "end"; className?: string };

function LanguageMenu({ href, variant = "header", align = "end", className }: Props & { href: string }) {
  const t = useTranslations("nav.language");
  const locale = useLocale() as AppLocale;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant === "footer" ? "outline" : "ghost"}
          className={cn(
            "h-10 gap-2 rounded-full px-3 text-sm font-medium",
            variant === "footer" && "bg-card px-4",
            className,
          )}
          aria-label={t("change", { current: nativeNames[locale] })}
        >
          <Globe aria-hidden className="size-[18px]" />
          <span lang={locale}>{nativeNames[locale]}</span>
          <ChevronDown aria-hidden className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} sideOffset={8} className="w-52 rounded-xl p-1.5">
        <DropdownMenuLabel className="px-2 text-xs font-medium text-muted-foreground">{t("label")}</DropdownMenuLabel>
        {locales.map((l) => {
          const current = l === locale;
          return (
            <DropdownMenuItem key={l} asChild className="gap-2 px-2 py-2.5">
              <Link
                href={href}
                locale={l}
                lang={l}
                hrefLang={l}
                dir={dirFor(l)}
                aria-current={current ? "true" : undefined}
                className={cn("justify-between", current && "font-semibold text-primary")}
              >
                <span>{nativeNames[l]}</span>
                {current ? <Check aria-hidden className="size-4" /> : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LanguageMenuWithQuery(props: Props) {
  return <LanguageMenu {...props} href={useSamePageHref()} />;
}

function LanguageMenuWithoutQuery(props: Props) {
  return <LanguageMenu {...props} href={usePathname()} />;
}

export function LanguageSwitcher(props: Props) {
  return (
    <Suspense fallback={<LanguageMenuWithoutQuery {...props} />}>
      <LanguageMenuWithQuery {...props} />
    </Suspense>
  );
}

/** The five languages as a row of pill links (side menu). */
function LanguageListInner({ href, onNavigate }: { href: string; onNavigate?: () => void }) {
  const t = useTranslations("nav.language");
  const locale = useLocale();
  return (
    <ul aria-label={t("label")} className="flex flex-wrap gap-2">
      {locales.map((l) => {
        const current = l === locale;
        return (
          <li key={l}>
            <Link
              href={href}
              locale={l}
              lang={l}
              hrefLang={l}
              dir={dirFor(l)}
              onClick={onNavigate}
              aria-current={current ? "true" : undefined}
              className={chipStyles({ size: "sm", active: current })}
            >
              {current ? <Check aria-hidden className="size-4 shrink-0" /> : null}
              {nativeNames[l]}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function LanguageListWithQuery(props: { onNavigate?: () => void }) {
  return <LanguageListInner {...props} href={useSamePageHref()} />;
}

function LanguageListWithoutQuery(props: { onNavigate?: () => void }) {
  return <LanguageListInner {...props} href={usePathname()} />;
}

export function LanguageList(props: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={<LanguageListWithoutQuery {...props} />}>
      <LanguageListWithQuery {...props} />
    </Suspense>
  );
}
