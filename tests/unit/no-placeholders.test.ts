import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SECURITY_REPORT 19.e: no leftover placeholder or bracket text reaches users — "[…]", "TODO",
 * "lorem", "XXX" — in any message file of the 5 languages (pages, emails, metadata all read them).
 *
 * The only exceptions, each with its reason:
 *  - OWNER_PENDING: the legal drafts' <todo>…</todo> parts (company details, the lawyer's wording).
 *    They are the founder's and the lawyer's to fill (OWNER_TODO.md, SECURITY_REPORT 19.a, 15.x)
 *    and must be gone before launch: the second test lists them so the gate sees how many are left.
 *  - STAFF_ONLY: text only staff see that has to show a format ("[link](https://…)" is Markdown)
 *    or names a file of the repository.
 */
const MESSAGES = path.join(process.cwd(), "messages");
const PLACEHOLDER = /\[|\]|\bTODO\b|<todo>|lorem|\bXXX\b/i;

const STAFF_ONLY = new Set(["adminContent.json:articles.bodyHint", "auth.json:loginMethods.body"]);
const OWNER_PENDING_FILE = "legal.json";

/** `text` is the start of the string (for the report); the rules look at the whole string. */
type Hit = { file: string; key: string; text: string; full: string };

function hits(): Hit[] {
  const out: Hit[] = [];
  for (const locale of fs.readdirSync(MESSAGES)) {
    const dir = path.join(MESSAGES, locale);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const walk = (value: unknown, key: string) => {
        if (typeof value === "string") {
          if (PLACEHOLDER.test(value)) out.push({ file: `${locale}/${file}`, key, text: value.slice(0, 80), full: value });
        } else if (value && typeof value === "object") {
          for (const [k, v] of Object.entries(value)) walk(v, key ? `${key}.${k}` : k);
        }
      };
      walk(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")), "");
    }
  }
  return out;
}

describe("no placeholders in the interface text (19.e)", () => {
  const all = hits();

  it("has no bracket, TODO, lorem or XXX text outside the listed exceptions", () => {
    const unexpected = all.filter((h) => {
      const name = `${path.basename(h.file)}:${h.key}`;
      if (STAFF_ONLY.has(name)) return false;
      // Owner-pending legal parts: only as <todo>…</todo> rich tags, never as brackets.
      if (path.basename(h.file) === OWNER_PENDING_FILE) return !/<todo>[^<]*<\/todo>/.test(h.full) || /\[|\]|lorem|\bXXX\b/i.test(h.full);
      return true;
    });
    expect(unexpected.map(({ file, key, text }) => ({ file, key, text }))).toEqual([]);
  });

  it("lists what the founder and the lawyer still have to fill in the legal drafts", () => {
    const pending = all.filter((h) => path.basename(h.file) === OWNER_PENDING_FILE);
    // Every language has the same pending parts (none was filled in one language only).
    const perLocale = new Map<string, number>();
    for (const h of pending) perLocale.set(h.file.split("/")[0], (perLocale.get(h.file.split("/")[0]) ?? 0) + 1);
    expect(new Set(perLocale.values()).size).toBeLessThanOrEqual(1);
  });
});
