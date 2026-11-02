"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { chipStyles } from "@/components/ds/chip";
import { locales, siteConfig } from "@/config/site";
import { dirFor } from "@/i18n/locale";
import { Link, usePathname } from "@/i18n/navigation";
import { pathWithQuery } from "./nav-items";

// The pill list (side menu) lives apart from the dropdown menu in ./language-switcher.tsx, so the
// side menu, which loads once the page is idle, does not bring the dropdown menu code with it.

export const nativeNames = siteConfig.i18n.nativeNames;

/** The current page (path + query, without the locale) — the target for every language link. */
export function useSamePageHref() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return pathWithQuery(pathname, searchParams);
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
