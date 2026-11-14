/**
 * Finds payment details and payment requests in user-written text (SECURITY_REPORT 14.2.a). Pure
 * and client-safe, like ./contact-info.ts: the server blocks with it (./text-guard.ts) and a form
 * may warn with it while the user types.
 *
 * Bayit takes no money: guests pay the host on arrival. Any request to pay in advance through a
 * link, a bank transfer, a card, crypto or a money-transfer service is a scam, so these are
 * BLOCKED wherever other people read the text (titles, descriptions, room types, reviews and
 * replies, messages to the host, list names, profiles…):
 *
 *   detectPaymentInfo("Pay the deposit here: paypal.me/flat_owner")
 *   → { kinds: ["payment_link"], samples: [{ kind: "payment_link", text: "paypal.me/flat_owner" }] }
 *
 * | kind            | what                                                                    |
 * |-----------------|-------------------------------------------------------------------------|
 * | payment_link    | paypal.me, revolut.me, wise.com, venmo.com, cash.app, Stripe, Keepz…,   |
 * |                 | any link shortener, any link next to a "pay" / "confirm" word           |
 * | iban            | an IBAN (any country, mod-97 checksum; IL 23 and GE 22 characters), or  |
 * |                 | "IBAN" followed by an account-like number                               |
 * | card_number     | a payment card number (15–19 digits, a card network prefix, Luhn)       |
 * | card_request    | "CVV", "card number", "card details", "3 digits on the back"… (5 langs) |
 * | crypto_wallet   | a BTC (legacy or bc1), ETH / ERC-20 (0x…) or TRON / USDT-TRC20 address  |
 * | crypto_ask      | USDT / TRC-20 / ERC-20, or bitcoin / crypto next to a "pay" word        |
 * | money_transfer  | Western Union, MoneyGram, Ria, Korona next to a "pay / send" word       |
 * | gift_card       | gift / iTunes / Steam cards next to a "pay / send / code" word          |
 *
 * Obfuscation is handled like the contact detector: full-width and Arabic-Indic digits, invisible
 * characters, "(dot)", spaced or dotted letters ("p a y p a l . m e"), look-alike letters from
 * other alphabets ("раураl" written with Cyrillic р/а/у), digits inside words ("p4yp4l"), and
 * card numbers written as words ("four five eight zero …", in the 5 languages).
 *
 * No false positives on normal text: prices, dates, years, phone numbers, cadastral codes,
 * listing numbers and a plain mention of a service ("next to the Western Union office") do not
 * count; the "ask" kinds need a payment word in the same sentence.
 */
import { detectContactInfo, normalizeForContactScan } from "./contact-info";
import { compilePattern } from "./phrases";
import { normalizeSearchText } from "@/lib/search-text";

export const PAYMENT_FINDING_KINDS = [
  "payment_link",
  "iban",
  "card_number",
  "card_request",
  "crypto_wallet",
  "crypto_ask",
  "money_transfer",
  "gift_card",
] as const;
export type PaymentFindingKind = (typeof PAYMENT_FINDING_KINDS)[number];

export type PaymentFindings = {
  /** Each kind found, once, in the order of PAYMENT_FINDING_KINDS. */
  kinds: PaymentFindingKind[];
  /** What matched (normalized), for moderators; at most one per kind. */
  samples: { kind: PaymentFindingKind; text: string }[];
};

export function hasPaymentInfo(findings: PaymentFindings): boolean {
  return findings.kinds.length > 0;
}

// ─── Normalization ────────────────────────────────────────────

/** Letters of other alphabets that look like Latin ones ("раураl" → "paypal"). */
const LOOKALIKES: Record<string, string> = {
  // Cyrillic
  а: "a", в: "b", е: "e", ё: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", ѕ: "s", і: "i", ј: "j", ԁ: "d", ԛ: "q", ԝ: "w", ӏ: "l",
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", У: "Y", Х: "X", Ѕ: "S", І: "I", Ј: "J",
  // Greek
  α: "a", β: "b", ε: "e", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x", γ: "y",
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X",
  // Latin variants
  ı: "i", ɑ: "a", ℓ: "l", ɡ: "g", ꞵ: "b",
};
const LOOKALIKE_RE = new RegExp(`[${Object.keys(LOOKALIKES).join("")}]`, "gu");

