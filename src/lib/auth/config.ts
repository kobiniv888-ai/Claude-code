import "server-only";
import { headers } from "next/headers";
import { siteConfig } from "@/config/site";
import { codeDisplayForHeaders, type CodeDisplayMode } from "./code-display";
import { defaultPhoneCountryForLocale } from "./phone-defaults";
import { emailCodeRoute, isSmsServiceConfigured } from "./sms";

/**
 * What the login UI needs to know about the server's configuration. Pass
 * `await getLoginConfig(locale)` from a Server Component to <LoginPanel> / <LoginDialogProvider>
 * / <PhoneCheck>.
 *
 * Order in the login UI (founder request, round 2): Google (when configured), email code (always),
 * phone code (development / test mode only — see ./code-display.ts).
 */

export const authProviders = {
  google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  apple: !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET),
} as const;

export type LoginConfig = {
  providers: { google: boolean; apple: boolean };
  /**
   * Codes may be shown on screen: "development" (NODE_ENV) or "test" (AUTH_TEST_MODE on localhost
   * or a Codespaces preview). The login UI then shows a small "test mode" strip. Null on the real site.
   */
  codeDisplay: CodeDisplayMode | null;
  email: {
    /** Resend is set up, or codes may be shown on screen. Otherwise the form says "not yet". */
    available: boolean;
  };
  phone: {
    /** Phone codes as a way to LOG IN: only in development / test mode (for the demo accounts). */
    login: boolean;
    /** Phone codes can be sent at all (an SMS service, or development / test mode). */
    available: boolean;
    /** How codes are delivered (TWILIO_VERIFY_CHANNEL). */
    channel: "sms" | "whatsapp";
    /** Codes may be shown on screen (GET /api/dev/last-otp, or returned by the phone check). */
    devHints: boolean;
    /** By interface language (+972 for he/en/ru/ar, +995 for ka); the visitor's last pick wins. */
    defaultCountry: string;
    /** Google or Apple is offered: error texts may suggest them; otherwise phone-only wording. */
    socialLogin: boolean;
    /** Countries that can receive codes (siteConfig.phone.smsAllowedCountries). */
    allowedCountries: string[];
  };
};

export async function getLoginConfig(locale: string): Promise<LoginConfig> {
  const requestHeaders = await headers();
  const codeDisplay = codeDisplayForHeaders(requestHeaders);
  return {
    providers: { google: authProviders.google, apple: authProviders.apple },
    codeDisplay,
    email: { available: emailCodeRoute(requestHeaders) !== "unavailable" },
    phone: {
      login: codeDisplay !== null,
      available: codeDisplay !== null || isSmsServiceConfigured(),
      channel: process.env.TWILIO_VERIFY_CHANNEL === "whatsapp" ? "whatsapp" : "sms",
      devHints: codeDisplay !== null,
      defaultCountry: defaultPhoneCountryForLocale(locale),
      socialLogin: authProviders.google || authProviders.apple,
      allowedCountries: [...siteConfig.phone.smsAllowedCountries],
    },
  };
}
