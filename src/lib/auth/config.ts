import "server-only";
import { siteConfig } from "@/config/site";
import { defaultPhoneCountryForLocale } from "./phone-defaults";
import { isDevOtpMode } from "./sms";

/**
 * What the login UI needs to know about the server's configuration. Pass `getLoginConfig(locale)`
 * from a Server Component to <LoginPanel> / <LoginDialogProvider>.
 */

export const authProviders = {
  google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  apple: !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET),
} as const;

export type LoginConfig = {
  providers: { google: boolean; apple: boolean };
  phone: {
    /** How login codes are delivered (TWILIO_VERIFY_CHANNEL). */
    channel: "sms" | "whatsapp";
    /** Development without Twilio: the login form shows the code (GET /api/dev/last-otp). */
    devHints: boolean;
    /** By interface language (+972 for he/en/ru/ar, +995 for ka); the visitor's last pick wins. */
    defaultCountry: string;
    /** Google or Apple is offered: error texts may suggest them; otherwise phone-only wording. */
    socialLogin: boolean;
    /** Countries that can receive codes (siteConfig.phone.smsAllowedCountries). */
    allowedCountries: string[];
  };
};

export function getLoginConfig(locale: string): LoginConfig {
  return {
    providers: { google: authProviders.google, apple: authProviders.apple },
    phone: {
      channel: process.env.TWILIO_VERIFY_CHANNEL === "whatsapp" ? "whatsapp" : "sms",
      devHints: isDevOtpMode(),
      defaultCountry: defaultPhoneCountryForLocale(locale),
      socialLogin: authProviders.google || authProviders.apple,
      allowedCountries: [...siteConfig.phone.smsAllowedCountries],
    },
  };
}
