/**
 * Text checks for the host's mistake check (round 3, brief 6.1). Pure and client-safe.
 *
 *  - findStayTimes(description): the check-in and check-out times a description mentions, in
 *    everyday wording in all five languages ("בשעה 1 בצהריים", "10 בבוקר", "check-in at 1pm",
 *    "заезд с 14:00", "تسجيل الوصول الساعة 2 ظهرًا", "შესვლა 14:00-დან").
 *  - findCurrencyMentions(text): prices written with a currency ("200 שקל", "$50", "50 лари").
 *  - dominantScript(text): which alphabet a title is written in (Hebrew, Arabic, Cyrillic,
 *    Georgian or Latin), as the locale that uses it.
 *
 * Everything here is tuned to warn only when the text is clear: a time counts only next to a
 * check-in / check-out word, a bare number counts as an hour only with a marker ("pm", "בבוקר",
 * "утра", "مساءً", "საღამოს", "o'clock", "בשעה"…) or a preposition and nothing that reads like a
 * count after it ("с 2 детьми" is not a time), "late check-out" and "early check-in" are skipped,
 * and an hour written without am/pm ("check-in at 2", "10:00") matches both 2:00 and 14:00.
 */
import type { AppLocale } from "@/config/site";

// ─── Normalization ────────────────────────────────────────────

/** Soft hyphen, zero-width characters, bidi marks/isolates and BOM. */
const INVISIBLE = /[­​-‏‪-‮⁠-⁩﻿]/g;

/**
 * NFKC (full-width digits and letters), Arabic-Indic digits → 0-9, one kind of apostrophe
 * (׳ ’ ` → '), quote (״ “ ” → ") and dash (– — ־ → -).
 */
export function normalizeListingText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[׳‘’‛`´ʼ]/g, "'")
    .replace(/[״“”„‟]/g, '"')
    .replace(/[‐-―−־]/g, "-");
}

const L = "\\p{L}";
/** Not preceded by a letter (a word start in any script). */
const START = `(?<![${L}\\p{N}_])`;
/** Not followed by a letter. */
const END = `(?![${L}\\p{N}_])`;

// ─── Check-in / check-out words ───────────────────────────────

export type StayTimeKind = "checkIn" | "checkOut";

/** Hebrew one-letter prefixes (ו ה ב ל מ ש), Arabic ones (و ف ب ل). */
const HE_PREFIX = "[והבלמש]{0,3}";
const AR_PREFIX = "[وفبل]?";

const CHECK_IN_WORDS = [
  // English (also inside texts in other languages)
  `check(?:ing)?[ -]?in${END}`,
  `arrival${END}`,
  // Hebrew
  `${HE_PREFIX}צ'?ק[ -]?אי(?:ן|נ)${END}`,
  `${HE_PREFIX}כניסה${END}`,
  `${HE_PREFIX}הגעה${END}`,
  // Russian
  `заезд[${L}]*`,
  `заселени[${L}]*`,
  `въезд[${L}]*`,
  `прибыти[${L}]*`,
  `чек[ -]?ин${END}`,
  // Arabic
  `${AR_PREFIX}تسجيل\\s+(?:ال)?(?:وصول|دخول)`,
  `${AR_PREFIX}(?:ال)?وصول${END}`,
  `${AR_PREFIX}(?:ال)?دخول${END}`,
  `تشيك\\s?إن${END}`,
  // Georgian
  `ჩე[კქ][ -]?ინ[${L}]*`,
  `შესვლ[${L}]*`,
  `განთავსებ[${L}]*`,
];

