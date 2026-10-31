/**
 * Instant FAQ search (pure, client-safe): accent/niqqud-insensitive matching in all five
 * scripts and highlight ranges mapped back onto the original text.
 */

export type FaqEntry = { id: string; category: string; question: string; answer: string };
export type FaqMatch = FaqEntry & { score: number };
export type HighlightPart = { text: string; match: boolean };

/** Hebrew final letters → regular forms, Arabic letter variants → their base letter. */
const FOLD: Record<string, string> = {
  ך: "כ",
  ם: "מ",
  ן: "נ",
  ף: "פ",
  ץ: "צ",
  أ: "ا",
  إ: "ا",
  آ: "ا",
  ٱ: "ا",
  ة: "ه",
  ى: "ي",
  ئ: "ي",
  ؤ: "و",
  ё: "е",
};

/** Combining marks: Latin accents, Hebrew niqqud and cantillation, Arabic harakat. */
const MARKS = /[̀-֑ͯ-ׇؐ-ًؚ-ٰٟۖ-ۭـ]/g;
/** Quote-like characters inside words (גרש, apostrophes) are ignored. */
const IGNORED = /['’`״׳"]/g;

function foldChar(char: string): string {
  const lower = char.toLowerCase();
  const stripped = lower.normalize("NFKD").replace(MARKS, "").replace(IGNORED, "");
  let out = "";
  for (const c of stripped) out += FOLD[c] ?? c;
  return out;
}

/** Normalized text plus, for every normalized character, the index of its original character. */
function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  let index = 0;
  for (const char of text) {
    const f = foldChar(/\s/.test(char) ? " " : char);
    for (let i = 0; i < f.length; i++) map.push(index);
    folded += f;
    index += char.length;
  }
  return { folded, map };
}

export function normalizeForSearch(text: string): string {
  return foldWithMap(text).folded.replace(/\s+/g, " ").trim();
}

/** Search words (duplicates removed, longest first so highlights prefer the longest match). */
export function searchTokens(query: string): string[] {
  const tokens = normalizeForSearch(query)
    .split(/[\s,.;:!?()[\]{}«»"“”„/\\|-]+/)
    .filter((token) => token.length > 0);
  return [...new Set(tokens)].sort((a, b) => b.length - a.length).slice(0, 8);
}

/**
 * Items that contain every search word (in the question or the answer), best first:
 * question matches weigh more, and a question that starts with a word ranks highest.
 */
export function searchFaq(items: FaqEntry[], query: string): FaqMatch[] {
  const tokens = searchTokens(query);
  if (!tokens.length) return items.map((item) => ({ ...item, score: 0 }));
  const out: FaqMatch[] = [];
  for (const item of items) {
    const question = normalizeForSearch(item.question);
    const answer = normalizeForSearch(item.answer);
    let score = 0;
    let all = true;
    for (const token of tokens) {
      const inQuestion = question.indexOf(token);
      const inAnswer = answer.indexOf(token);
      if (inQuestion < 0 && inAnswer < 0) {
        all = false;
        break;
      }
      if (inQuestion >= 0) score += inQuestion === 0 || question[inQuestion - 1] === " " ? 6 : 4;
      if (inAnswer >= 0) score += 1;
    }
    if (all) out.push({ ...item, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Splits `text` into plain and matching parts for <mark> highlighting. */
export function highlightParts(text: string, tokens: string[]): HighlightPart[] {
  if (!text) return [];
  if (!tokens.length) return [{ text, match: false }];
  const { folded, map } = foldWithMap(text);
  const marked = new Array<boolean>(text.length).fill(false);

  for (const token of tokens) {
    let from = 0;
    while (from <= folded.length - token.length) {
      const at = folded.indexOf(token, from);
      if (at < 0) break;
      const start = map[at];
      const lastFolded = at + token.length - 1;
      const end = lastFolded + 1 < map.length ? map[lastFolded + 1] : text.length;
      // A folded character can come from a surrogate pair or a letter + mark: cover all of it.
      let stop = end;
      if (stop <= start) stop = start + 1;
      for (let i = start; i < stop; i++) marked[i] = true;
      from = at + token.length;
    }
  }

  // Marks (niqqud, accents) right after a highlighted letter belong to it.
  for (let i = 1; i < text.length; i++) {
    if (!marked[i] && marked[i - 1] && /[̀-֑ͯ-ׇً-ٰٟ]/.test(text[i])) marked[i] = true;
  }

  const parts: HighlightPart[] = [];
  let current = "";
  let state = marked[0];
  for (let i = 0; i < text.length; i++) {
    if (marked[i] !== state) {
      if (current) parts.push({ text: current, match: state });
      current = "";
      state = marked[i];
    }
    current += text[i];
  }
  if (current) parts.push({ text: current, match: state });
  return parts;
}
