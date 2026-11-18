/**
 * Emoji out of listing titles (brief round 3, section 2.4: "remove them from titles when saving,
 * including in existing listings. Emojis in descriptions are fine"). Pure and client-safe.
 *
 *   stripTitleEmoji("<beach umbrella> ORBI CITY – ზღვის პირველი ზოლი <pin> ზღვიდან რამდენიმე ნაბიჯში")
 *   // → "ORBI CITY – ზღვის პირველი ზოლი ზღვიდან რამდენიმე ნაბიჯში"   (the real title: emoji.test.ts)
 *
 * Removes pictographs (Unicode Extended_Pictographic) with their variation selectors, skin tones and
 * ZWJ sequences (a family emoji), flags (regional-indicator pairs, tag sequences) and keycaps (a digit,
 * # or * + U+20E3), then tidies the spaces and separators left over ("<fire> - Sea view" → "Sea
 * view"). Letters in every script, digits and ordinary punctuation are never touched; ©, ® and ™
 * written as text stay. A title without emoji comes back exactly as it was.
 *
 * The listing engineer calls it on save (the wizard's title); the clean-up of existing titles uses it
 * too, and its dry run counts with hasTitleEmoji().
 */

/** One emoji: a pictograph (+ variation selector / skin tone). ©, ® and ™ only with U+FE0F after them. */
const PICTOGRAPH = String.raw`(?:(?![\u{A9}\u{AE}\u{2122}](?!\u{FE0F}))\p{Extended_Pictographic})(?:\u{FE0F}|\u{FE0E})?[\u{1F3FB}-\u{1F3FF}]?`;
/** A ZWJ sequence of pictographs, with tag characters (subdivision flags) after it. */
const EMOJI_SEQUENCE = new RegExp(String.raw`${PICTOGRAPH}(?:\u{200D}${PICTOGRAPH})*[\u{E0020}-\u{E007F}]*`, "gu");
/** Keycaps: a digit, # or * followed by U+20E3 (with or without U+FE0F between). */
const KEYCAP = /[0-9#*]\u{FE0F}?\u{20E3}/gu;
/** Flags: pairs of regional indicators (and a lone one). */
const FLAG = /[\u{1F1E6}-\u{1F1FF}]{1,2}/gu;
/** Leftovers: variation selectors, keycap marks, skin tones and tag characters on their own. */
const STRAY = /[\u{FE0E}\u{FE0F}\u{20E3}]|[\u{1F3FB}-\u{1F3FF}]|[\u{E0020}-\u{E007F}]+/gu;
/** A zero-width joiner left next to a gap (one inside a word is part of its script and stays). */
const STRAY_ZWJ = /\u{200D}(?=\s|$)|(?:^|(?<=\s))\u{200D}/gu;

/** Separators that can be left hanging once an emoji next to them is gone. */
const SEP = "[-–—|·•,:;/]";
const LEADING_SEPARATORS = new RegExp(String.raw`^(?:${SEP}\s*)+`, "u");
const TRAILING_SEPARATORS = new RegExp(String.raw`(?:\s*${SEP})+$`, "u");
/** "Sea view - - Batumi" (an emoji was between the dashes) → "Sea view - Batumi". */
const DOUBLE_SEPARATOR = new RegExp(String.raw`(${SEP})(?:\s+${SEP})+(?=\s)`, "gu");

function removeEmoji(text: string): string {
  return text
    .replace(KEYCAP, " ")
    .replace(FLAG, " ")
    .replace(EMOJI_SEQUENCE, " ")
    .replace(STRAY, "")
    .replace(STRAY_ZWJ, "");
}

/** True when the text has an emoji that stripTitleEmoji() would remove. */
export function hasTitleEmoji(text: string | null | undefined): boolean {
  if (!text) return false;
  return removeEmoji(text) !== text;
}

/** The title without emoji, tidied; the same string when it had none. */
export function stripTitleEmoji(text: string): string {
  if (!text) return text;
  const removed = removeEmoji(text);
  if (removed === text) return text;
  return removed
    .replace(/\s+/gu, " ")
    .replace(DOUBLE_SEPARATOR, "$1")
    .trim()
    .replace(LEADING_SEPARATORS, "")
    .replace(TRAILING_SEPARATORS, "")
    .trim();
}
