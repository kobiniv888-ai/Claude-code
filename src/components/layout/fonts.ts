import type { CSSProperties } from "react";
import { Noto_Sans, Noto_Sans_Arabic, Noto_Sans_Georgian } from "next/font/google";
import localFont from "next/font/local";

/**
 * Self-hosted Noto fonts (one family per script), combined into one font stack:
 * Noto Sans (Latin, Cyrillic) → Noto Sans Hebrew → Noto Sans Arabic → Noto Sans Georgian.
 * Only the Latin face is preloaded; the Cyrillic, Hebrew, Arabic and Georgian files load on
 * demand through unicode-range, so each page downloads only the scripts it shows.
 *
 * Two small faces go first, for signs that are in every price:
 * - ₾ (lari): of our files only Noto Sans latin-ext (164 KB) and Noto Sans Georgian latin-ext
 *   (13 KB) have it, and the stack reached the big one first. `lariSign` is the 13 KB file
 *   (a copy of Noto Sans Georgian latin-ext, SIL Open Font License) limited to U+20BE.
 * - ₪ (shekel, in every Hebrew price: ILS is the Hebrew default): "Noto Sans" lists U+20AA in
 *   its latin-ext face (168 KB), so the browser fetched that whole file for one sign. The Hebrew
 *   face ("Bayit Hebrew", below) has it and goes first in the stack.
 * - ≈ (converted prices): none of the Noto files has it, so the browser downloaded the Arabic
 *   and Georgian maths faces (~40 KB) and then used a system font anyway. "Bayit Symbols" in
 *   globals.css takes it from a system font straight away (local() only, nothing to download).
 *
 * Hebrew: "Bayit Hebrew" (globals.css → src/app/styles/bayit.css) is the 12 KB "hebrew" subset of
 * Noto Sans Hebrew (variable 100–900, SIL Open Font License) served from public/fonts with a fixed
 * name, so the root layout can preload it on Hebrew pages (next/font preloads a face on every
 * locale or on none). It covers the Hebrew block and ₪ only, so it can sit first in the stack:
 * Latin text still reaches Noto Sans. It replaces next/font's Noto_Sans_Hebrew plus a second copy
 * of the same file for ₪ (the browser downloaded the 12 KB twice under two names).
 *
 * The stack uses each font's own family name only. next/font also defines a metric-adjusted
 * "<name> Fallback" face built on the local Arial — Arial has Hebrew and Arabic letters, so in
 * the middle of the stack it would win over the Noto Hebrew/Arabic faces that follow it.
 */

const notoSans = Noto_Sans({
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
});

const notoSansArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

const notoSansGeorgian = Noto_Sans_Georgian({
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

const fonts = [lariSign, notoSans, notoSansArabic, notoSansGeorgian];

/** Defined in src/app/styles/bayit.css: ≈ from a local system font; Hebrew and ₪ from public/fonts. */
const SYMBOLS_FAMILY = '"Bayit Symbols"';
const HEBREW_FAMILY = '"Bayit Hebrew"';

/** The Hebrew face's file (see above). Versioned name: change it when the file changes (cached a year). */
export const HEBREW_FONT_URL = "/fonts/noto-sans-hebrew-v1.woff2";

/** "<lari>, 'Bayit Hebrew', 'Bayit Symbols', 'Noto Sans', 'Noto Sans Arabic', …, system-ui, sans-serif" (hashed names in production). */
export const fontFamilyStack = [
  ...fonts.slice(0, 1).map((font) => font.style.fontFamily.split(",")[0].trim()),
  HEBREW_FAMILY,
  SYMBOLS_FAMILY,
  ...fonts.slice(1).map((font) => font.style.fontFamily.split(",")[0].trim()),
  "ui-sans-serif",
  "system-ui",
  "sans-serif",
].join(", ");

/** Put on <html>: defines --font-site, which globals.css uses for font-sans. */
export const fontStyle = { "--font-site": fontFamilyStack } as CSSProperties;