/** Digits used as letters inside a word ("p4yp4l", "r3volut", "c@sh"). */
const LEET: Record<string, string> = { "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

/** Folds look-alike letters to Latin (only meaningful for Latin keyword and link matching). */
export function foldLookalikes(text: string): string {
  return text.replace(LOOKALIKE_RE, (ch) => LOOKALIKES[ch] ?? ch);
}

/** "p4yp4l" → "paypal": digits inside a word that has at least 2 Latin letters. */
function foldLeet(text: string): string {
  return text.replace(/[a-z0-9@$]*[a-z][a-z0-9@$]*/gi, (word) => {
    if (!/\d|[@$]/.test(word) || (word.match(/[a-z]/gi)?.length ?? 0) < 2) return word;
    // A price or a size is not a word ("50usd", "3br", "2nd"): only mostly-letter words.
    if (/^\d/.test(word) && !/^[0-9@$]{1,2}[a-z]{3,}/i.test(word)) return word;
    return word.replace(/[013457@$]/g, (ch) => LEET[ch] ?? ch);
  });
}

/** "p a y p a l . m e" / "p.a.y.p.a.l" / "p-a-y-p-a-l": letters spelled out one by one → joined. */
function joinSpelledLetters(text: string): string {
  return text.replace(/(?<![\p{L}\p{N}])(?:[a-z][\s._\-*·•]{1,3}){2,}[a-z](?![\p{L}\p{N}])/giu, (run) => run.replace(/[\s._\-*·•]+/g, ""));
}

/** Number words in the 5 languages → digits ("four five eight zero" → "4 5 8 0"). */
const NUMBER_WORDS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  אפס: "0", אחד: "1", אחת: "1", שתיים: "2", שתים: "2", שניים: "2", שנים: "2", שלוש: "3", שלש: "3", שלושה: "3", ארבע: "4", ארבעה: "4", חמש: "5", חמישה: "5", שש: "6", שישה: "6", שבע: "7", שבעה: "7", שמונה: "8", תשע: "9", תשעה: "9",
  ноль: "0", нуль: "0", один: "1", одна: "1", два: "2", две: "2", три: "3", четыре: "4", пять: "5", шесть: "6", семь: "7", восемь: "8", девять: "9",
  صفر: "0", واحد: "1", اثنان: "2", اثنين: "2", ثلاثة: "3", ثلاثه: "3", أربعة: "4", اربعة: "4", اربعه: "4", خمسة: "5", خمسه: "5", ستة: "6", سته: "6", سبعة: "7", سبعه: "7", ثمانية: "8", ثمانيه: "8", تسعة: "9", تسعه: "9",
  ნული: "0", ერთი: "1", ორი: "2", სამი: "3", ოთხი: "4", ხუთი: "5", ექვსი: "6", შვიდი: "7", რვა: "8", ცხრა: "9",
};
const NUMBER_WORD = `(?:${Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join("|")})`;
/** At least 8 number words in a row ("two bedrooms, three beds" is never touched). */
const NUMBER_WORD_RUN = new RegExp(`(?<![\\p{L}])${NUMBER_WORD}(?:[\\s,.\\-]+${NUMBER_WORD}){7,}(?![\\p{L}])`, "giu");

function spellOutDigits(text: string): string {
  return text.replace(NUMBER_WORD_RUN, (run) =>
    run.replace(new RegExp(`(?<![\\p{L}])${NUMBER_WORD}(?![\\p{L}])`, "giu"), (w) => NUMBER_WORDS[w.toLowerCase()] ?? w),
  );
}

