/**
 * Text messages (SECURITY_REPORT 3.1.e, 3.2.a, 3.2.e, Q9):
 * - a failed Twilio call never puts the full phone number into the server log (hardening A2);
 * - EVERY text goes only to a mobile number in Israel or Georgia, refused before Twilio is called;
 * - login codes go as OUR OWN text through Twilio Messaging, with the "never share" warning in
 *   all five languages, within two SMS parts, after the country pause and the daily budget;
 * - a code is never written to the log.
 */
import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const guard = vi.hoisted(() => ({
  paused: false,
  budgetOk: true,
  sent: vi.fn(),
  released: vi.fn(),
}));

function messages(locale: string) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, "auth.json"), "utf8")) as Record<string, unknown>;
}

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale, messages: { auth: messages(locale) }, namespace: namespace as "auth.sms" }),
}));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: async () => null } } }));
vi.mock("@/lib/email", () => ({ isEmailDeliveryConfigured: () => false }));
vi.mock("./auth/sms-guard", () => ({
  smsSourceForThisCall: async () => ({ userId: null, ipBlock: null, trusted: false }),
  smsPausedFor: async () => guard.paused,
  reserveSmsSend: async () => (guard.budgetOk ? { ok: true, budgetUsed: 1 } : { ok: false, reason: "budget" }),
  releaseSmsSend: async () => guard.released(),
  recordSmsCodeSent: async (country: string) => guard.sent(country),
}));

// Fake test numbers only (+972 50 000 0xxx style).
const IL_MOBILE = "+972500000123";
const GE_MOBILE = "+995555000123";

function twilioError(code: number, message: string) {
  return new Response(JSON.stringify({ code, message, more_info: `https://www.twilio.com/docs/errors/${code}`, status: 400 }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

const { sendSms, twilioErrorSummary } = await import("./sms");
const { codeSmsText, sendLoginCode, SmsUnavailableError } = await import("./auth/sms");

const env = { ...process.env };
let logged: string[];

beforeEach(() => {
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_MESSAGING_SERVICE_SID = "MG_test";
  guard.paused = false;
  guard.budgetOk = true;
  guard.sent.mockClear();
  guard.released.mockClear();
  logged = [];
  const keep = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
  vi.spyOn(console, "error").mockImplementation(keep);
  vi.spyOn(console, "warn").mockImplementation(keep);
  vi.spyOn(console, "info").mockImplementation(keep);
});

afterEach(() => {
  process.env = { ...env };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Twilio errors in logs", () => {
  it("keeps only the status and the Twilio code", async () => {
    const summary = await twilioErrorSummary(twilioError(21211, `The 'To' number ${IL_MOBILE} is not a valid phone number.`));
    expect(summary).toBe("400 (Twilio code 21211)");
    expect(await twilioErrorSummary(new Response("not json", { status: 502 }))).toBe("502 (Twilio code ?)");
  });

  it("sendSms logs a Messaging error without the number", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        twilioError(21408, `Permission to send an SMS has not been enabled for the region indicated by the 'To' number: ${IL_MOBILE}.`),
      ),
    );
    expect(await sendSms({ to: IL_MOBILE, body: "Booking BT-ABCDE" })).toEqual({ ok: false, delivered: false });
    expect(logged.join("\n")).toContain("21408");
    expect(logged.join("\n")).not.toContain(IL_MOBILE);
    expect(logged.join("\n")).not.toContain(IL_MOBILE.slice(1));
  });
});

describe("sendSms: Israel and Georgia mobile numbers only (3.2.a, 3.2.e)", () => {
  it.each([
    ["US premium-rate", "+19005550123"],
    ["UK premium-rate", "+449098790123"],
    ["Russia", "+79161234567"],
    ["UAE", "+971501234567"],
    ["Georgian landline (Tbilisi)", "+995322123456"],
    ["Israeli landline (Jerusalem)", "+97221234567"],
    ["not a number", "hello"],
  ])("refuses %s before calling Twilio", async (_label, to) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await sendSms({ to, body: "Booking BT-ABCDE" })).toEqual({ ok: false, delivered: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends to Israeli and Georgian mobile numbers through the Messaging Service", async () => {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    for (const to of [IL_MOBILE, GE_MOBILE]) {
      expect(await sendSms({ to, body: "Booking BT-ABCDE" })).toEqual({ ok: true, delivered: true });
    }
    const init = fetch.mock.calls[0]![1] as RequestInit;
    expect((init.body as URLSearchParams).get("MessagingServiceSid")).toBe("MG_test");
  });
});

