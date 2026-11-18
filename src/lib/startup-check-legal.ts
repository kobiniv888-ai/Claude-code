/**
 * The legal drafts' <todo>…</todo> parts (SECURITY_REPORT 19.e, TS-15): the founder's and the
 * lawyer's still-missing details (company name, address, the lawyer's wording), which the legal
 * pages show publicly as bracketed placeholders (src/components/content/rich.tsx). A PRODUCTION
 * deployment is refused while any is left in any language: scripts/check-startup-env.ts, which
 * scripts/vercel-build.mjs runs before every build. The texts are compiled into the build, so they
 * cannot change after that check; the real site never ships "[Company name]" on its Terms or
 * Privacy. Development and staging show them, as drafts.
 *
 * The problem names the message keys and how many there are, never the text. Pure; the five
 * legal.json files are bundled (imported), so the check works on the hosting too.
 */
import ar from "../../messages/ar/legal.json";
import en from "../../messages/en/legal.json";
import he from "../../messages/he/legal.json";
import ka from "../../messages/ka/legal.json";
import ru from "../../messages/ru/legal.json";

type Site = "development" | "staging" | "production" | null;

const LEGAL_MESSAGES: Record<string, unknown> = { he, en, ru, ar, ka };
const TODO = /<todo>/i;

/** Every "locale:key.path" whose text still has a <todo> part. */
export function legalTodoKeys(messages: Record<string, unknown> = LEGAL_MESSAGES): string[] {
  const out: string[] = [];
  for (const [locale, tree] of Object.entries(messages)) {
    const walk = (value: unknown, key: string) => {
      if (typeof value === "string") {
        if (TODO.test(value)) out.push(`${locale}:${key}`);
      } else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) walk(v, key ? `${key}.${k}` : k);
      }
    };
    walk(tree, "");
  }
  return out;
}

export function legalStartupProblems(site: Site, messages: Record<string, unknown> = LEGAL_MESSAGES): string[] {
  if (site !== "production") return [];
  const keys = legalTodoKeys(messages);
  if (keys.length === 0) return [];
  const sample = [...new Set(keys.map((k) => k.split(":")[1]!))].slice(0, 6).join(", ");
  return [
    `The legal pages still have ${keys.length} unfinished <todo> parts (messages/<locale>/legal.json: ${sample}${keys.length > 6 ? ", …" : ""}): the founder and the lawyer fill them in before launch (OWNER_TODO.md), so the real site never shows "[…]" on its Terms or Privacy.`,
  ];
}
