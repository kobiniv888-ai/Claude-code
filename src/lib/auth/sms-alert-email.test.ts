/**
 * The founder's SMS alerts (SECURITY_REPORT 3.2.c, 3.2.d) and the login-code email (3.1.e) render
 * in all five languages with no missing text, and the code email carries the exact warning.
 */
import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "use-intl/core";
import { describe, expect, it, vi } from "vitest";
import { locales } from "@/config/site";

vi.mock("server-only", () => ({}));

const translationErrors: unknown[] = [];
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const file = path.join(process.cwd(), "messages", locale, `${namespace}.json`);
    const messages = { [namespace]: JSON.parse(fs.readFileSync(file, "utf8")) };
    return createTranslator({ locale, messages, namespace, onError: (e) => translationErrors.push(e) });
  },
}));
vi.mock("@/lib/db", () => ({ db: { emailOutbox: { create: vi.fn(async () => ({})) } } }));

const { renderEmail } = await import("@/lib/email");

const WARNING: Record<string, string> = {
  he: "אל תשתפו את הקוד הזה עם אף אחד.",
  en: "Never share this code.",
  ru: "Никому не сообщайте этот код.",
  ar: "لا تشارك هذا الرمز مع أحد أبدًا.",
  ka: "არასდროს გაუზიაროთ ეს კოდი.",
};

describe("SMS alerts to the founder", () => {
  it.each(locales)("render in %s with the country and the numbers", async (locale) => {
    const kinds = [
      { kind: "sms_budget_warning", reason: "sms_budget", detail: "240 / 300" },
      { kind: "sms_budget_reached", reason: "sms_budget", detail: "300 / 300" },
      { kind: "sms_country_paused", reason: "sms_ratio", country: "IL", detail: "3 / 24 (13%)" },
    ] as const;
    for (const data of kinds) {
      const email = await renderEmail("admin_alert", locale, data);
      expect(email.subject.length, data.kind).toBeGreaterThan(5);
      expect(email.text).toContain(data.detail);
      if ("country" in data) expect(email.text).toContain("IL");
    }
    expect(translationErrors).toEqual([]);
  });
});

describe("login code email (3.1.e)", () => {
  it.each(locales)("says never to share the code, in %s", async (locale) => {
    const email = await renderEmail("login_code", locale, { code: "482913", minutes: 10 });
    expect(email.text).toContain("482913");
    expect(email.text).toContain(WARNING[locale]);
    expect(translationErrors).toEqual([]);
  });
});