type Views = {
  /** NFKC, invisible characters out, "(dot)" → ".", Arabic-Indic digits → 0-9 (the contact detector's). */
  base: string;
  /** base, look-alike letters folded, spelled-out letters joined, lower case. */
  latin: string;
  /** latin with digits-as-letters folded (keywords only, never numbers). */
  leet: string;
  /** base with number words as digits (cards, IBANs). */
  digits: string;
  /** normalizeSearchText(base): words for the multilingual phrases. */
  words: string;
};

function views(text: string): Views {
  const base = normalizeForContactScan(text);
  const latin = joinSpelledLetters(foldLookalikes(base)).toLowerCase();
  return { base, latin, leet: foldLeet(latin), digits: foldLookalikes(spellOutDigits(base)), words: normalizeSearchText(base) };
}

// ─── Payment words (the "ask" kinds need one nearby) ──────────

/** "pay", "send", "transfer"… in the 5 languages, as phrase patterns (./phrases.ts syntax). */
const PAY_WORD_PATTERNS = [
  "(pay|pays|paid|paying|payment*|prepay*|deposit*|send|sending|sent|transfer|transfers|transferring|wire|wiring|wired|accept|accepted|accepting|via|through|using|buy|buying|purchase*|code|codes|money|fee|fees|advance|upfront|reserve|reservation|invoice|checkout|wallet)",
  "(לשלם|שלם|שלמו|תשלם|תשלמו|משלמים|תשלום|תשלומים|מקדמה|המקדמה|פיקדון|הפיקדון|להעביר|העבירו|תעבירו|העבר|העברה|העברת|לשלוח|שלחו|שלח|תשלחו|דרך|באמצעות|בעזרת|מקבלים|מקבל|מקבלת|לקנות|קנו|קוד|קודים|הקוד|כסף|הכסף)",
  "(оплат*|плат*|заплат*|предоплат*|перевод*|перевед*|перечисл*|отправ*|вышл*|скинь*|через|принима*|залог*|депозит*|задат*|аванс*|купит*|код*|деньг*)",
  "(ادفع|ادفعوا|دفع|الدفع|دفعه|حول|حولوا|تحويل|التحويل|ارسل|ارسلوا|عبر|بواسطه|نقبل|يقبل|نستقبل|اشتر|اشتري|شراء|كود|رمز|الرمز|المبلغ|مبلغ|عربون|العربون|تامين|التامين)",
  "(გადახდ*|გადაიხად*|გადარიცხ*|ჩარიცხ*|გამოგზავნ*|გამომიგზავნ*|ავანს*|დეპოზიტ*|კოდ*|ფულ*|თანხ*|ვიღებთ)",
].map(compilePattern);

/** True when a payment word is in `window` (normalized words). */
function hasPayWord(window: string): boolean {
  const padded = ` ${window} `;
  return PAY_WORD_PATTERNS.some((pattern) => pattern.test(padded));
}

/** How far (in characters of normalized words) a payment word may be from the service it goes with. */
const ASK_RADIUS = 70;

/**
 * The first match of `always` in the normalized words, else the first match of `patterns` with a
 * payment word within ASK_RADIUS characters before or after it (the match itself is left out:
 * "Western Union" is not a payment word).
 */
function askNearPayWord(words: string, patterns: readonly RegExp[], always: readonly RegExp[] = []): string | null {
  const haystack = ` ${words} `;
  for (const pattern of always) {
    const match = pattern.exec(haystack);
    if (match) return match[0].trim();
  }
  for (const pattern of patterns) {
    const global = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
    for (const match of haystack.matchAll(global)) {
      const start = match.index ?? 0;
      const before = haystack.slice(Math.max(0, start - ASK_RADIUS), start);
      const after = haystack.slice(start + match[0].length, start + match[0].length + ASK_RADIUS);
      if (hasPayWord(`${before} ${after}`)) return match[0].trim();
    }
  }
  return null;
}

// ─── Payment links ────────────────────────────────────────────

