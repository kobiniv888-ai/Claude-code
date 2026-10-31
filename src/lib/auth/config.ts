import "server-only";
import { siteConfig } from "@/config/site";
import { isDevOtpMode } from "./sms";

/**
 * What the login UI needs to know about the server's configuration. Pass `getLoginConfig()`
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
    defaultCountry: string;
    /** Countries that can receive codes (siteConfig.phone.smsAllowedCountries). */
    allowedCountries: string[];
  };
};

export function getLoginConfig(): LoginConfig {
  return {
    providers: { google: authProviders.google, apple: authProviders.apple },
    phone: {
      channel: process.env.TWILIO_VERIFY_CHANNEL === "whatsapp" ? "whatsapp" : "sms",
      devHints: isDevOtpMode(),
      defaultCountry: siteConfig.phone.defaultCountry,
      allowedCountries: [...siteConfig.phone.smsAllowedCountries],
    },
  };
}