const CHECK_OUT_WORDS = [
  `check(?:ing)?[ -]?out${END}`,
  `departure${END}`,
  `${HE_PREFIX}צ'?ק[ -]?א{1,2}ו{1,2}ט${END}`,
  `${HE_PREFIX}יציאה${END}`,
  `${HE_PREFIX}עזיבה${END}`,
  `${HE_PREFIX}פינוי${END}`,
  `выезд[${L}]*`,
  `выселени[${L}]*`,
  `отъезд[${L}]*`,
  `чек[ -]?аут${END}`,
  `${AR_PREFIX}تسجيل\\s+(?:ال)?(?:مغادرة|خروج)`,
  `${AR_PREFIX}(?:ال)?مغادرة${END}`,
  `${AR_PREFIX}(?:ال)?خروج${END}`,
  `تشيك\\s?أوت${END}`,
  `ჩე[კქ][ -]?აუთ[${L}]*`,
  `გასვლ[${L}]*`,
  `დატოვებ[${L}]*`,
  `გამგზავრებ[${L}]*`,
];

const KEYWORDS = new RegExp(
  `${START}(?:(?<in>${CHECK_IN_WORDS.join("|")})|(?<out>${CHECK_OUT_WORDS.join("|")}))`,
  "giu",
);
const KEYWORD_AT_START = new RegExp(`^\\s*${START}(?:${CHECK_IN_WORDS.join("|")}|${CHECK_OUT_WORDS.join("|")})`, "iu");

/** "late check-out", "צ'ק אאוט מאוחר", "поздний выезд", "المغادرة المتأخرة", "გვიანი გასვლა". */
const LATE_EARLY = `(?:late|early|מאוחר[${L}]*|מוקדם[${L}]*|поздн[${L}]*|ранн[${L}]*|(?:ال)?متأخر[${L}]*|(?:ال)?مبكر[${L}]*|გვიან[${L}]*|ადრე[${L}]*)`;
const LATE_BEFORE = new RegExp(`${START}${LATE_EARLY}[\\s-]*$`, "iu");
/**
 * Shabbat words: a check-out "after 20:15 on Saturday night" (or after Havdalah) is the Shabbat
 * arrangement, not the usual time, so a sentence with one of these words is not compared.
 */
const SHABBAT = new RegExp(
  `${START}(?:${HE_PREFIX}(?:שבת|הבדלה|מוצ"ש|מוצאי)|shabb?[ao]s|shabbat|sabbath|havdal+ah|motzei|шаб+ат[${L}]*|суббот[${L}]*|${AR_PREFIX}(?:ال)?سبت|შაბათ[${L}]*)`,
  "iu",
);
const LATE_AFTER = new RegExp(`^[\\s-]*${LATE_EARLY}`, "iu");

// ─── Times ────────────────────────────────────────────────────

/** How a marker word changes an hour of 1–12. */
type Marker = "am" | "pm" | "evening" | "night";

/** Markers after the number ("2 pm", "10 בבוקר", "2 часа дня", "8 مساءً"). */
const MARKERS_AFTER: { marker: Marker; pattern: string }[] = [
  { marker: "am", pattern: `a\\.?\\s?m\\.?${END}` },
  { marker: "pm", pattern: `p\\.?\\s?m\\.?${END}` },
  { marker: "am", pattern: `(?:ב|לפנות\\s)בוקר${END}|לפנה"צ` },
  { marker: "pm", pattern: `(?:ב|אחר(?:י)?\\s+ה)צהר(?:י)?ים${END}|אחה"צ` },
  { marker: "evening", pattern: `בערב${END}` },
  { marker: "night", pattern: `בלילה${END}` },
  { marker: "am", pattern: `утра${END}` },
  { marker: "pm", pattern: `дня${END}` },
  { marker: "evening", pattern: `вечера${END}` },
  { marker: "night", pattern: `ночи${END}` },
  { marker: "am", pattern: `صباح(?:ا|ًا|اً)?${END}|ص${END}` },
  { marker: "pm", pattern: `(?:بعد\\s+)?الظهر${END}|ظهر(?:ا|ًا|اً)${END}|ظهرا${END}` },
  { marker: "evening", pattern: `مساء(?:ً|اً|ا|ًا)?${END}|م${END}` },
  { marker: "night", pattern: `ليل(?:ا|اً|ًا)${END}` },
];

