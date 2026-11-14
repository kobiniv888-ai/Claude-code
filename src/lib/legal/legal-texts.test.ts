import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { accessibilityCoordinator, accessibilityStartupProblems } from "./accessibility";

vi.mock("server-only", () => ({}));

/**
 * The legal drafts (SECURITY_REPORT 15.7.a, 15.8.b, 15.9, 15.10.a, 15.6.b) say what the code does,
 * in all five languages: the retention times come from the cleanup constants (never typed in), every
 * processor the founder listed is named, nobody's personal address is in the text (contact = the
 * support form), and the accessibility coordinator is a setting.
 */
const LOCALES = ["he", "en", "ru", "ar", "ka"] as const;
const legal = (locale: string) => JSON.parse(readFileSync(new URL(`../../../messages/${locale}/legal.json`, import.meta.url), "utf8"));
const account = (locale: string) => JSON.parse(readFileSync(new URL(`../../../messages/${locale}/account.json`, import.meta.url), "utf8"));
/** Every string value inside (keys like "p1" are not text). */
const text = (value: unknown): string =>
  typeof value === "string" ? value : value && typeof value === "object" ? Object.values(value).map(text).join("\n") : "";

describe("privacy policy draft", () => {
  it("quotes every retention time through a value from the code, in every language", () => {
    const placeholders = ["{codeMinutes}", "{codeHours}", "{sessionDays}", "{guestContactMonths}", "{addressDays}", "{caseDays}", "{phoneLookupDays}", "{pushDays}", "{outboxDays}", "{contactClickDays}", "{securityDays}", "{auditDays}", "{deviceDays}", "{backupDays}"];
    for (const locale of LOCALES) {
      const retention = text(legal(locale).privacy.sections.retention) + text(legal(locale).privacy.sections.where);
      for (const p of placeholders) expect(retention, `${locale} ${p}`).toContain(p);
      // No times typed as digits in the retention list (they would drift from the code).
      expect(retention.replace(/\{[a-zA-Z]+\}/g, "").replace(/<todo>[^<]*<\/todo>/g, ""), locale).not.toMatch(/\d/);
    }
  });

  it("names each processor, says the booking email keeps the address, and covers the 18+ rule", () => {
    const processors = ["Vercel", "Neon", "Cloudflare", "Turnstile", "Backblaze", "Resend", "Twilio", "Azure", "CARTO", "Sentry", "Google", "Apple", "Telegram", "Mozilla"];
    for (const locale of LOCALES) {
      const sections = legal(locale).privacy.sections;
      const list = text(sections.processors);
      for (const name of processors) expect(list, `${locale} ${name}`).toContain(name);
      expect(Object.keys(sections)).toEqual(expect.arrayContaining(["processors", "where", "retention", "deletion", "rights", "cookies", "children", "bases"]));
      expect(text(sections.children)).toContain("{minAge}");
      expect(text(sections.retention.list.e)).toContain("{addressDays}");
      expect(text(sections.collect)).toContain("<terms>");
    }
  });

  it("is reached through the support form, never a personal address", () => {
    for (const locale of LOCALES) {
      const doc = legal(locale);
      for (const key of ["privacy", "cookies"] as const) {
        const all = text(doc[key]);
        expect(all, `${locale} ${key}`).not.toContain("<mailto>");
        expect(all, `${locale} ${key}`).not.toMatch(/[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}/i);
      }
      expect(text(doc.privacy.sections.contact.p1)).toContain("<ticket>");
      expect(text(doc.privacy.sections.rights.p2)).toContain("<ticket>");
      // The draft notice for the lawyer sits on every legal page.
      expect(doc.common.draftTitle.length).toBeGreaterThan(5);
    }
  });
});

