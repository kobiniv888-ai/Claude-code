/**
 * Visual order for right-to-left text in share images. Satori (next/og) lays every string out
 * left to right in logical order and has no bidi support, so a Hebrew string has to be handed to
 * it already reversed ("בית" → "תיב"). This is a small subset of the Unicode Bidirectional
 * Algorithm (UAX #9) that is enough for titles, taglines and prices: strong RTL/LTR letters,
 * numbers with their separators and currency signs, neutrals resolved from their neighbours, and
 * mirrored brackets. Pure; no Arabic shaping (Satori cannot shape Arabic: callers keep Arabic
 * text out of share images).
 */

type BidiClass = "R" | "L" | "EN" | "CS" | "ET" | "N";

const RTL = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const DIGIT = /[0-9\u0660-\u0669\u06F0-\u06F9]/;
/** Separators that stay inside a number when they sit between two digits: 1,200 · 3.5 · 10:30 · 1/2. */
const NUMBER_SEPARATOR = /[,.:/\u00A0\u202F]/;
/** Signs that belong to the number next to them: currencies, %, #, °, +, −. */
const NUMBER_TERMINATOR = /[\p{Sc}%#°+\-\u2212]/u;
const LETTER = /\p{L}|\p{M}/u;

/** Characters drawn mirrored inside right-to-left text. */
const MIRROR: Record<string, string> = {
  "(": ")",
  ")": "(",
  "[": "]",
  "]": "[",
  "{": "}",
  "}": "{",
  "<": ">",
  ">": "<",
  "«": "»",
  "»": "«",
  "‹": "›",
  "›": "‹",
};

function classify(ch: string): BidiClass {
  if (RTL.test(ch)) return "R";
  if (DIGIT.test(ch)) return "EN";
  if (LETTER.test(ch)) return "L";
  if (NUMBER_SEPARATOR.test(ch)) return "CS";
  if (NUMBER_TERMINATOR.test(ch)) return "ET";
  return "N";
}

/** True when the text's first strong letter is Hebrew or Arabic (the paragraph direction). */
export function isRtlText(text: string): boolean {
  for (const ch of text) {
    if (RTL.test(ch)) return true;
    if (LETTER.test(ch)) return false;
  }
  return false;
}

/** True when the text contains Arabic-script letters (Satori cannot shape them). */
export function hasArabicScript(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u0870-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/** Embedding level of every character of `chars` in a paragraph of base level `base` (0 LTR, 1 RTL). */
function levels(chars: string[], base: 0 | 1): number[] {
  const types = chars.map(classify);
  const n = types.length;

  // W4: a separator between two digits joins the number. W5: signs next to a number join it.
  for (let i = 1; i < n - 1; i++) {
    if (types[i] === "CS" && types[i - 1] === "EN" && types[i + 1] === "EN") types[i] = "EN";
  }
  for (let i = 0; i < n; i++) {
    if (types[i] !== "ET") continue;
    let j = i;
    while (j < n && types[j] === "ET") j++;
    const touchesNumber = (i > 0 && types[i - 1] === "EN") || (j < n && types[j] === "EN");
    for (let k = i; k < j; k++) types[k] = touchesNumber ? "EN" : "N";
    i = j - 1;
  }
  for (let i = 0; i < n; i++) if (types[i] === "CS" || types[i] === "ET") types[i] = "N";

  // W7: a number after Latin text (or at the start of an LTR paragraph) is Latin.
  let lastStrong: "L" | "R" = base === 0 ? "L" : "R";
  for (let i = 0; i < n; i++) {
    if (types[i] === "L" || types[i] === "R") lastStrong = types[i] as "L" | "R";
    else if (types[i] === "EN" && lastStrong === "L") types[i] = "L";
  }

  // N1/N2: neutrals between two runs of the same direction take it (numbers count as RTL);
  // otherwise they take the paragraph direction.
  const dirOf = (t: BidiClass): "L" | "R" | null => (t === "L" ? "L" : t === "R" || t === "EN" ? "R" : null);
  const baseDir = base === 0 ? "L" : "R";
  for (let i = 0; i < n; i++) {
    if (types[i] !== "N") continue;
    let j = i;
    while (j < n && types[j] === "N") j++;
    const before = i > 0 ? dirOf(types[i - 1]) : baseDir;
    const after = j < n ? dirOf(types[j]) : baseDir;
    const resolved = before === after ? before : baseDir;
    for (let k = i; k < j; k++) types[k] = resolved === "L" ? "L" : "R";
    i = j - 1;
  }

  // I1/I2: levels.
  return types.map((t) => {
    if (base === 0) return t === "R" ? 1 : t === "EN" ? 2 : 0;
    return t === "R" ? 1 : 2;
  });
}

/** Reorders one line (no line breaks inside) for display. Base direction from the text unless given. */
export function visualOrder(text: string, rtl: boolean = isRtlText(text)): string {
  const chars = Array.from(text);
  if (chars.length === 0) return text;
  const base = rtl ? 1 : 0;
  const lv = levels(chars, base);
  if (lv.every((l) => l === 0)) return text;
  const out = chars.map((ch, i) => (lv[i] % 2 === 1 ? (MIRROR[ch] ?? ch) : ch));
  const order = chars.map((_, i) => i);
  // L2: from the highest level down to 1 (the lowest odd level), reverse every run at or above it.
  const max = Math.max(...lv);
  for (let level = max; level >= 1; level--) {
    for (let i = 0; i < order.length; i++) {
      if (lv[order[i]] < level) continue;
      let j = i;
      while (j < order.length && lv[order[j]] >= level) j++;
      order.splice(i, j - i, ...order.slice(i, j).reverse());
      i = j - 1;
    }
  }
  return order.map((i) => out[i]).join("");
}

/**
 * Splits a paragraph into the pieces a share image lays out in a wrapping row, each already in
 * visual order. Place them with `flexDirection: rtl ? "row-reverse" : "row"` and `flexWrap: "wrap"`:
 * lines then wrap in reading order. Words of an embedded opposite-direction run stay together,
 * so "דירה ב-Old Tbilisi" keeps "Old Tbilisi" left to right.
 */
export function bidiWords(text: string, rtl: boolean = isRtlText(text)): { rtl: boolean; words: string[] } {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  if (chars.length === 0) return { rtl, words: [] };
  const lv = levels(chars, rtl ? 1 : 0);
  const base = rtl ? 1 : 0;
  const pieces: string[] = [];
  let start = 0;
  for (let i = 0; i <= chars.length; i++) {
    // Break at spaces that sit at the paragraph level (inside an embedded run they stay).
    if (i === chars.length || (chars[i] === " " && lv[i] === base)) {
      if (i > start) pieces.push(visualOrder(chars.slice(start, i).join(""), rtl));
      start = i + 1;
    }
  }
  return { rtl, words: pieces };
}

/** Cuts `text` to at most `max` characters at a word boundary, adding "…" (logical end). */
export function truncateText(text: string, max: number): string {
  const chars = Array.from(text.trim());
  if (chars.length <= max) return text.trim();
  const cut = chars.slice(0, max - 1).join("");
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