/** A dot as written to dodge filters: ".", " . ", "[.]", " dot " (the contact scan already turned "(dot)" into "."). */
const D = String.raw`(?:\s{0,2}[.·•]\s{0,2}|\s{0,2}\[\.\]\s{0,2}|\s+(?:dot|נקודה|точка|نقطة|წერტილი)\s+)`;
/** Separator inside a brand name ("pay pal", "cash-app", "pay_pal"). */
const S = String.raw`[\s._\-*·•]{0,2}`;

/** Payment and money-transfer hosts that are a payment link on their own. */
const PAYMENT_HOST_PATTERNS = [
  `pay${S}pal${D}me`,
  `paypal${S}me\\b`,
  `paypal${D}com`,
  `revolut${D}(?:me|com)`,
  `(?:transfer${S})?wise${D}com`,
  `transferwise`,
  `venmo${D}com`,
  `cash${D}app\\b`,
  `cash${D}me\\b`,
  `(?:buy|checkout|pay|donate)${D}stripe${D}com`,
  `\\bstripe${D}me\\b`,
  `monzo${D}me`,
  `payoneer${D}com`,
  `skrill${D}com`,
  `paysera${D}com`,
  `keepz${D}me`,
  `tbcpay${D}ge`,
  `ipay${D}ge`,
  `payze${D}io`,
  `yoomoney${D}ru`,
  `qiwi${D}(?:com|me)`,
  `payboxapp${D}`,
].map((source) => new RegExp(source, "iu"));

/** Link shorteners: what is behind them can't be checked, so a short link counts as a payment link. */
const SHORTENER_PATTERN = new RegExp(
  `(?<![\\w.-])(?:bit${D}ly|bitly${D}com|tinyurl${D}com|goo${D}gl|t${D}ly|cutt${D}ly|rb${D}gy|is${D}gd|v${D}gd|ow${D}ly|shorturl${D}at|tiny${D}cc|s${D}id|buff${D}ly|rebrand${D}ly|clck${D}ru|qrco${D}de|lnkd${D}in|t${D}co)(?:${D}|\\s{0,2}/)`,
  "iu",
);

/** "Payment page", "pay here", "secure payment link", "оплата по ссылке"… next to a link. */
const PAY_LINK_WORDS =
  /(?:\bpay(?:ment|ing)?\b|\bprepay|\bdeposit|\bcheckout|\binvoice|\bcard\b|\bverify|\bconfirm|לשלם|שלמו|תשלום|מקדמה|פיקדון|אימות|оплат|плат[её]ж|предоплат|залог|задат|подтвер|ادفع|الدفع|دفع|عربون|تأكيد|გადახდ|გადაიხად|ავანს|დადასტურ)/iu;

function findPaymentLink(v: Views): string | null {
  for (const view of [v.latin, v.leet]) {
    for (const pattern of PAYMENT_HOST_PATTERNS) {
      const match = pattern.exec(view);
      if (match) return match[0].replace(/\s+/g, "");
    }
    const short = SHORTENER_PATTERN.exec(view);
    if (short) return short[0].replace(/\s+/g, "");
  }
  // Any link written next to a payment word ("pay the deposit here: mysite.xyz/booking", "confirm
  // your booking at …": the Booking.com scam). The case is kept, so "beach.Live like a local" is
  // still a sentence and not a link (./contact-info.ts).
  const folded = foldLookalikes(v.base);
  for (const url of detectContactInfo(folded).urls) {
    const at = folded.indexOf(url);
    const around = at >= 0 ? folded.slice(Math.max(0, at - 60), at + url.length + 60) : folded;
    if (PAY_LINK_WORDS.test(around) || PAY_LINK_WORDS.test(url)) return url;
  }
  return null;
}

// ─── IBAN ─────────────────────────────────────────────────────

