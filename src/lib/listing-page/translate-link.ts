/**
 * "Translate" for a listing that has no translation in the visitor's language (round 3 brief
 * 2.4): Google Translate in a new tab with the title and description (pure, client-safe).
 *
 *   https://translate.google.com/?sl=ka&tl=iw&text=…&op=translate
 *
 * Google Translate takes at most 5,000 characters, and very long addresses are refused, so the
 * text is cut (at a sentence or line end when there is one) to keep the encoded text under
 * MAX_ENCODED_TEXT; Georgian and Hebrew letters take 6–9 characters each once encoded. Without any
 * text that fits, it opens the listing page itself in Google Translate.
 */

/** Google Translate still uses "iw" for Hebrew. */
function googleLanguage(locale: string): string {
  return locale === "he" ? "iw" : locale;
}

export const MAX_TEXT_CHARS = 5000;
export const MAX_ENCODED_TEXT = 6000;

/** The longest start of `text` whose encoded form fits, ending at a sentence or line end if possible. */
export function cutForUrl(text: string, maxEncoded = MAX_ENCODED_TEXT, maxChars = MAX_TEXT_CHARS): string {
  const clean = text.trim();
  if (clean.length <= maxChars && encodeURIComponent(clean).length <= maxEncoded) return clean;
  // Binary search the longest prefix (by code points) that fits.
  const chars = Array.from(clean);
  let low = 0;
  let high = Math.min(chars.length, maxChars);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (encodeURIComponent(chars.slice(0, mid).join("")).length <= maxEncoded) low = mid;
    else high = mid - 1;
  }
  const prefix = chars.slice(0, low).join("");
  const end = Math.max(prefix.lastIndexOf("\n"), ...[". ", "! ", "? ", "。"].map((mark) => prefix.lastIndexOf(mark) + 1));
  return (end > prefix.length * 0.5 ? prefix.slice(0, end) : prefix).trim();
}

export function googleTranslateUrl(input: { title: string; description: string; from: string; to: string; pageUrl?: string | null }): string {
  const sl = googleLanguage(input.from);
  const tl = googleLanguage(input.to);
  const text = cutForUrl([input.title.trim(), input.description.trim()].filter(Boolean).join("\n\n"));
  if (text) {
    const params = new URLSearchParams({ sl, tl, text, op: "translate" });
    return `https://translate.google.com/?${params}`;
  }
  if (input.pageUrl) return `https://translate.google.com/translate?${new URLSearchParams({ sl, tl, u: input.pageUrl })}`;
  return `https://translate.google.com/?${new URLSearchParams({ sl, tl, op: "translate" })}`;
}
