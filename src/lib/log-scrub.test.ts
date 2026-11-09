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
      nested: { note: "a free-text note", info: "call +972500000017", list: ["noa@example.com"] },
    });
    expect(value).toEqual({
      bookingId: "cmhq3x0ab0001s6u7v8w9x0y1",
      email: "[redacted]",
      guestPhone: "[redacted]",
      address: "[redacted]",
      lat: "[redacted]",
      nested: { note: "[redacted]", info: "call +97••••••••17", list: ["n***@e…"] },
    });
  });

  it("survives circular references and deep objects", () => {
    const a: Record<string, unknown> = { kind: "x" };
    a.self = a;
    expect(scrubValue(a)).toEqual({ kind: "x", self: "[circular]" });
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 20; i++) deep = { deep };
    expect(() => scrubValue(deep)).not.toThrow();
  });
});

/**
 * log-scrub-1: what the second layer missed (the reviewer's probes, fake data only). Each case
 * fails on the scrubber as it was before the fix.
 */
describe("scrubText: the probes of log-scrub-1", () => {
  it("removes the argument dump of a Prisma invocation error (minimal and code-frame formats)", () => {
    const minimal =
      '\nInvalid `prisma.booking.findFirst()` invocation:\n\n{\n  where: {\n    guestName: "Noa Fakename",\n    guestPhone: "+995555991234",\n    messageToHost: "Arriving late, flat 5, 12 Fake Street",\n    nights: "two"\n            ~~~~~\n  }\n}\n\nArgument `nights`: Invalid value provided. Expected IntFilter or Int, provided String.';
    const framed =
      '\nInvalid `db.booking.create()` invocation in\n/app/src/lib/booking/service.ts:6:22\n\n  5   try {\n→ 6     await db.booking.create({\n          data: {\n            guestName: "Noa Fakename",\n            cancelReason: "Fake Street 12, flat 5"\n          }\n        })\n\nArgument `nights` is missing.';
    for (const text of [minimal, framed]) {
      const out = scrubText(text);
      expect(out).toContain("[arguments removed]");
      expect(out).toMatch(/Argument `nights`/);
      for (const leak of ["Noa", "Fakename", "Fake Street", "995555991234", "flat 5"]) expect(out).not.toContain(leak);
      expect(scrubText(out)).toBe(out);
    }
  });

  it("masks quoted personal pairs in any text", () => {
    expect(scrubText('saved { guestName: "Noa Fakename", nights: 2 }')).toBe('saved { guestName: "[redacted]", nights: 2 }');
    expect(scrubText('{"messageToHost":"Arriving late, flat 5"}')).toBe('{"messageToHost":"[redacted]"}');
    expect(scrubText("cancelReason='my flat'")).toBe('cancelReason="[redacted]"');
  });

  it("masks compressed IPv6 addresses", () => {
    for (const ip of ["2a02:6b8:0:1::1f", "2001:db8:85a3::8a2e:370:7334", "::1", "fe80::1"]) expect(scrubText(`from ${ip} now`), ip).toBe("from [ip] now");
    // Times, version ranges and "std::" stay.
    expect(scrubText("at 12:30:45 by std::vector Foo::bar")).toBe("at 12:30:45 by std::vector Foo::bar");
  });

  it("masks Israeli and Georgian national numbers and country codes without +", () => {
    for (const phone of ["050-123-4567", "054 123 4567", "02-123-4567", "555 12 34 56", "555-12-34-56", "972-50-123-4567", "995 555 12 34 56"]) {
      const out = scrubText(`call ${phone} now`);
      expect(out, phone).not.toContain(phone);
      expect(out, phone).not.toMatch(/123|12 34|12-34/);
    }
  });

  it("decodes %40 before masking emails", () => {
    expect(scrubText("to noa%40example.com")).toBe("to n***@e…");
  });

  it("masks codes a few words after code / OTP", () => {
    expect(scrubText("OTP sent: 482913")).toBe("OTP sent: [code]");
    expect(scrubText("your login code for Bayit: 482913")).toBe("your login code for Bayit: [code]");
    expect(scrubText("Prisma code P2002, status code 500")).toBe("Prisma code P2002, status code 500");
  });
});

describe("scrubValue: web objects and class instances (log-scrub-1)", () => {
  it("turns Headers, URLSearchParams, FormData and Request into scrubbed plain objects", () => {
    const headers = new Headers({ cookie: "__Host-bayit.session=abc", authorization: "Bearer abcdefghijkl", "x-forwarded-for": "203.0.113.9", accept: "text/html" });
    expect(scrubValue(headers)).toEqual({ accept: "text/html", authorization: "[redacted]", cookie: "[redacted]", "x-forwarded-for": "[redacted]" });
    expect(scrubValue(new URLSearchParams("phone=%2B972500000017&q=noa"))).toEqual({ phone: "…", q: "…" });
    const form = new FormData();
    form.set("guestName", "Noa Fakename");
    expect(scrubValue(form)).toEqual({ guestName: "[redacted]" });
    const request = new Request("https://bayit.example/api/x?token=abc123", { headers: { cookie: "a=b", "user-agent": "test" } });
    expect(scrubValue(request)).toEqual({ method: "GET", url: "https://bayit.example/api/x?token=…", headers: { cookie: "[redacted]", "user-agent": "test" } });
  });

  it("scrubs the own data of other class instances, and leaves harmless ones as they are", () => {
    class LibraryError {
      constructor(
        public detail: string,
        public phone: string,
      ) {}
    }
    expect(scrubValue(new LibraryError("mail noa@example.com", "+972500000017"))).toEqual({ "[class]": "LibraryError", detail: "mail n***@e…", phone: "[redacted]" });
    class Money {
      constructor(public amount: number) {}
    }
    const money = new Money(12);
    expect(scrubValue(money)).toBe(money);
    expect(scrubValue(Buffer.from("noa@example.com"))).toBe("[binary 15 bytes]");
  });

  it("removes the arguments of a real PrismaClientValidationError", async () => {
    const { Prisma } = await import("@/generated/prisma/client");
    const error = new Prisma.PrismaClientValidationError(
      '\nInvalid `prisma.booking.findFirst()` invocation:\n\n{\n  where: {\n    guestName: "Noa Fakename",\n    messageToHost: "Arriving late, flat 5, 12 Fake Street",\n    nights: "two"\n  }\n}\n\nArgument `nights`: Invalid value provided.',
      { clientVersion: "7" },
    );
    const copy = scrubValue(error) as Error;
    expect(copy.name).toBe("PrismaClientValidationError");
    expect(`${copy.message}\n${copy.stack}`).not.toMatch(/Noa|Fake Street|flat 5/);
    expect(copy.message).toContain("Argument `nights`");
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
