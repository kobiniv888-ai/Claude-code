/**
 * The founder's exact Hebrew sentences (SECURITY_REPORT 14.2.b, 13.4.c, 14.2.c, 14.3.c, 19.b):
 * wording changes go through the founder, so a test pins them. Every other language has the
 * same keys (npm run i18n:check).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { locales } from "@/config/site";

function message(locale: string, namespace: string, key: string): string {
  let node: unknown = JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, `${namespace}.json`), "utf8"));
  for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
  return node as string;
}

const PAY_WARNING = "לעולם אל תשלמו מראש בקישור או בהעברה. משלמים למארח כשמגיעים.";
const SCAM_REPORT = "דיווח על הונאה";

describe("founder's exact Hebrew texts", () => {
  it("14.2.b the pay warning on the listing page, the trip page and the booking emails", () => {
    expect(message("he", "listing", "payWarning.text")).toBe(PAY_WARNING);
    expect(message("he", "trips", "safety.note")).toContain(PAY_WARNING);
    expect(message("he", "booking", "noPrepayment")).toContain(PAY_WARNING);
  });

  it("13.4.c the email footer", () => {
    expect(message("he", "emails", "common.safety").replace("{brand}", "בית")).toBe(
      "בית לעולם לא יבקש מכם תשלום בקישור, פרטי כרטיס אשראי או קוד כניסה.",
    );
  });

  it("14.2.c the one-tap scam report button", () => {
    expect(message("he", "listing", "payWarning.report")).toBe(SCAM_REPORT);
    expect(message("he", "emails", "scamReport")).toBe(SCAM_REPORT);
    expect(message("he", "help", "scamReport.title")).toBe(SCAM_REPORT);
  });

  it("14.3.c the contact-changed notice", () => {
    expect(message("he", "trips", "safety.contactChanged.title")).toBe("פרטי הקשר של המארח שונו לאחרונה");
  });

  it("19.b the support reply-time promise (the default of the editable setting)", () => {
    expect(message("he", "help", "replyTime.promise")).toBe(
      "עונים תוך יום עסקים אחד, ראשון עד חמישי. הודעות שנשלחות בשישי או בשבת נענות ביום ראשון.",
    );
  });

  it("has every text in every language", () => {
    for (const locale of locales) {
      for (const [namespace, key] of [
        ["listing", "payWarning.text"],
        ["listing", "payWarning.report"],
        ["trips", "safety.note"],
        ["trips", "safety.contactChanged.title"],
        ["booking", "noPrepayment"],
        ["emails", "common.safety"],
        ["emails", "scamReport"],
        ["help", "replyTime.promise"],
      ]) {
        expect(message(locale, namespace, key), `${locale} ${namespace}.${key}`).toMatch(/\S/);
      }
    }
  });
});
