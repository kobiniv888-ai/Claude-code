import type { CSSProperties } from "react";
import { Noto_Sans, Noto_Sans_Arabic, Noto_Sans_Georgian, Noto_Sans_Hebrew } from "next/font/google";
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
 * - ≈ (converted prices): none of the Noto files has it, so the browser downloaded the Arabic
 *   and Georgian maths faces (~40 KB) and then used a system font anyway. "Bayit Symbols" in
 *   globals.css takes it from a system font straight away (local() only, nothing to download).
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

const notoSansHebrew = Noto_Sans_Hebrew({
  subsets: ["hebrew"],
  display: "swap",
  preload: false,
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

const fonts = [lariSign, notoSans, notoSansHebrew, notoSansArabic, notoSansGeorgian];

/** Defined in globals.css (≈ from a local system font). */
const SYMBOLS_FAMILY = '"Bayit Symbols"';

/** "<lari>, 'Bayit Symbols', 'Noto Sans', 'Noto Sans Hebrew', …, system-ui, sans-serif" (hashed names in production). */
export const fontFamilyStack = [
  fonts[0].style.fontFamily.split(",")[0].trim(),
  SYMBOLS_FAMILY,
  ...fonts.slice(1).map((font) => font.style.fontFamily.split(",")[0].trim()),
  "ui-sans-serif",
  "system-ui",
  "sans-serif",
].join(", ");

/** Put on <html>: defines --font-site, which globals.css uses for font-sans. */
export const fontStyle = { "--font-site": fontFamilyStack } as CSSProperties;
