import { describe, expect, it, vi } from "vitest";
import { installLogScrubber, maskEmail, scrubText, scrubValue } from "./log-scrub";

/** Fake data only: @example.com addresses and +972 50 000 0000-style test numbers. */
describe("scrubText (SECURITY_REPORT 5.l, 16.1)", () => {
  it("masks email addresses", () => {
    expect(scrubText("sent to noa.cohen@example.com today")).toBe("sent to n***@e… today");
    expect(maskEmail("dana@example.com")).toBe("d***@e…");
    expect(maskEmail("broken")).toBe("***");
  });

  it("masks phone numbers in every common spelling", () => {
    for (const phone of ["+972500000017", "+972 50 000 0017", "+972-50-000-0017", "(+972) 50 000 0017", "972500000017", "0500000017"]) {
      const out = scrubText(`call ${phone} now`);
      expect(out, phone).not.toMatch(/0000017|000 0017|000-0017/);
      expect(out).toContain("17");
    }
  });

  it("masks login codes next to the word code / OTP / קוד, and in JSON", () => {
    expect(scrubText("the login code is 482913")).toBe("the login code is [code]");
    expect(scrubText('{"code":"482913"}')).toBe('{"code":"[code]"}');
    expect(scrubText("OTP: 1234")).toBe("OTP: [code]");
    expect(scrubText("קוד 482913")).toBe("קוד [code]");
    expect(scrubText("הקוד שלך לכניסה: 482913")).toBe("הקוד שלך לכניסה: [code]");
    expect(scrubText("Ваш код: 482913")).toBe("Ваш код: [code]");
    // Error codes with letters, HTTP statuses and short numbers stay readable.
    expect(scrubText("Prisma code P2002, status code 500")).toBe("Prisma code P2002, status code 500");
  });

  it("masks IP addresses, exact coordinates and tokens", () => {
    expect(scrubText("from 203.0.113.42")).toBe("from 203.0.x.x");
    expect(scrubText("from 2001:db8:85a3:0:0:8a2e:370:7334")).toBe("from [ip]");
    expect(scrubText("pin 41.710123, 44.770245")).toBe("pin [coord], [coord]");
    expect(scrubText("Authorization: Bearer abcDEF123456789xyz")).toBe("Authorization: Bearer [token]");
    expect(scrubText("GET /api/ical/Xk3vQ9_aZ0-pL7mN2bR8sT4uW6yA1cE5dF7gH9jK0lM.ics")).toBe("GET /api/ical/[token].ics");
    expect(scrubText("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLXZhbHVl")).toBe("jwt [token]");
  });

  it("masks credentials in connection strings and values in query strings", () => {
    expect(scrubText("postgresql://bayit:s3cretpass@db.example.com:5432/bayit")).toBe("postgresql://***@db.example.com:5432/bayit");
    expect(scrubText("GET /he/search?q=dana&phone=%2B972500000017&page=2")).toBe("GET /he/search?q=…&phone=…&page=…");
  });

  it("keeps ids, dates, times, durations and versions readable", () => {
    const line = "[cron] cleanup done in 1234 ms on 2026-11-08T11:20:33.123Z for listing cmhq3x0ab0001s6u7v8w9x0y1 (next 16.4.5), booking BT-7K3Q9";
    expect(scrubText(line)).toBe(line);
  });

  it("is idempotent", () => {
    const once = scrubText("noa@example.com +972500000017 code 482913 203.0.113.42 41.710123");
    expect(scrubText(once)).toBe(once);
  });
});

describe("scrubValue", () => {
  it("scrubs errors (message, stack, cause) without touching the original", () => {
    const cause = new Error("lookup of +972500000017 failed");
    const error = Object.assign(new Error("Unique constraint failed on email noa@example.com", { cause }), { code: "P2002", digest: "42" });
    const copy = scrubValue(error) as Error & { code: string; digest: string; cause: Error };
    expect(copy).toBeInstanceOf(Error);
    expect(copy.message).toBe("Unique constraint failed on email n***@e…");
    expect(copy.stack).not.toContain("noa@example.com");
    expect(copy.code).toBe("P2002");
    expect(copy.digest).toBe("42");
    expect(copy.cause.message).not.toContain("0000017");
    expect(error.message).toContain("noa@example.com");
  });

  it("redacts personal keys of plain objects and scrubs nested strings", () => {
    const value = scrubValue({
      bookingId: "cmhq3x0ab0001s6u7v8w9x0y1",
      email: "noa@example.com",
      guestPhone: "+972500000017",
      address: "1 Test Street",
      lat: 41.7101,
      nested: { note: "call +972500000017", list: ["noa@example.com"] },
    });
    expect(value).toEqual({
      bookingId: "cmhq3x0ab0001s6u7v8w9x0y1",
      email: "[redacted]",
      guestPhone: "[redacted]",
      address: "[redacted]",
      lat: "[redacted]",
      nested: { note: "call +97••••••••17", list: ["n***@e…"] },
    });
  });

  it("survives circular references and deep objects", () => {
    const a: Record<string, unknown> = { name: "x" };
    a.self = a;
    expect(scrubValue(a)).toEqual({ name: "x", self: "[circular]" });
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 20; i++) deep = { deep };
    expect(() => scrubValue(deep)).not.toThrow();
  });
});

describe("installLogScrubber", () => {
  it("scrubs every console method's arguments, once", () => {
    const calls: unknown[][] = [];
    const sink = (...args: unknown[]) => void calls.push(args);
    const fake = { log: sink, info: sink, warn: sink, error: sink, debug: sink, trace: sink } as unknown as Console;
    expect(installLogScrubber(fake)).toBe(true);
    expect(installLogScrubber(fake)).toBe(false);
    fake.error("[auth] code for", "noa@example.com", new Error("+972500000017"), { phoneNumber: "+972500000017" });
    fake.info("login code 482913");
    const printed = JSON.stringify(calls.map((args) => args.map((a) => (a instanceof Error ? a.message : a))));
    expect(printed).not.toContain("noa@example.com");
    expect(printed).not.toContain("0000017");
    expect(printed).not.toContain("482913");
  });

  it("never throws from a log call", () => {
    const sink = vi.fn();
    const fake = { log: sink, info: sink, warn: sink, error: sink, debug: sink, trace: sink } as unknown as Console;
    installLogScrubber(fake);
    const hostile = new Proxy({}, { ownKeys: () => { throw new Error("no"); } });
    expect(() => fake.warn(hostile)).not.toThrow();
    expect(sink).toHaveBeenCalledWith("[unloggable]");
  });
});