describe("login codes by SMS (our own text, Q9)", () => {
  const WARNINGS: Record<string, string> = {
    he: "אל תשתפו את הקוד הזה עם אף אחד",
    en: "Never share this code",
    ru: "Никому не сообщайте этот код",
    ar: "لا تشارك هذا الرمز",
    ka: "არასდროს გაუზიაროთ ეს კოდი",
  };

  it.each(Object.keys(WARNINGS))("the %s text has the code, 10 minutes and the warning, in at most 2 SMS parts", async (locale) => {
    const text = await codeSmsText({ code: "482913", ttlSeconds: 600, locale });
    expect(text).toContain("482913");
    expect(text).toContain("10");
    expect(text).toContain(WARNINGS[locale]);
    // Non-Latin (and the en curly quotes, if any) send as UCS-2: 67 characters per part when split.
    const ucs2 = /[^\u0000-\u007f]/.test(text);
    expect(text.length).toBeLessThanOrEqual(ucs2 ? 134 : 306);
  });

  it("sends the code as our own text and counts it for the ratio (country only)", async () => {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    await sendLoginCode({ phoneNumber: IL_MOBILE, code: "482913", ttlSeconds: 600, locale: "he", route: "sms" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const params = (fetch.mock.calls[0]![1] as RequestInit).body as URLSearchParams;
    expect(params.get("To")).toBe(IL_MOBILE);
    expect(params.get("Body")).toContain("482913");
    expect(String(fetch.mock.calls[0]![0])).toContain("api.twilio.com/2010-04-01/Accounts/AC_test/Messages.json");
    expect(guard.sent).toHaveBeenCalledWith("IL");
    expect(logged.join("\n")).not.toContain("482913");
  });

  it("sends nothing while the country is paused or the daily budget is used up", async () => {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    guard.paused = true;
    const paused = await sendLoginCode({ phoneNumber: IL_MOBILE, code: "482913", ttlSeconds: 600, route: "sms" }).catch((e: unknown) => e);
    expect(paused).toBeInstanceOf(SmsUnavailableError);
    expect((paused as InstanceType<typeof SmsUnavailableError>).reason).toBe("paused");
    guard.paused = false;
    guard.budgetOk = false;
    const budget = await sendLoginCode({ phoneNumber: GE_MOBILE, code: "482913", ttlSeconds: 600, route: "sms" }).catch((e: unknown) => e);
    expect((budget as InstanceType<typeof SmsUnavailableError>).reason).toBe("paused");
    expect(fetch).not.toHaveBeenCalled();
    expect(guard.sent).not.toHaveBeenCalled();
  });

  it("refuses a number outside the rules even if a caller skipped the checks", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const error = await sendLoginCode({ phoneNumber: "+19005550123", code: "482913", ttlSeconds: 600, route: "sms" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SmsUnavailableError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a Messaging error is SMS unavailable, and the number stays out of the log", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => twilioError(21610, `Attempt to send to unsubscribed recipient ${IL_MOBILE}`)));
    const error = await sendLoginCode({ phoneNumber: IL_MOBILE, code: "482913", ttlSeconds: 600, route: "sms" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SmsUnavailableError);
    // The reserved budget unit goes back: nothing was sent.
    expect(guard.released).toHaveBeenCalledTimes(1);
    expect(guard.sent).not.toHaveBeenCalled();
    expect(logged.join("\n")).not.toContain(IL_MOBILE.slice(1));
    expect(logged.join("\n")).not.toContain("482913");
  });

  it("a code shown on screen (test mode) is not logged, nor the full number", async () => {
    await sendLoginCode({ phoneNumber: IL_MOBILE, code: "482913", ttlSeconds: 600, route: "screen" });
    expect(logged.join("\n")).not.toContain("482913");
    expect(logged.join("\n")).not.toContain(IL_MOBILE.slice(1));
  });
});
