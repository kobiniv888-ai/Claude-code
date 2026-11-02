/**
 * Hardening A2: a failed Twilio call must not put the full phone number into the server log.
 * Twilio's error messages repeat the destination number (21211, 21408, Verify 60200).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => () => "" }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/email", () => ({ isEmailDeliveryConfigured: () => false }));

const NUMBER = "+79161234567";

function twilioError(code: number, message: string) {
  return new Response(JSON.stringify({ code, message, more_info: `https://www.twilio.com/docs/errors/${code}`, status: 400 }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

const { sendSms, twilioErrorSummary } = await import("./sms");
const { checkLoginCode, sendLoginCode, SmsUnavailableError } = await import("./auth/sms");

describe("Twilio errors in logs", () => {
  const env = { ...process.env };
  let logged: string[];

  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG_test";
    process.env.TWILIO_VERIFY_SERVICE_SID = "VA_test";
    logged = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps only the status and the Twilio code", async () => {
    const summary = await twilioErrorSummary(twilioError(21211, `The 'To' number ${NUMBER} is not a valid phone number.`));
    expect(summary).toBe("400 (Twilio code 21211)");
    expect(await twilioErrorSummary(new Response("not json", { status: 502 }))).toBe("502 (Twilio code ?)");
  });

  it("sendSms logs a Messaging error without the number", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        twilioError(21408, `Permission to send an SMS has not been enabled for the region indicated by the 'To' number: ${NUMBER}.`),
      ),
    );
    expect(await sendSms({ to: NUMBER, body: "Booking BT-ABCDE" })).toEqual({ ok: false, delivered: false });
    expect(logged.join("\n")).toContain("21408");
    expect(logged.join("\n")).not.toContain(NUMBER);
    expect(logged.join("\n")).not.toContain(NUMBER.slice(1));
  });

  it("Verify send and check errors carry no number", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => twilioError(60200, `Invalid parameter \`To\`: ${NUMBER}`)));
    const sendError = await sendLoginCode({ phoneNumber: NUMBER, code: "123456", ttlSeconds: 300, route: "verify" }).catch((e) => e);
    expect(sendError).toBeInstanceOf(SmsUnavailableError);
    expect(sendError.message).toContain("60200");
    expect(sendError.message).not.toContain(NUMBER.slice(1));

    const checkError = await checkLoginCode(NUMBER, "123456").catch((e) => e);
    expect(checkError).toBeInstanceOf(SmsUnavailableError);
    expect(checkError.message).not.toContain(NUMBER.slice(1));
  });
});
