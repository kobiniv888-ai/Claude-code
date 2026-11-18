import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.HASH_SALT ||= "test-salt-unsubscribe-kinds";

const { UNSUBSCRIBE_KINDS, unsubscribeToken, verifyUnsubscribeToken } = await import("./unsubscribe-token");
const { UNSUBSCRIBE_COPY, unsubscribeCopy } = await import("./unsubscribe-view");

const LOCALES = ["he", "en", "ru", "ar", "ka"];

function keysOf(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key));
}

function messagesAt(locale: string, dotted: string): unknown {
  const [namespace, ...rest] = dotted.split(".");
  const file = JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, `${namespace}.json`), "utf8"));
  return rest.reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], file);
}

describe("unsubscribe purposes (round 3, brief 7.4)", () => {
  it("has the saved-search and price-drop kinds, each scoped to its own email", () => {
    expect(UNSUBSCRIBE_KINDS).toEqual(expect.arrayContaining(["weekly_stats", "saved_search", "price_drop"]));
    const token = unsubscribeToken("user-1", "saved_search");
    expect(verifyUnsubscribeToken(token)).toEqual({ userId: "user-1", kind: "saved_search" });
    // A saved-search link can't be turned into a price-drop (or weekly) link.
    const sig = token.split(".")[3];
    expect(verifyUnsubscribeToken(`1.price_drop.user-1.${sig}`)).toBeNull();
    expect(verifyUnsubscribeToken(`1.weekly_stats.user-1.${sig}`)).toBeNull();
  });

  it("gives every kind page texts with the same keys as the weekly email's, in all five languages", () => {
    const expected = keysOf(messagesAt("en", "account.unsubscribe")).sort();
    for (const kind of UNSUBSCRIBE_KINDS) {
      const copy = UNSUBSCRIBE_COPY[kind];
      expect(copy.settingsHref.startsWith("/account/"), kind).toBe(true);
      for (const locale of LOCALES) {
        expect(keysOf(messagesAt(locale, copy.namespace)).sort(), `${kind} ${locale}`).toEqual(expected);
      }
    }
    // A link that can't be read shows the general texts.
    expect(unsubscribeCopy(null)).toBe(UNSUBSCRIBE_COPY.weekly_stats);
    expect(unsubscribeCopy("price_drop").settingsHref).toBe("/account/alerts");
  });
});
