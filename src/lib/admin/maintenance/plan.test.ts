import { describe, expect, it } from "vitest";
import {
  BACKUP_MAX_AGE_MS,
  hasCountryCode,
  isBackupFresh,
  isCleanupName,
  maskPhone,
  planContactMethods,
  planPhone,
  planTitle,
  planUserPhones,
  shorten,
} from "./plan";

describe("planPhone", () => {
  it("drops the national 0 and spaces when the country code is there", () => {
    expect(planPhone("+972 053-123-4567")).toEqual({ status: "changed", from: "+972 053-123-4567", to: "+972531234567" });
    expect(planPhone("+9950555123456")).toEqual({ status: "changed", from: "+9950555123456", to: "+995555123456" });
    expect(planPhone("00972531234567")).toEqual({ status: "changed", from: "00972531234567", to: "+972531234567" });
  });

  it("leaves numbers that are already international alone", () => {
    expect(planPhone("+972531234567")).toEqual({ status: "ok" });
    expect(planPhone("+995555000012")).toEqual({ status: "ok" });
    expect(planPhone("")).toEqual({ status: "ok" });
    expect(planPhone(null)).toEqual({ status: "ok" });
  });

  it("never guesses the country of a number without one", () => {
    expect(planPhone("053-123-4567")).toEqual({ status: "no_country", from: "053-123-4567" });
    expect(planPhone("555 12 34 56")).toEqual({ status: "no_country", from: "555 12 34 56" });
  });

  it("uses the row's country when it is certain", () => {
    expect(planPhone("0555 12 34 56", "GE")).toEqual({ status: "changed", from: "0555 12 34 56", to: "+995555123456" });
  });

  it("reports what is not a phone number", () => {
    expect(planPhone("+12")).toEqual({ status: "invalid", from: "+12" });
    expect(planPhone("call me", "GE")).toEqual({ status: "invalid", from: "call me" });
  });

  it("recognizes a country code in links and with invisible marks", () => {
    expect(hasCountryCode("‏+972 53")).toBe(true);
    expect(hasCountryCode("https://wa.me/972531234567")).toBe(true);
    expect(hasCountryCode("tel:+995555")).toBe(true);
    expect(hasCountryCode("0531234567")).toBe(false);
  });
});

describe("planContactMethods", () => {
  it("rewrites only phone values and keeps everything else", () => {
    const methods = [
      { channel: "WHATSAPP", value: "+972 053-123-4567", order: 0 },
      { channel: "TELEGRAM", value: "@bayit_host", order: 1 },
      { channel: "EMAIL", value: "host@example.com", order: 2 },
      { channel: "PHONE", value: "+995555000014", order: 3 },
      { channel: "TELEGRAM", value: "+9950555000015", order: 4 },
    ];
    const plan = planContactMethods(methods);
    expect(plan.changed).toEqual([
      { channel: "WHATSAPP", from: "+972 053-123-4567", to: "+972531234567" },
      { channel: "TELEGRAM", from: "+9950555000015", to: "+995555000015" },
    ]);
    expect(plan.next).toEqual([
      { channel: "WHATSAPP", value: "+972531234567", order: 0 },
      { channel: "TELEGRAM", value: "@bayit_host", order: 1 },
      { channel: "EMAIL", value: "host@example.com", order: 2 },
      { channel: "PHONE", value: "+995555000014", order: 3 },
      { channel: "TELEGRAM", value: "+995555000015", order: 4 },
    ]);
  });

  it("returns next = null when nothing changes, and lists numbers left for a person", () => {
    const plan = planContactMethods([
      { channel: "WHATSAPP", value: "053-123-4567", order: 0 },
      { channel: "SMS", value: "+1", order: 1 },
    ]);
    expect(plan.next).toBeNull();
    expect(plan.noCountry).toEqual([{ channel: "WHATSAPP", from: "053-123-4567" }]);
    expect(plan.invalid).toEqual([{ channel: "SMS", from: "+1" }]);
    expect(planContactMethods(null).next).toBeNull();
    expect(planContactMethods("nonsense").next).toBeNull();
  });

  it("is idempotent: a second plan on the result changes nothing", () => {
    const first = planContactMethods([{ channel: "VIBER", value: "+972 (053) 1234567", order: 0 }]);
    expect(first.next).not.toBeNull();
    expect(planContactMethods(first.next).next).toBeNull();
  });
});

