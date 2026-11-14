import type { CSSProperties } from "react";
import { Noto_Sans_Georgian, Rubik } from "next/font/google";
import localFont from "next/font/local";
import type { AppLocale } from "@/config/site";

/**
 * Round 2 type: Rubik (400/500/600) for every script, Noto Sans Georgian (400/500/600) for
 * Georgian, which Rubik does not cover. One font stack:
 *
 *   lari sign → Bayit Hebrew → Bayit Cyrillic → Bayit Arabic → Bayit Symbols → Rubik → Noto Sans Georgian → system
 *
 * - Rubik (next/font/google) is variable (300–900), so the three weights are one file per script.
 *   next/font's `subsets` only chooses what it preloads; its CSS still lists every Rubik subset
 *   (latin-ext, cyrillic-ext… for rare letters). Latin is preloaded on every page: digits, prices
 *   and the name "Bayit" are in every language.
 * - Hebrew, Cyrillic and Arabic: "Bayit Hebrew/Cyrillic/Arabic" (src/app/styles/bayit.css) are
 *   the same Rubik subsets served from public/fonts under fixed names, so the root layout preloads
 *   the one the page's language needs (`scriptFontUrl`). They come first in the stack, so next/font's
 *   copies of those subsets are never fetched. Sizes: Latin 35 KB, Hebrew 9 KB, Cyrillic 15 KB,
 *   Arabic 32 KB; Noto Sans Georgian 41 KB (loads on Georgian text only).
 * - ₾ (lari): Rubik has no ₾, and Rubik's latin-ext face (19 KB) lists it in its range anyway.
 *   `lariSign` is a 13 KB copy of Noto Sans Georgian latin-ext (SIL Open Font License) limited to
 *   U+20BE, first in the stack.
 * - ₪ (shekel): in "Bayit Hebrew" (Rubik lists it in latin-ext too, a 19 KB detour).
 * - ≈ (converted prices): no Rubik subset lists it; "Bayit Symbols" takes it from a system font.
 * - U+2011 (non-breaking hyphen) is only in the range of Rubik's Arabic face (32 KB): do not use it.
 *
 * The stack uses each font's own family name only. next/font also defines a metric-adjusted
 * "<name> Fallback" face built on the local Arial — Arial has Hebrew and Arabic letters, so in
 * the middle of the stack it would win over the faces that follow it.
 */

const rubik = Rubik({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
});

const notoSansGeorgian = Noto_Sans_Georgian({
  weight: ["400", "500", "600"],
  subsets: ["georgian"],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

const lariSign = localFont({
  src: "./font-files/noto-sans-georgian-latin-ext.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+20BE" }],
});

const familyName = (font: { style: { fontFamily: string } }) => font.style.fontFamily.split(",")[0].trim();

/** Defined in src/app/styles/bayit.css: Hebrew, Cyrillic and Arabic from public/fonts; ≈ from a local system font. */
const SCRIPT_FAMILIES = ['"Bayit Hebrew"', '"Bayit Cyrillic"', '"Bayit Arabic"', '"Bayit Symbols"'];

/**
 * The script face a language needs for its first paint (src/app/styles/bayit.css). Versioned names:
 * change the version when a file changes (cached for a year, next.config.ts).
 */
const SCRIPT_FONT_URLS: Partial<Record<AppLocale, string>> = {
  he: "/fonts/rubik-hebrew-v1.woff2",
  ru: "/fonts/rubik-cyrillic-v1.woff2",
  ar: "/fonts/rubik-arabic-v1.woff2",
};

/** The public/fonts file to preload for `locale` (none for English and Georgian). */
export function scriptFontUrl(locale: string): string | undefined {
  return SCRIPT_FONT_URLS[locale as AppLocale];
}

/** "<lari>, 'Bayit Hebrew', …, 'Rubik', 'Noto Sans Georgian', system-ui, sans-serif" (hashed names in production). */
export const fontFamilyStack = [
  familyName(lariSign),
  ...SCRIPT_FAMILIES,
  familyName(rubik),
  familyName(notoSansGeorgian),
  "ui-sans-serif",
  "system-ui",
  "sans-serif",
].join(", ");

/** Put on <html>: defines --font-site, which src/app/styles/bayit.css uses for font-sans. */
export const fontStyle = { "--font-site": fontFamilyStack } as CSSProperties;