/** IBAN length by country (ISO 13616 registry). */
export const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24,
  DE: 22, DJ: 27, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FK: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27,
  GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20,
  LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MN: 20, MR: 27, MT: 31, MU: 30, NI: 28, NL: 18, NO: 15, OM: 23, PK: 24, PL: 28,
  PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, RU: 33, SA: 24, SC: 31, SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, SO: 23, ST: 25, SV: 28,
  TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20, YE: 30,
};

/** ISO 7064 mod 97-10 over an IBAN without spaces ("GE29NB0000000101904917"). */
export function ibanChecksumOk(iban: string): boolean {
  const value = iban.toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) return false;
  const rearranged = value.slice(4) + value.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

/** True for a valid IBAN of a known country (right length and checksum). */
export function isValidIban(iban: string): boolean {
  const value = iban.replace(/[\s.\-]/g, "").toUpperCase();
  const length = IBAN_LENGTHS[value.slice(0, 2)];
  return length !== undefined && value.length === length && ibanChecksumOk(value);
}

/** Country code + check digits, then account characters with optional single separators. */
const IBAN_CANDIDATE = /(?<![A-Za-z0-9])([A-Za-z]{2})[\s.\-]?(\d{2})((?:[\s.\-]?[A-Za-z0-9]){11,32})/g;
/** "IBAN", "IBAN:", "IBAN №", "איבאן", "ИБАН", "آيبان", "აიბანი" followed by an account-like number. */
const IBAN_LABEL = /(?:\biban\b|איבאן|אייבן|\bибан\b|ايبان|آيبان|აიბან\S*)\s*[:#№.\-]?\s*((?:[A-Za-z0-9][\s.\-]?){15,34})/iu;

function findIban(v: Views): string | null {
  for (const view of [v.base, v.digits]) {
    const text = foldLookalikes(view);
    for (const match of text.matchAll(IBAN_CANDIDATE)) {
      const country = match[1].toUpperCase();
      const length = IBAN_LENGTHS[country];
      if (!length) continue;
      const body = `${match[2]}${match[3]}`.replace(/[\s.\-]/g, "").toUpperCase();
      // The candidate may run into the next word: try the country's exact length.
      const iban = `${country}${body}`.slice(0, length);
      // Account numbers are mostly digits; words that happen to follow "me 22" are not.
      const digitShare = (iban.slice(4).match(/\d/g)?.length ?? 0) / Math.max(1, iban.length - 4);
      if (iban.length === length && digitShare >= 0.6 && ibanChecksumOk(iban)) return `${iban.slice(0, 4)}…${iban.slice(-2)}`;
    }
    const labelled = IBAN_LABEL.exec(text);
    if (labelled && (labelled[1].match(/\d/g)?.length ?? 0) >= 12) return labelled[0].trim().slice(0, 40);
  }
  return null;
}

// ─── Card numbers ─────────────────────────────────────────────

/** Luhn (mod 10) over a string of digits. */
export function luhnOk(digits: string): boolean {
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Card network prefixes and lengths: Visa, Mastercard, Amex, Discover, JCB, UnionPay, Mir, Maestro. */
export function cardNetworkOk(digits: string): boolean {
  const n = digits.length;
  const p2 = Number(digits.slice(0, 2));
  const p4 = Number(digits.slice(0, 4));
  if (digits.startsWith("4")) return n === 16 || n === 19; // Visa
  if ((p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720)) return n === 16; // Mastercard
  if (p2 === 34 || p2 === 37) return n === 15; // Amex
  if (p4 >= 2200 && p4 <= 2204) return n >= 16 && n <= 19; // Mir
  if (p4 === 6011 || p2 === 65 || (p4 >= 6440 && p4 <= 6499)) return n >= 16 && n <= 19; // Discover
  if (p4 >= 3528 && p4 <= 3589) return n >= 16 && n <= 19; // JCB
  if (p2 === 62) return n >= 16 && n <= 19; // UnionPay
  if (p2 === 50 || (p2 >= 56 && p2 <= 69)) return n >= 16 && n <= 19; // Maestro and local schemes
  return false;
}

/** Digits with up to 3 separator characters between them (as ./contact-info.ts). */
const CARD_RUN = /(?<![\d+])\d(?:[ \t.\-‐-―_*·•|/]{0,3}\d){14,18}(?!\d)/g;
/** Letter O / l / I typed for 0 / 1 inside a run of digits ("4580 l234 5678 9OI2"). */
function digitLookalikes(text: string): string {
  return text.replace(/(?<=\d[\s.\-]?)[OoОо](?=[\s.\-]?\d|[\s.\-]?[OoОо])|(?<=\d[\s.\-]?)[lI|](?=[\s.\-]?\d)/gu, (ch) => (/[OoОо]/.test(ch) ? "0" : "1"));
}

/**
 * A card number's groups: none ("4580123456789012"), four-digit groups, Amex 4-6-5, or digits
 * spelled out one by one. Dates ("23.06.2026-30.06.2026"), cadastral codes and phone lists have
 * other groups and are never read as a card.
 */
function cardGroupsOk(run: string): boolean {
  const groups = run.split(/\D+/).filter(Boolean);
  if (groups.length === 1) return true;
  if (groups.every((g) => g.length === 1)) return true;
  if (groups.slice(0, -1).every((g) => g.length === 4) && groups.at(-1)!.length >= 1 && groups.at(-1)!.length <= 4) return true;
  return groups.length === 3 && groups[0].length === 4 && groups[1].length === 6 && groups[2].length === 5;
}

function findCardNumber(v: Views): string | null {
  for (const view of [v.base, v.digits]) {
    const text = digitLookalikes(view);
    for (const match of text.matchAll(CARD_RUN)) {
      const run = match[0];
      const before = text.slice(Math.max(0, (match.index ?? 0) - 3), match.index);
      if (/(?:\+|00)\s?$/.test(before)) continue;
      const digits = run.replace(/\D/g, "");
      if (digits.length < 15 || digits.length > 19 || !cardGroupsOk(run)) continue;
      if (cardNetworkOk(digits) && luhnOk(digits)) return `${digits.slice(0, 4)}…${digits.slice(-2)}`;
    }
  }
  return null;
}

// ─── Card-detail requests ─────────────────────────────────────

/** Asking for card details is never needed on Bayit (5 languages; ./phrases.ts pattern syntax). */
const CARD_REQUEST_PATTERNS = [
  "(cvv|cvv2|cvc|cvc2|cvn)",
  "(card|credit card|debit card|bank card|payment card) (number|numbers|details|detail|info|information|data|credentials|verification|security code|expiry date|expiration date)",
  "(security code|expiry date|expiration date) (of|on|from) (the|your|) card",
  "(3|three) digits (on|at|from) the back",
  "verify (your|the) (card|payment card|credit card|bank card)",
  "(מספר|פרטי|תוקף|אימות|ספרות) (כרטיס|הכרטיס|כרטיסי|כרטיס האשראי|האשראי|אשראי)",
  "קוד (אבטחה|האבטחה|הביטחון) (של|על|מ|בגב) (כרטיס|הכרטיס|כרטיס האשראי)",
  "(3|שלוש|שלושת) (ספרות|הספרות) (בגב|מגב|שבגב|על גב) (כרטיס|הכרטיס)",
  "(номер|номера|данные|реквизиты|cvv|код|срок действия|подтверждение|верификаци*) (карты|карточки|вашей карты|банковской карты|кредитной карты)",
  "код безопасности (карты|вашей карты|банковской карты)",
  "(три|3) (цифры|цифр) (на обороте|с обратной стороны|сзади)",
  "(رقم|ارقام|بيانات|تفاصيل|معلومات|رمز|تاريخ انتهاء) (البطاقه|بطاقه|بطاقتك|البطاقه البنكيه|بطاقه الائتمان|بطاقه الدفع)",
  "(رمز الامان|رمز التحقق) (للبطاقه|البطاقه|الخاص بالبطاقه)",
  "(الارقام الثلاثه|3 ارقام|ثلاثه ارقام) (على|في|خلف) (ظهر|خلف|الوجه الخلفي)",
  "ბარათის (ნომერ*|მონაცემ*|დეტალ*|რეკვიზიტ*|კოდ*|ვადა*|უსაფრთხოების)",
].map(compilePattern);

function firstPattern(words: string, patterns: readonly RegExp[]): string | null {
  const haystack = ` ${words} `;
  for (const pattern of patterns) {
    const match = pattern.exec(haystack);
    if (match) return match[0].trim();
  }
  return null;
}

// ─── Crypto ───────────────────────────────────────────────────

const BASE58 = "[1-9A-HJ-NP-Za-km-z]";
const BTC_LEGACY = new RegExp(`(?<![A-Za-z0-9])[13]${BASE58}{25,34}(?![A-Za-z0-9])`, "g");
const BTC_BECH32 = /(?<![A-Za-z0-9])bc1[02-9ac-hj-np-z]{11,71}(?![A-Za-z0-9])/gi;
const ETH = /(?<![A-Za-z0-9])0x[0-9a-fA-F]{40}(?![A-Za-z0-9])/g;
const TRON = new RegExp(`(?<![A-Za-z0-9])T${BASE58}{33}(?![A-Za-z0-9])`, "g");

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

/** BIP-173 / BIP-350 checksum of a bech32 / bech32m string ("bc1q…"). */
export function bech32Ok(address: string): boolean {
  const value = address.toLowerCase();
  const sep = value.lastIndexOf("1");
  if (sep < 1 || sep + 7 > value.length || value.length > 90) return false;
  const hrp = value.slice(0, sep);
  const data: number[] = [];
  for (const ch of value.slice(sep + 1)) {
    const index = BECH32_CHARSET.indexOf(ch);
    if (index < 0) return false;
    data.push(index);
  }
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  const values = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31), ...data];
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i];
  }
  return chk === 1 || chk === 0x2bc830a3;
}

