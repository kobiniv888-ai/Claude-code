import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import { locales } from "@/config/site";
import { auditActionKey } from "./audit-labels";

/**
 * Admin texts: every audit action has a label in every language (the audit list, the booking
 * history and the report timeline would show the raw code), Russian plurals don't treat 21 as
 * "one listing", and Hebrew uses the founder's spellings (docs/redesign/hebrew-notes.md).
 */

const ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(ROOT, "src");
const messages = (locale: string, file: string) => JSON.parse(readFileSync(path.join(ROOT, "messages", locale, `${file}.json`), "utf8"));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "generated" ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** Audit actions built at run time (template strings), spelled out. */
const DYNAMIC_ACTIONS = [
  "alerts.email_paused",
  "alerts.email_resumed",
  "alerts.telegram_paused",
  "alerts.telegram_resumed",
  "email.bounced",
  "email.complained",
  "article.update",
  "article.publish",
  "article.unpublish",
];

function auditActions(): string[] {
  const found = new Set<string>(DYNAMIC_ACTIONS);
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    if (!text.includes("audit(") && !text.includes("_ACTION")) continue;
    for (const m of text.matchAll(/\baction:\s*"([a-z][a-z_]*\.[a-z_.]+)"/g)) found.add(m[1]);
    for (const m of text.matchAll(/_ACTION\s*=\s*"([a-z][a-z_]*\.[a-z_.]+)"/g)) found.add(m[1]);
  }
  return [...found].sort();
}

function lookup(tree: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), tree);
}

describe("audit action labels", () => {
  const actions = auditActions();

  it("finds the audit actions in the code", () => {
    expect(actions).toContain("listing.approve");
    expect(actions).toContain("maintenance.cleanup");
    expect(actions.length).toBeGreaterThan(60);
  });

  for (const locale of locales) {
    it(`every action has a label in ${locale}`, () => {
      const admin = messages(locale, "admin");
      const missing = actions.filter((action) => typeof lookup(admin.audit, auditActionKey(action)) !== "string");
      expect(missing).toEqual([]);
    });
  }
});

describe("Russian plurals of hidden listings", () => {
  const format = (file: string, namespace: string, key: string, count: number) => {
    const t = createTranslator({ locale: "ru", messages: { [file]: messages("ru", file) }, namespace: namespace as never });
    return (t as unknown as (k: string, v: Record<string, unknown>) => string)(key, { count, name: "Хозяин", brand: "Bayit" });
  };

  it("21 listings are counted, not called 'your listing'", () => {
    for (const [file, namespace, key] of [
      ["admin", "admin.reports.actions", "hiddenAll"],
      ["admin", "admin.reports.actions", "hideAllDescription"],
      ["emails", "emails.templates.report_host_listings_hidden", "body1"],
    ] as const) {
      expect(format(file, namespace, key, 21), key).toContain("21");
      expect(format(file, namespace, key, 1), key).not.toContain("1 ");
    }
  });
});

describe("Hebrew spellings", () => {
  it("uses 'הכל' and 'דמו' (the founder's choice), never 'הכול' or 'הדגמה'", () => {
    const HE = "֐-׿";
    const banned = new RegExp(`(?<![${HE}])(הכול|הדגמה)(?![${HE}])`);
    const offenders: string[] = [];
    const walk = (node: unknown, where: string) => {
      if (typeof node === "string") {
        if (banned.test(node)) offenders.push(where);
      } else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) walk(value, `${where}.${key}`);
      }
    };
    for (const file of readdirSync(path.join(ROOT, "messages", "he"))) {
      if (file.endsWith(".json")) walk(messages("he", file.replace(/\.json$/, "")), file);
    }
    expect(offenders).toEqual([]);
  });
});
