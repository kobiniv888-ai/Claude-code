/**
 * Scam-phrase matching (pure — the database part is in ./scan.ts).
 *
 * Text and phrases are both normalized with normalizeSearchText (case, niqqud, Arabic letter
 * forms, Hebrew final letters, apostrophes, punctuation), so "Western-Union", "WESTERN UNION"
 * and "western union" are the same, and "בחו״ל" = "בחו\"ל" = "בחול".
 *
 * Pattern syntax (built-in rules; admin phrases are plain text):
 *   word        a whole word
 *   stem*       any word that starts with "stem" (Russian/Georgian endings: "подарочн*")
 *   (a|b c|)    alternatives; an empty alternative makes the group optional
 * Hebrew phrases also match with attached prefixes (ו ה ב ל מ ש כ: "בווסטרן יוניון"), Arabic
 * phrases with و ف ب ل ك ال ("بالبيتكوين").
 */
import { normalizeSearchText } from "@/lib/search-text";

export type PhraseCategory = "SCAM" | "CONTACT_INFO" | "OFFENSIVE";
export type PhraseAction = "FLAG" | "BLOCK";

export type PhraseRule = {
  id: string;
  category: PhraseCategory;
  action: PhraseAction;
  weight: number;
  patterns: RegExp[];
  source: "builtin" | "banned_word";
};

export type ScanHit = {
  /** The text that matched (normalized), for moderators. */
  phrase: string;
  category: PhraseCategory;
  action: PhraseAction;
  weight: number;
  /** "builtin:<id>" or "banned_word:<BannedWord.id>". */
  rule: string;
};

const HEBREW_PREFIX = "[והבלמשכ]{0,2}";
const ARABIC_PREFIX = "(?:وال|بال|فال|كال|لل|ال|و|ف|ب|ل|ك)?";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Splits on spaces that are not inside parentheses. */
function tokenize(pattern: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of pattern.trim()) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === " " && depth === 0) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function alternativeRegex(alternative: string): string | null {
  const stem = alternative.endsWith("*");
  const normalized = normalizeSearchText(stem ? alternative.slice(0, -1) : alternative);
  if (!normalized) return null;
  return escapeRegex(normalized).replace(/ /g, "\\s") + (stem ? "\\S*" : "(?=\\s)");
}

/** Compiles one pattern (see the syntax above) into a regex for ` ${normalized text} `. */
export function compilePattern(pattern: string): RegExp {
  const parts = tokenize(pattern).map((token) => {
    const grouped = token.startsWith("(") && token.endsWith(")");
    const alternatives = grouped ? token.slice(1, -1).split("|") : [token];
    const optional = grouped && alternatives.some((a) => a.trim() === "");
    const regexes = alternatives.map((a) => a.trim()).filter(Boolean).map(alternativeRegex).filter((r): r is string => !!r);
    return { group: `(?:${regexes.join("|")})`, optional, sample: alternatives.find((a) => a.trim()) ?? "" };
  });
  if (parts.length === 0) throw new Error(`Empty phrase pattern: "${pattern}"`);

  const first = normalizeSearchText(parts.find((p) => !p.optional)?.sample ?? parts[0].sample);
  const prefix = /[֐-׿]/.test(first) ? HEBREW_PREFIX : /[؀-ۿ]/.test(first) ? ARABIC_PREFIX : "";

  let body = "";
  parts.forEach((part, index) => {
    const piece = index === parts.length - 1 ? part.group : `${part.group}\\s`;
    body += part.optional ? `(?:${piece})?` : piece;
  });
  return new RegExp(`(?<=\\s)${prefix}${body}`, "u");
}

/**
 * An admin phrase (BannedWord.phrase) as a pattern: plain words; the last word may have any
 * ending when it is 4+ letters long ("deposit" also matches "deposits", "предоплат" → "предоплату").
 */
