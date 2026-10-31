import type { CSSProperties } from "react";
import { Noto_Sans, Noto_Sans_Arabic, Noto_Sans_Georgian, Noto_Sans_Hebrew } from "next/font/google";

/**
 * Self-hosted Noto fonts (one family per script), combined into one font stack:
 * Noto Sans (Latin, Cyrillic) → Noto Sans Hebrew → Noto Sans Arabic → Noto Sans Georgian.
 * Only the Latin face is preloaded; the Cyrillic, Hebrew, Arabic and Georgian files load on
 * demand through unicode-range, so each page downloads only the scripts it shows.
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

const fonts = [notoSans, notoSansHebrew, notoSansArabic, notoSansGeorgian];

/** "'Noto Sans', 'Noto Sans Hebrew', …, system-ui, sans-serif" (hashed family names in production). */
export const fontFamilyStack = [
  ...fonts.map((font) => font.style.fontFamily.split(",")[0].trim()),
  "ui-sans-serif",
  "system-ui",
  "sans-serif",
].join(", ");

/** Put on <html>: defines --font-site, which globals.css uses for font-sans. */
export const fontStyle = { "--font-site": fontFamilyStack } as CSSProperties;