/** A base58 address has upper- and lower-case letters and digits (words and codes don't). */
function mixedBase58(token: string): boolean {
  return /[a-z]/.test(token) && /[A-Z]/.test(token) && /\d/.test(token.slice(1));
}

function findWallet(v: Views): string | null {
  const text = foldLookalikes(v.base);
  const eth = text.match(ETH)?.[0];
  if (eth && /[a-f1-9]/i.test(eth.slice(2)) && !/^0x0+$/i.test(eth)) return `${eth.slice(0, 6)}…`;
  for (const match of text.matchAll(BTC_BECH32)) if (bech32Ok(match[0])) return `${match[0].slice(0, 6)}…`;
  for (const match of text.matchAll(TRON)) if (mixedBase58(match[0])) return `${match[0].slice(0, 5)}…`;
  for (const match of text.matchAll(BTC_LEGACY)) if (mixedBase58(match[0])) return `${match[0].slice(0, 5)}…`;
  return null;
}

/** Stablecoin and token-network words are payment words on their own. */
const CRYPTO_ALWAYS = ["(usdt|trc20|trc 20|erc20|erc 20|bep20|bep 20|binance pay|binancepay)", "(юсдт)", "(تيثر)"].map(compilePattern);
const CRYPTO_WORDS = [
  "(bitcoin*|btc|crypto*|cryptocurrency|ethereum|eth|litecoin|ltc|tether|trx|binance|wallet address)",
  "(ביטקוין|ביטקוינים|קריפטו*|אתריום|מטבע דיגיטלי|מטבעות דיגיטליים|ארנק דיגיטלי)",
  "(биткоин*|биткойн*|крипт*|эфириум*|кошел*)",
  "(بيتكوين|بتكوين|كريبتو|ايثريوم|عمله رقميه|عملات رقميه|عملات مشفره|محفظه)",
  "(ბიტკოინ*|კრიპტო*|საფულ*)",
].map(compilePattern);