describe("planUserPhones", () => {
  it("never merges accounts: a rewrite that would equal another account's number is skipped", () => {
    const plan = planUserPhones([
      { id: "a", phoneNumber: "+9720531234567" },
      { id: "b", phoneNumber: "+972531234567" },
      { id: "c", phoneNumber: "+9950555123456" },
    ]);
    expect(plan.updates).toEqual([{ id: "c", from: "+9950555123456", to: "+995555123456" }]);
    expect(plan.collisions).toEqual([{ id: "a", from: "+9720531234567", to: "+972531234567", otherId: "b" }]);
  });

  it("skips two rows that would both become the same number", () => {
    const plan = planUserPhones([
      { id: "a", phoneNumber: "+972 053 123 4567" },
      { id: "b", phoneNumber: "+9720531234567" },
    ]);
    expect(plan.updates).toEqual([]);
    expect(plan.collisions.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("lists numbers without a country code and broken ones", () => {
    const plan = planUserPhones([
      { id: "a", phoneNumber: "0531234567" },
      { id: "b", phoneNumber: "+1" },
    ]);
    expect(plan.noCountry).toEqual([{ id: "a", from: "0531234567" }]);
    expect(plan.invalid).toEqual([{ id: "b", from: "+1" }]);
    expect(plan.updates).toEqual([]);
  });
});

describe("planTitle", () => {
  it("removes emoji and leaves clean titles alone", () => {
    expect(planTitle("\u{1F3D6}\u{FE0F} ORBI CITY \u{1F4CD} sea view")).toEqual({
      status: "changed",
      from: "\u{1F3D6}\u{FE0F} ORBI CITY \u{1F4CD} sea view",
      to: "ORBI CITY sea view",
    });
    expect(planTitle("Sunny flat in Vake")).toEqual({ status: "ok" });
    expect(planTitle("")).toEqual({ status: "ok" });
  });

  it("never leaves an empty title", () => {
    expect(planTitle("\u{1F3D6}\u{FE0F}\u{1F389}")).toEqual({ status: "empty", from: "\u{1F3D6}\u{FE0F}\u{1F389}" });
  });
});

describe("helpers", () => {
  it("masks phone numbers for the examples", () => {
    expect(maskPhone("+995555123456")).toBe("+9955••••••56");
    expect(maskPhone("+972 053-123-4567")).toBe("+9720•••••••67");
    expect(maskPhone("0531234567")).toBe("0531••••67");
    expect(maskPhone("12")).toBe("•••");
  });

  it("knows the clean-up names", () => {
    expect(isCleanupName("phones")).toBe(true);
    expect(isCleanupName("verification-files")).toBe(true);
    expect(isCleanupName("everything")).toBe(false);
  });

  it("needs a backup from the last hour", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    expect(isBackupFresh(new Date(now.getTime() - BACKUP_MAX_AGE_MS + 1000), now)).toBe(true);
    expect(isBackupFresh(new Date(now.getTime() - BACKUP_MAX_AGE_MS - 1000), now)).toBe(false);
    expect(isBackupFresh(new Date(now.getTime() + 10 * 60_000), now)).toBe(false);
    expect(isBackupFresh(null, now)).toBe(false);
    expect(isBackupFresh("not a date", now)).toBe(false);
  });

  it("shortens long text", () => {
    expect(shorten("abc", 5)).toBe("abc");
    expect(shorten("abcdefgh", 5)).toBe("abcd…");
  });
});