export function compileAdminPhrase(phrase: string): RegExp | null {
  const words = normalizeSearchText(phrase).split(" ").filter(Boolean);
  if (words.length === 0) return null;
  const last = words[words.length - 1];
  if ([...last].length >= 4) words[words.length - 1] = `${last}*`;
  return compilePattern(words.join(" "));
}

type BuiltinRule = { id: string; weight: number; patterns: string[] };

/**
 * Built-in scam phrases in the five languages (BRIEF §10). They only FLAG (add risk points);
 * admins add BLOCK phrases and more variants in Admin → Banned words.
 */
const BUILTIN_RULES: BuiltinRule[] = [
  {
    id: "western_union",
    weight: 30,
    patterns: [
      "(western union|westernunion)",
      "(ווסטרן|וסטרן) (יוניון|יוניו)",
      "(вестерн|western) (юнион|union)",
      "(ويسترن|وسترن) (يونيون|يونين)",
      "ვესტერნ (იუნიონ*|იუნიონი)",
    ],
  },
  {
    id: "moneygram",
    weight: 30,
    patterns: [
      "(moneygram|money gram)",
      "(מאניגרם|מניגרם|מאני גרם|מני גרם)",
      "(манигра*|мани грам*)",
      "(موني جرام|موني غرام|مونيغرام|موني قرام)",
      "(მანიგრამ*|მანი გრამ*)",
    ],
  },
  {
    id: "gift_cards",
    weight: 30,
    patterns: [
      "(gift|itunes|steam|amazon|apple|google play) card*",
      "giftcard*",
      "(כרטיס|כרטיסי|כרטיסים) (מתנה|גיפט|אייטיונס|גוגל פליי)",
      "(גיפט קארד*|גיפטקארד*)",
      "подарочн* карт*",
      "(гифт карт*|гифткарт*)",
      "(بطاقة|بطاقات|كروت|كرت) (هدايا|هدية|الهدايا|الهدية|ايتونز|جوجل بلاي|ستيم)",
      "სასაჩუქრე ბარათ*",
    ],
  },
  {
    id: "crypto",
    weight: 25,
    patterns: [
      "(bitcoin*|btc|usdt|tether|crypto*|ethereum|binance)",
      "(ביטקוין|קריפטו*|ביטקוינים)",
      "(מטבע|מטבעות) (דיגיטלי|דיגיטליים|קריפטו)",
      "(биткоин*|биткойн*|крипт*|тезер*|эфириум*|юсдт)",
      "(بيتكوين|بتكوين|كريبتو|تيثر|ايثريوم)",
      "(عملة|عملات) (رقمية|مشفرة)",
      "(ბიტკოინ*|კრიპტო*)",
    ],
  },
  {
    id: "deposit_first",
    weight: 30,
    patterns: [
      "(deposit|prepayment|advance) (first|upfront|up front|beforehand|in advance|before viewing|before the viewing)",
      "(send|transfer|wire|pay) (me|) (the|a|your|) (deposit|advance|prepayment|money|payment) (first|before|upfront|beforehand|in advance|to reserve|to hold it|now)",
      "pay before (you|) (see|seeing|view|viewing|visit|visiting|arrive|arriving)",
      "(מקדמה|פיקדון|פקדון|דמי רצינות) מראש",
      "(להעביר|העבר|העבירו|תעביר|תעבירו|לשלוח|שלח|שלחו|תשלח|תשלחו|לשלם|שלם|שלמו|תשלם|תשלמו) (לי|) (את|) (מקדמה|המקדמה|פיקדון|הפיקדון|פקדון|הפקדון|הכסף|כסף|דמי רצינות)",
      "לשלם לפני (ה|) (ביקור|הביקור|צפייה|הצפייה|שתראו|שתראה|שראיתם|ההגעה)",
      "(переведите|переведи|перечислите|отправьте|вышлите|внесите|оплатите|скиньте) (мне|сначала|) (залог|депозит|предоплат*|задаток|аванс|деньги)",
      "(залог|депозит|задаток|аванс|предоплат*) (вперед|заранее|до просмотра|сразу)",
      "(ارسل|أرسل|ارسلوا|أرسلوا|حول|حولوا|ادفع|ادفعوا|اودع) (لي|) (العربون|عربون|التأمين|تأمين|المبلغ|الدفعة المقدمة|دفعة مقدمة)",
      "(العربون|عربون|التأمين|المبلغ) (مقدما|مسبقا|أولا|قبل المعاينة)",
      "(გადმორიცხეთ|გადმომირიცხეთ|ჩარიცხეთ|გამომიგზავნეთ|გადაიხადეთ) (ავანს*|დეპოზიტ*|თანხ*|ბე)",
      "(ავანს*|დეპოზიტ*|ბე) (წინასწარ|დათვალიერებამდე)",
    ],
  },
  {
    id: "prepayment",
    weight: 15,
    patterns: [
      "(advance payment|prepayment|pay in advance|payment in advance|full payment upfront)",
      "תשלום (מראש|מלא מראש)",
      "предоплат*",
      "(دفعة مقدمة|الدفع مقدما|الدفع مسبقا|دفع مسبق)",
      "წინასწარ* (გადახდ*|ანგარიშსწორებ*)",
    ],
  },
  {
    id: "abroad_keys",
    weight: 35,
    patterns: [
      "(i am|im|we are|were|i am currently|im currently|currently|now living|now working) (abroad|overseas|out of the country)",
      "(send|mail|post|ship|courier) (you|) (the|) keys",
      "keys (by|via|through|with) (mail|post|courier|dhl|fedex|ups|a courier)",
      "(אני|אנחנו|נמצא|נמצאת|נמצאים|גר|גרה|גרים) (כרגע|עכשיו|) (בחו״ל|בחוץ לארץ)",
      "(אשלח|נשלח|אשלח לך|אשלח לכם) (לך|לכם|) (את|) (המפתח|המפתחות|מפתח|מפתחות)",
      "(המפתח|המפתחות) (בדואר|בשליח|עם שליח|בדואר שליחים)",
      "(я|мы) (сейчас|) (за границей|за рубежом|в другой стране|не в стране|не в грузии)",
      "(нахожусь|живу|работаю) (сейчас|) (за границей|за рубежом)",
      "(вышлю|отправлю|пришлю|передам) (вам|тебе|) ключ*",
      "ключ* (по почте|курьером|почтой)",
      "(انا|أنا|نحن) (حاليا|الآن|) (خارج البلد|خارج البلاد|في الخارج|مسافر خارج)",
      "(سأرسل|سارسل|ارسل|نرسل|سنرسل) (لك|لكم|) (المفاتيح|المفتاح)",
      "(المفاتيح|المفتاح) (بالبريد|عبر البريد|مع شركة شحن|مع مندوب)",
      "(საზღვარგარეთ|უცხოეთში) (ვარ|ვიმყოფები|ვცხოვრობ|ვმუშაობ)",
      "გასაღებ* (ფოსტით|კურიერით)",
      "(გამოგიგზავნით|გამოგიგზავნი) (გასაღებ*|გასაღები)",
    ],
  },
];

export const BUILTIN_PHRASE_RULES: PhraseRule[] = BUILTIN_RULES.map((rule) => ({
  id: rule.id,
  category: "SCAM",
  action: "FLAG",
  weight: rule.weight,
  patterns: rule.patterns.map(compilePattern),
  source: "builtin",
}));

/** Every rule that matches `text` (one hit per rule). */
export function scanWithRules(text: string | null | undefined, rules: readonly PhraseRule[]): ScanHit[] {
  const normalized = normalizeSearchText(text);
  if (!normalized) return [];
  const haystack = ` ${normalized} `;
  const hits: ScanHit[] = [];
  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(haystack);
      if (!match) continue;
      hits.push({
        phrase: match[0].trim().slice(0, 80),
        category: rule.category,
        action: rule.action,
        weight: rule.weight,
        rule: `${rule.source}:${rule.id}`,
      });
      break;
    }
  }
  return hits;
}