// ─── Money-transfer services and gift cards ───────────────────

const TRANSFER_WORDS = [
  "(western union|westernunion|moneygram|money gram|ria money transfer|ria transfer|ria money|via ria|through ria|by ria|koronapay|korona pay|unistream|worldremit|remitly|xoom)",
  "(ווסטרן יוניון|וסטרן יוניון|מאניגרם|מניגרם|מאני גרם)",
  "(вестерн юнион|western union|манигра*|мани грам*|коронапэй|корона пэй|юнистрим)",
  "(ويسترن يونيون|وسترن يونيون|موني جرام|موني غرام|مونيغرام)",
  "(ვესტერნ იუნიონ*|მანიგრამ*)",
].map(compilePattern);

/** A Western Union / MoneyGram transfer number: only ever given to collect a payment. */
const TRANSFER_ALWAYS = ["(mtcn|money transfer control number)"].map(compilePattern);

const GIFT_CARD_WORDS = [
  "(gift|itunes|steam|amazon|apple|google play|razer|ebay|xbox|playstation|psn|netflix) (card|cards|code|codes|voucher|vouchers)",
  "(giftcard*)",
  "(כרטיס|כרטיסי|כרטיסים|קוד|קודים|שובר|שוברי) (מתנה|גיפט|אייטיונס|גוגל פליי|אמזון|סטים)",
  "(גיפט קארד*|גיפטקארד*)",
  "подарочн* (карт*|сертификат*|код*)",
  "(гифт карт*|гифткарт*)",
  "карт* (itunes|steam|amazon)",
  "(بطاقه|بطاقات|كروت|كرت|قسيمه|كود) (هدايا|هديه|الهدايا|الهديه|ايتونز|جوجل بلاي|ستيم|امازون)",
  "სასაჩუქრე (ბარათ*|ვაუჩერ*|კოდ*)",
].map(compilePattern);