/** Georgian markers come before the number ("დილის 10 საათზე", "საღამოს 8-ზე"). */
const MARKERS_BEFORE: { marker: Marker; pattern: string }[] = [
  { marker: "am", pattern: "დილის" },
  { marker: "pm", pattern: "(?:შუადღის|ნაშუადღევს)" },
  { marker: "evening", pattern: "საღამოს" },
  { marker: "night", pattern: "ღამის" },
];

/** "o'clock" words after the number. */
const OCLOCK_AFTER = `(?:o'?\\s?clock|час(?:а|ов)?|საათ[${L}]*|-?(?:დან|მდე|ზე)${END})`;

/** Words before a bare number that say "at hour" (enough on their own). */
const HOUR_WORDS_BEFORE = `(?:${HE_PREFIX}שעה|הש(?:ע)ה|الساعة|ساعة)`;

/** Prepositions before a bare number ("after 2", "с 14", "מ-14", "من 2"). */
const PREPOSITIONS_BEFORE = `(?:at|from|after|by|until|till|before|starting|с|со|до|после|в|во|от|עד|אחרי|לפני|החל\\s+מ|מ|ב|من|حتى|بعد|قبل|عند)`;

/** What may follow a bare number after a preposition: an end, punctuation, "to", "and", or a check-in/out word. */
const BARE_FOLLOW = new RegExp(
  `^(?:\\s*$|\\s*[,.;:!?)\\]/|-]|\\s+(?:until|till|to|and|or|до|по|и|или|ו?עד|או|حتى|إلى|و|أو|და|ან)${END})`,
  "iu",
);

/** A number right next to a currency is a price, not a time ("10.50 ₾", "$10"). */
const CURRENCY_NEAR = /^\s?(?:[₾$€₪£₽]|(?:gel|usd|eur|ils|nis|лари|دولار|شيكل|דולר|שקל|ש"ח)(?![\p{L}])|ლარ)/iu;
const CURRENCY_BEFORE_NEAR = /[₾$€₪£₽]\s?$/u;

/** "noon", "בצהריים" alone, "полдень", "الظهر" alone, "შუადღე". */
const NOON = new RegExp(`${START}(?:noon|midday|(?:ב)?צהר(?:י)?ים|полдень|(?:ال)?ظهيرة|შუადღე[${L}]*)${END}`, "iu");
/** "after noon" is any time after 12:00, not 12:00 ("заезд после полудня", "بعد الظهيرة"). */
const AFTER_WORD_BEFORE = new RegExp(`${START}(?:after|אחרי|אחר|после|بعد|შემდეგ)\\s*$`, "iu");
const MIDNIGHT = new RegExp(`${START}(?:midnight|(?:ב)?חצות|полночь|منتصف\\s+الليل|შუაღამე[${L}]*)${END}`, "iu");

const markerAfterRegex = new RegExp(`^\\s?(?:${MARKERS_AFTER.map((m, i) => `(?<m${i}>${m.pattern})`).join("|")})`, "iu");
const markerBeforeRegex = new RegExp(`(?:${MARKERS_BEFORE.map((m, i) => `(?<b${i}>${m.pattern})`).join("|")})\\s*$`, "iu");
const oclockAfterRegex = new RegExp(`^\\s?${OCLOCK_AFTER}`, "iu");
const hourWordBeforeRegex = new RegExp(`${START}${HOUR_WORDS_BEFORE}\\s*-?\\s*$`, "iu");
const prepositionBeforeRegex = new RegExp(`${START}${PREPOSITIONS_BEFORE}\\s*-?\\s*$`, "iu");

/**
 * "3-4pm", "3 and 6 pm" (after "between"), "3 to 6 pm" (after "from"), "3 ל-6 אחה"צ", "с 3 до 6
 * вечера", "3 إلى 6 مساءً": a range of two bare hours with ONE marker at its end, which applies to
 * both. Read as one mention that accepts either bound.
 */
const RANGE_SEPARATOR = `\\s*(?:-|to|till|until|and|ו?עד|ו-?|ל-?|до|по|и|إلى|الى|حتى|و)\\s*`;
const HOUR_RANGE = new RegExp(`(?<![\\d.:,+])(\\d{1,2})${RANGE_SEPARATOR}(\\d{1,2})(?![\\d]|[.:,]\\d)`, "giu");

/** "13:00", "13.00", "9:30" (not a date such as 14.11.2026, not a price such as 1.500). */
const CLOCK = /(?<![\d.:,])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d]|[.:,]\d)/g;
/** A bare 1–2 digit number (an hour candidate). */
const BARE = /(?<![\d.:,+])(\d{1,2})(?![\d]|[.:,]\d)/g;