describe("cookie policy and the account-deletion text", () => {
  it("lists exactly the essential cookies, with their durations, in every language", () => {
    for (const locale of LOCALES) {
      const table = legal(locale).cookies.sections.list.table;
      expect(Object.keys(table.rows).sort(), locale).toEqual(["consent", "currency", "device", "locale", "session"]);
      expect(Object.keys(table.categories), locale).toEqual(["necessary"]);
      expect(text(table.rows.session.duration)).toContain("30");
      expect(text(table.rows.consent.duration)).toContain("180");
      expect(legal(locale).cookies.sections.storage, locale).toBeTruthy();
    }
  });

  it("the deletion text says what stays and for how long, through the code's values", () => {
    for (const locale of LOCALES) {
      const del = account(locale).settings.delete;
      const kept = text(del.kept);
      for (const p of ["{auditDays}", "{securityDays}", "{caseDays}", "{backupDays}"]) expect(kept, `${locale} ${p}`).toContain(p);
      expect(Object.keys(del.kept)).toEqual(["a", "b", "c", "d", "e", "f"]);
      expect(del.keptTitle.length).toBeGreaterThan(3);
      expect(del.keptMore).toContain("<privacy>");
    }
  });

  it("the retention values are the cleanup constants", async () => {
    const { retentionFacts } = await import("./retention-facts");
    const facts = retentionFacts({});
    expect(facts).toMatchObject({
      codeMinutes: "10",
      codeHours: "24",
      sessionDays: "30",
      guestContactMonths: "3",
      addressDays: "7",
      caseDays: "180",
      phoneLookupDays: "90",
      pushDays: "90",
      outboxDays: "90",
      contactClickDays: "90",
      securityDays: "90",
      auditDays: "365",
      deviceDays: "365",
      backupDays: "60",
      minAge: "18",
    });
    expect(retentionFacts({ OFFSITE_RETENTION_DAYS: "90" }).backupDays).toBe("90");
    // The policy's default backup time is the backup job's default.
    const { DEFAULT_OFFSITE_RETENTION_DAYS } = await import("@/lib/admin/maintenance/offsite-config");
    expect(facts.backupDays).toBe(String(DEFAULT_OFFSITE_RETENTION_DAYS));
  });
});

describe("accessibility coordinator (15.6.b)", () => {
  it("comes from the settings and is required on the real site only", () => {
    expect(accessibilityCoordinator({})).toEqual({ name: null, phone: null, email: null });
    expect(
      accessibilityCoordinator({ ACCESSIBILITY_COORDINATOR_NAME: " Noa  Example ", ACCESSIBILITY_COORDINATOR_PHONE: "+972 3 000 0000", ACCESSIBILITY_COORDINATOR_EMAIL: "access@example.com" }),
    ).toEqual({ name: "Noa Example", phone: "+972 3 000 0000", email: "access@example.com" });
    expect(accessibilityCoordinator({ ACCESSIBILITY_COORDINATOR_PHONE: "call me", ACCESSIBILITY_COORDINATOR_EMAIL: "not-an-email" })).toMatchObject({ phone: null, email: null });

    expect(accessibilityStartupProblems({}, "development")).toEqual([]);
    expect(accessibilityStartupProblems({}, "staging")).toEqual([]);
    expect(accessibilityStartupProblems({}, "production").join("\n")).toMatch(/ACCESSIBILITY_COORDINATOR_NAME.*\n.*ACCESSIBILITY_COORDINATOR_PHONE or ACCESSIBILITY_COORDINATOR_EMAIL/);
    expect(accessibilityStartupProblems({ ACCESSIBILITY_COORDINATOR_NAME: "Coordinator", ACCESSIBILITY_COORDINATOR_EMAIL: "a@example.com" }, "production")).toEqual([]);
  });

  it("the statement uses the setting, not a placeholder, in every language", () => {
    for (const locale of LOCALES) {
      const contact = legal(locale).accessibility.sections.contact;
      expect(contact.list.a).toContain("{coordinatorName}");
      expect(contact.list.b).toContain("{coordinatorPhone}");
      expect(contact.list.c).toContain("{coordinatorEmail}");
      expect(text(contact)).not.toContain("<todo>");
      expect(legal(locale).common.toBeAdded.length).toBeGreaterThan(2);
    }
  });
});
