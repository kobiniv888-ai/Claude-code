import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { locales } from "@/config/site";
import { listNameArg, nextFocusAfterRemoval } from "./list-text";

const ROOT = path.resolve(__dirname, "../../..");
const messages = (locale: string) => JSON.parse(fs.readFileSync(path.join(ROOT, "messages", locale, "lists.json"), "utf8"));
const visible = (text: string) => text.replace(/\{[^}]+\}/g, "").trim();

describe("accessible names contain the visible label (WCAG 2.5.3, a11y-1)", () => {
  it.each(locales)("%s: 'Change list' and 'Move' start with their visible text", (locale) => {
    const m = messages(locale);
    expect(m.saving.heart.changeFor.startsWith(visible(m.saving.heart.change)), m.saving.heart.changeFor).toBe(true);
    expect(m.page.moveFor.startsWith(visible(m.page.move)), m.page.moveFor).toBe(true);
  });
});

describe("list names inside sentences (bidi-1)", () => {
  it("are isolated, so '2027 Gudauri' keeps its order in a Hebrew sentence", () => {
    expect(listNameArg("2027 Gudauri")).toBe("⁨2027 Gudauri⁩");
  });

  it("every { name } a list component passes to a message goes through listNameArg", () => {
    const files = [
      ...fs.readdirSync(__dirname).filter((f) => f.endsWith(".tsx")).map((f) => path.join(__dirname, f)),
      path.join(ROOT, "src/components/listing/favorite-button.tsx"),
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      for (const match of src.matchAll(/\bt[a-z]?\(\s*"([^"]+)",\s*\{\s*name(?::\s*([^}]+))?\s*\}/g)) {
        const key = match[1];
        const value = (match[2] ?? "").trim();
        // The WhatsApp message is plain text for another app, not a sentence on the page.
        if (key === "whatsappText") continue;
        if (!value.startsWith("listNameArg(")) offenders.push(`${path.basename(file)}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("focus after a card leaves the list (a11y-2)", () => {
  it("goes to the next card, else the previous one, else the heading", () => {
    expect(nextFocusAfterRemoval(["a", "b", "c"], "a")).toBe("b");
    expect(nextFocusAfterRemoval(["a", "b", "c"], "c")).toBe("b");
    expect(nextFocusAfterRemoval(["a"], "a")).toBeNull();
    expect(nextFocusAfterRemoval([], "a")).toBeNull();
  });
});