export type TimeMention = {
  /** The words as written (normalized): "13:00", "1 בצהריים", "2pm". */
  text: string;
  /** Minutes after midnight it may mean (two when am/pm is unclear: "2:00" → 2:00 or 14:00). */
  minutes: number[];
  start: number;
  end: number;
};

function applyMarker(hour: number, marker: Marker | null): number[] {
  if (hour > 12 || hour === 0) return [hour % 24];
  switch (marker) {
    case "am":
      return [hour % 12];
    case "pm":
      return [hour === 12 ? 12 : hour + 12];
    case "evening":
      return [hour === 12 ? 0 : hour + 12];
    case "night":
      return [hour === 12 ? 0 : hour >= 9 ? hour + 12 : hour];
    default:
      return hour === 12 ? [12] : [hour, hour + 12];
  }
}

function markerOf(match: RegExpExecArray | null, prefix: "m" | "b"): Marker | null {
  if (!match?.groups) return null;
  const list = prefix === "m" ? MARKERS_AFTER : MARKERS_BEFORE;
  for (const [name, value] of Object.entries(match.groups)) {
    if (value !== undefined && name.startsWith(prefix)) return list[Number(name.slice(1))].marker;
  }
  return null;
}

/** Every time of day written in `text` (already normalized), in order. */
export function findTimeMentions(text: string): TimeMention[] {
  const found: TimeMention[] = [];
  const taken = (start: number, end: number) => found.some((f) => start < f.end && end > f.start);

  for (const match of text.matchAll(CLOCK)) {
    const start = match.index;
    let end = start + match[0].length;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (CURRENCY_NEAR.test(text.slice(end, end + 8)) || CURRENCY_BEFORE_NEAR.test(text.slice(Math.max(0, start - 3), start))) continue;
    const after = markerAfterRegex.exec(text.slice(end));
    const before = markerBeforeRegex.exec(text.slice(Math.max(0, start - 14), start));
    const marker = markerOf(after, "m") ?? markerOf(before, "b");
    if (after) end += after[0].length;
    // "საღამოს 8:00": the marker before the number is part of what was written.
    const shownFrom = !markerOf(after, "m") && before ? Math.max(0, start - 14) + before.index : start;
    found.push({ text: text.slice(shownFrom, end).trim(), minutes: applyMarker(hour, marker).map((h) => h * 60 + minute), start, end });
  }

  for (const match of text.matchAll(HOUR_RANGE)) {
    const start = match.index;
    let end = start + match[0].length;
    if (taken(start, end)) continue;
    const from = Number(match[1]);
    const to = Number(match[2]);
    if (from < 1 || from > 12 || to < 1 || to > 12) continue;
    const after = markerAfterRegex.exec(text.slice(end));
    const marker = markerOf(after, "m");
    if (!after || !marker) continue;
    end += after[0].length;
    const minutes = [...new Set([...applyMarker(from, marker), ...applyMarker(to, marker)].map((h) => h * 60))];
    found.push({ text: text.slice(start, end).trim(), minutes, start, end });
  }

  for (const match of text.matchAll(BARE)) {
    const start = match.index;
    let end = start + match[0].length;
    if (taken(start, end)) continue;
    const hour = Number(match[1]);
    if (hour > 24) continue;
    const rest = text.slice(end);
    const head = text.slice(Math.max(0, start - 16), start);
    if (CURRENCY_NEAR.test(rest.slice(0, 8)) || CURRENCY_BEFORE_NEAR.test(head)) continue;
    const after = markerAfterRegex.exec(rest);
    const before = markerBeforeRegex.exec(head);
    const oclock = oclockAfterRegex.exec(after ? rest.slice(after[0].length) : rest) ?? oclockAfterRegex.exec(rest);
    // "2 часа дня": the o'clock word, then the marker.
    const afterOclock = oclock ? markerAfterRegex.exec(rest.slice(oclock[0].length)) : null;
    const marker = markerOf(after, "m") ?? markerOf(afterOclock, "m") ?? markerOf(before, "b");
    const hourWord = hourWordBeforeRegex.test(head);
    const preposition = prepositionBeforeRegex.test(head) && (BARE_FOLLOW.test(rest) || startsWithStayWord(rest));
    if (!marker && !oclock && !hourWord && !preposition) continue;
    if (hour > 12 && marker && marker !== "evening" && marker !== "night" && marker !== "pm") continue;
    if (after) end += after[0].length;
    else if (oclock) end += oclock[0].length + (afterOclock ? afterOclock[0].length : 0);
    const markerBefore = !markerOf(after, "m") && !markerOf(afterOclock, "m") && before;
    const shownFrom = markerBefore ? Math.max(0, start - 16) + markerBefore.index : start;
    found.push({ text: text.slice(shownFrom, end).trim(), minutes: applyMarker(hour === 24 ? 0 : hour, marker).map((h) => h * 60), start, end });
  }

  for (const [regex, minutes] of [
    [NOON, 12 * 60],
    [MIDNIGHT, 0],
  ] as const) {
    const global = new RegExp(regex.source, "giu");
    for (const match of text.matchAll(global)) {
      const start = match.index;
      const end = start + match[0].length;
      if (taken(Math.max(0, start - 4), end + 4)) continue;
      if (AFTER_WORD_BEFORE.test(text.slice(Math.max(0, start - 10), start))) continue;
      found.push({ text: match[0], minutes: [minutes], start, end });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

// ─── Check-in / check-out times in a description ──────────────

export type StayTimeMention = { kind: StayTimeKind; time: TimeMention };

/** A sentence ends at a line break, ". " "! " "? " "; " or a bullet. */
const SENTENCE_END = /[\n\r•|]|[.!?;](?=\s|$)/g;
const WINDOW_AFTER = 70;
const WINDOW_BEFORE = 16;
/** Only spaces, "-", ":" and Georgian case endings between a time and the word after it ("14:00-დან შესვლა"). */
const BEFORE_GAP = new RegExp(`^(?:[\\s:,-]|დან|მდე|ზე)*$`, "u");

/**
 * The check-in and check-out times a description mentions. Each check-in / check-out word looks
 * for times after it, up to the next such word or the end of the sentence (and, when there are
 * none, right before it). "Late check-out" / "early check-in" are skipped: their times are extras.
 */
export function findStayTimes(description: string): StayTimeMention[] {
  const text = normalizeListingText(description);
  const keywords = [...text.matchAll(KEYWORDS)].map((m) => ({
    kind: (m.groups?.in ? "checkIn" : "checkOut") as StayTimeKind,
    start: m.index,
    end: m.index + m[0].length,
  }));
  if (keywords.length === 0) return [];
  const sentenceEnds = [...text.matchAll(SENTENCE_END)].map((m) => m.index);
  const times = findTimeMentions(text);
  const out: StayTimeMention[] = [];

  keywords.forEach((keyword, i) => {
    const before = text.slice(Math.max(0, keyword.start - 14), keyword.start);
    const after = text.slice(keyword.end, keyword.end + 18);
    if (LATE_BEFORE.test(before) || LATE_AFTER.test(after)) return;

    const next = keywords[i + 1]?.start ?? text.length;
    const sentenceEnd = sentenceEnds.find((e) => e >= keyword.end) ?? text.length;
    const sentenceStart = [...sentenceEnds].reverse().find((e) => e < keyword.start) ?? -1;
    if (SHABBAT.test(text.slice(sentenceStart + 1, sentenceEnd))) return;
    const windowEnd = Math.min(next, sentenceEnd, keyword.end + WINDOW_AFTER);
    const inside = times.filter((t) => t.start >= keyword.end && t.start < windowEnd);
    if (inside.length > 0) {
      for (const time of inside) out.push({ kind: keyword.kind, time });
      return;
    }
    const previous = keywords[i - 1]?.end ?? 0;
    const windowStart = Math.max(previous, sentenceStart + 1, keyword.start - WINDOW_BEFORE);
    const close = times.filter((t) => t.start >= windowStart && t.end <= keyword.start && BEFORE_GAP.test(text.slice(t.end, keyword.start)));
    const last = close.at(-1);
    if (last) out.push({ kind: keyword.kind, time: last });
  });
  return out;
}

/** "HH:MM" → minutes after midnight (null for anything else). */
export function clockMinutes(value: string | null | undefined): number | null {
  const match = typeof value === "string" ? /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim()) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** True when `text` reads like a check-in/out word at its start (used by the bare-number rule). */
export function startsWithStayWord(text: string): boolean {
  return KEYWORD_AT_START.test(text);
}

// ─── Currencies ───────────────────────────────────────────────

/** Currencies a description can mention (the listing's own ones plus rubles and pounds). */
export type MentionedCurrency = "GEL" | "USD" | "ILS" | "EUR" | "GBP" | "RUB";

const CURRENCY_TOKENS: Record<MentionedCurrency, string[]> = {
  GEL: ["₾", `\\bGEL\\b`, `\\blaris?\\b`, `${START}[בו]?לארי${END}`, `${START}лари${END}`, `${START}ლარ[${L}]*`, `${START}لاري${END}`],
  USD: [
    "\\$",
    `\\bUSD\\b`,
    `\\bdollars?\\b`,
    `\\bbucks\\b`,
    `${START}[בו]?דולר(?:ים)?${END}`,
    `${START}доллар[${L}]*`,
    `${START}бакс[${L}]*`,
    `${START}${AR_PREFIX}دولار[${L}]*`,
    `${START}დოლარ[${L}]*`,
  ],
  ILS: [
    "₪",
    `\\b(?:ILS|NIS)\\b`,
    `\\bshekels?\\b`,
    `${START}[בו]?(?:ש"ח|שח|שקל(?:ים)?)${END}`,
    `${START}шекел[${L}]*`,
    `${START}${AR_PREFIX}(?:شيكل|شيقل|شواكل)${END}`,
    `${START}შეკელ[${L}]*`,
  ],
  EUR: ["€", `\\bEUR\\b`, `\\beuros?\\b`, `${START}[בו]?יורו${END}`, `${START}евро${END}`, `${START}${AR_PREFIX}يورو${END}`, `${START}ევრო[${L}]*`],
  GBP: ["£", `\\bGBP\\b`],
  RUB: ["₽", `\\bRUB\\b`, `${START}руб(?:л[${L}]*|\\.)?`, `${START}${AR_PREFIX}روبل[${L}]*`, `${START}რუბლ[${L}]*`],
};

const CURRENCY_REGEX = new RegExp(
  Object.entries(CURRENCY_TOKENS)
    .map(([code, tokens]) => `(?<${code}>${tokens.join("|")})`)
    .join("|"),
  "giu",
);
const NUMBER_BEFORE = /(\d[\d,.]*)[\s-]{0,2}$/u;
const NUMBER_AFTER = /^[\s-]{0,2}(\d[\d,.]*\d|\d)/u;

export type CurrencyMention = { currency: MentionedCurrency; text: string };

/** Prices written with a currency, in order ("200 שקל", "$50", "50 лари"); a currency word without a number is not a price. */
export function findCurrencyMentions(input: string): CurrencyMention[] {
  const text = normalizeListingText(input);
  const out: CurrencyMention[] = [];
  for (const match of text.matchAll(CURRENCY_REGEX)) {
    const currency = Object.entries(match.groups ?? {}).find(([, v]) => v !== undefined)?.[0] as MentionedCurrency | undefined;
    if (!currency) continue;
    const start = match.index;
    const end = start + match[0].length;
    const before = NUMBER_BEFORE.exec(text.slice(Math.max(0, start - 16), start));
    const after = before ? null : NUMBER_AFTER.exec(text.slice(end, end + 16));
    if (before) out.push({ currency, text: `${before[0]}${match[0]}`.trim() });
    else if (after) out.push({ currency, text: `${match[0]}${after[0]}`.trim() });
  }
  return out;
}

// ─── Scripts ──────────────────────────────────────────────────

const SCRIPT_OF_LOCALE: Record<AppLocale, RegExp> = {
  he: /(?=\p{L})\p{Script=Hebrew}/gu,
  ar: /(?=\p{L})\p{Script=Arabic}/gu,
  ru: /(?=\p{L})\p{Script=Cyrillic}/gu,
  ka: /(?=\p{L})\p{Script=Georgian}/gu,
  en: /(?=\p{L})\p{Script=Latin}/gu,
};

export type ScriptCounts = Record<AppLocale, number>;

/** Letters per alphabet, as the locale that writes it (Latin → "en"). */
export function scriptCounts(text: string): ScriptCounts {
  const counts = { he: 0, ar: 0, ru: 0, ka: 0, en: 0 } as ScriptCounts;
  for (const [locale, regex] of Object.entries(SCRIPT_OF_LOCALE) as [AppLocale, RegExp][]) {
    counts[locale] = text.match(regex)?.length ?? 0;
  }
  return counts;
}

/**
 * The locale whose alphabet a short text is mostly written in, or null when it has too few
 * letters to tell. Script-based: Latin reads as "en".
 */
export function dominantScript(text: string, minLetters = 4): AppLocale | null {
  const counts = scriptCounts(text);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total < minLetters) return null;
  const [best] = (Object.entries(counts) as [AppLocale, number][]).sort((a, b) => b[1] - a[1]);
  return best[0];
}

/** A Latin word that starts with a capital letter ("Orbi", "City", "VIP"): a name. */
const CAPITALIZED_LATIN_WORD = /(?<![\p{L}\p{N}])[A-Z][A-Za-z'-]*(?![\p{L}\p{N}])/gu;

/**
 * True when a title is clearly not in the language the host chose ("I'm writing in"): its
 * letters are less than 40% in that language's alphabet and another alphabet has the most. A
 * title with some letters of the chosen alphabet doesn't count its Capitalized Latin words: "דירה
 * ב-Orbi City Twin Towers" names a building or a brand, it isn't written in English.
 */
export function titleScriptMismatch(title: string, locale: AppLocale): AppLocale | null {
  let counts = scriptCounts(title);
  if (locale !== "en" && counts[locale] > 0) counts = scriptCounts(title.replace(CAPITALIZED_LATIN_WORD, " "));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total < 4) return null;
  const [[detected]] = (Object.entries(counts) as [AppLocale, number][]).sort((a, b) => b[1] - a[1]);
  if (detected === locale) return null;
  return counts[locale] / total < 0.4 ? detected : null;
}