// ─── Public API ───────────────────────────────────────────────

export function detectPaymentInfo(text: string | null | undefined): PaymentFindings {
  const findings: PaymentFindings = { kinds: [], samples: [] };
  if (!text || !text.trim()) return findings;
  const v = views(text.slice(0, 20_000));
  const found: Partial<Record<PaymentFindingKind, string | null>> = {
    payment_link: findPaymentLink(v),
    iban: findIban(v),
    card_number: findCardNumber(v),
    card_request: firstPattern(v.words, CARD_REQUEST_PATTERNS) ?? firstPattern(normalizeSearchText(v.latin), CARD_REQUEST_PATTERNS.slice(0, 5)),
    crypto_wallet: findWallet(v),
    crypto_ask: askNearPayWord(v.words, CRYPTO_WORDS, CRYPTO_ALWAYS) ?? askNearPayWord(normalizeSearchText(v.leet), CRYPTO_WORDS.slice(0, 1), CRYPTO_ALWAYS.slice(0, 1)),
    money_transfer: askNearPayWord(v.words, TRANSFER_WORDS, TRANSFER_ALWAYS) ?? askNearPayWord(normalizeSearchText(v.leet), TRANSFER_WORDS.slice(0, 1)),
    gift_card: askNearPayWord(v.words, GIFT_CARD_WORDS) ?? askNearPayWord(normalizeSearchText(v.leet), GIFT_CARD_WORDS.slice(0, 2)),
  };
  for (const kind of PAYMENT_FINDING_KINDS) {
    const sample = found[kind];
    if (!sample) continue;
    findings.kinds.push(kind);
    findings.samples.push({ kind, text: sample.slice(0, 60) });
  }
  return findings;
}

/** All texts joined (a form's fields): one scan. */
export function detectPaymentInfoIn(texts: readonly (string | null | undefined)[]): PaymentFindings {
  return detectPaymentInfo(texts.filter((t): t is string => typeof t === "string" && t.trim() !== "").join("\n"));
}
