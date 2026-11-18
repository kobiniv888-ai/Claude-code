import type { CSSProperties } from "react";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { cn } from "@/lib/utils";

/**
 * The ב mark and the plain logo lockup, without next-intl or links: safe in any component,
 * including the root error and 404 pages that render outside the language layout.
 * The linked header logo is `Logo` in ./logo.tsx.
 */

/** Path of the mark, in the coordinates of public/brand/bayit-mark.svg. */
export const BAYIT_MARK_PATH = "M150 238 L256 142 L362 238 L362 380 M150 380 L414 380";
/** The mark's tight box (x y width height), as in public/brand/bayit-mark.svg. */
export const BAYIT_MARK_VIEWBOX = "126 109 294 304";
/** Width ÷ height of the mark's box. */
export const BAYIT_MARK_ASPECT = 294 / 304;

/** The mark alone, drawn in currentColor. Decorative unless you pass a `title`. */
export function BayitMark({ className, style, title }: { className?: string; style?: CSSProperties; title?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={BAYIT_MARK_VIEWBOX}
      className={cn("shrink-0", className)}
      style={style}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path d={BAYIT_MARK_PATH} fill="none" stroke="currentColor" strokeWidth={54} strokeLinejoin="round" strokeLinecap="butt" />
    </svg>
  );
}

/** The brand name as written in `locale` ("בית" in Hebrew, "Bayit" elsewhere). */
export function brandName(locale: string): string {
  return isAppLocale(locale) ? siteConfig.localizedName[locale] : siteConfig.name;
}

export type LogoColor = "purple" | "white";

/** #4B2A8C on white or lavender and white in dark mode (never purple on a dark background); or white. */
export const LOGO_COLOR_CLASS: Record<LogoColor, string> = {
  purple: "text-primary dark:text-white",
  white: "text-white",
};

/** Mark + name, sized from the font size: mark 1.4em tall, gap 0.25em (BRIEF 3.1). */
export function LogoParts({ locale, showName = true }: { locale: string; showName?: boolean }) {
  return (
    <>
      <BayitMark style={{ height: "1.4em", width: `${1.4 * BAYIT_MARK_ASPECT}em` }} />
      {showName ? (
        <span
          // Rubik 600; Latin −0.01em, Hebrew none. translate="no": it is a name, not a word to translate.
          className={cn("font-semibold leading-none", locale === "he" ? "tracking-normal" : "tracking-[-0.01em]")}
          translate="no"
        >
          {brandName(locale)}
        </span>
      ) : null}
    </>
  );
}

export const LOGO_BASE_CLASS = "inline-flex shrink-0 select-none items-center gap-[0.25em] font-sans";

/** The logo as an image (not a link), for pages outside the language layout. `size` = font size in px. */
export function BrandLockup({
  locale,
  size = 22,
  color = "purple",
  className,
}: {
  locale: string;
  size?: number;
  color?: LogoColor;
  className?: string;
}) {
  return (
    <span
      data-logo=""
      role="img"
      aria-label={brandName(locale)}
      className={cn(LOGO_BASE_CLASS, LOGO_COLOR_CLASS[color], className)}
      style={{ fontSize: `${size}px` }}
    >
      <LogoParts locale={locale} />
    </span>
  );
}
