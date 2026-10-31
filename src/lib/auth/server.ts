import "server-only";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { captcha } from "better-auth/plugins/captcha";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { siteConfig } from "@/config/site";
import { db } from "@/lib/db";
import { accountBlock } from "./account-status";
import { authProviders } from "./config";
import { AUTH_HOOK_ERRORS } from "./error-codes";
import { linkDevice, sendWelcomeEmail } from "./hooks";
import { limitLoginCodeChecks, limitLoginCodeRequests } from "./login-rate-limit";
import {
  checkLoginPhoneNumber,
  formatPhoneInternational,
  placeholderEmailForPhone,
} from "./phone";
import { localeFromRequest } from "./request-locale";
import { SmsUnavailableError, checkLoginCode, isTwilioConfigured, sendLoginCode } from "./sms";

/**
 * Better Auth — password-free login with Google, Apple (when configured) and phone codes.
 * 2-step login (TOTP) is our own code: see ./two-factor.ts.
 */

const isProduction = process.env.NODE_ENV === "production";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? siteConfig.url;
const baseURL = process.env.BETTER_AUTH_URL ?? siteUrl;

const OTP_EXPIRES_IN_SECONDS = 300;
const OTP_ALLOWED_ATTEMPTS = 5;

type HookErrorStatus = "BAD_REQUEST" | "FORBIDDEN" | "TOO_MANY_REQUESTS" | "SERVICE_UNAVAILABLE";

/** An error with a stable `code` the login UI translates (see ./error-codes.ts). */
function hookError(status: HookErrorStatus, code: string, message: string) {
  return new APIError(status, { code, message });
}

const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {
  ...(authProviders.google && {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      prompt: "select_account",
    },
  }),
  ...(authProviders.apple && {
    apple: {
      clientId: process.env.APPLE_CLIENT_ID!,
      // A JWT signed with the Apple key (valid up to 6 months) — see .env.example.
      clientSecret: process.env.APPLE_CLIENT_SECRET!,
      ...(process.env.APPLE_APP_BUNDLE_IDENTIFIER && {
        appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER,
      }),
    },
  }),
};

const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;

export const auth = betterAuth({
  appName: siteConfig.name,
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  trustedOrigins: [
    ...new Set([siteUrl, baseURL]),
    // Apple returns to /api/auth/callback/apple with a cross-site form POST.
    ...(authProviders.apple ? ["https://appleid.apple.com"] : []),
  ],

  // Password-free: Google, Apple and phone codes only.
  emailAndPassword: { enabled: false },
  // Better Auth endpoints the site never uses. They answer 404 over HTTP (server code can still
  // call auth.api.*). "/update-user" would let anyone set their own name and photo URL directly,
  // skipping our checks (account settings and /api/account/avatar do that instead); the password
  // and email endpoints do not apply to a password-free site.
  disabledPaths: [
    "/update-user",
    "/update-session",
    "/delete-user",
    "/delete-user/callback",
    "/change-email",
    "/change-password",
    "/verify-password",
    "/sign-in/email",
    "/sign-up/email",
    "/request-password-reset",
    "/reset-password",
    "/send-verification-email",
    "/verify-email",
    "/sign-in/phone-number",
    "/phone-number/request-password-reset",
    "/phone-number/reset-password",
  ],
  socialProviders,
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "apple"],
      // Phone-first accounts have a placeholder email; they can still connect Google/Apple
      // from their settings while signed in.
      allowDifferentEmails: true,
    },
  },

  user: {
    additionalFields: {
      // Set from the NEXT_LOCALE cookie on sign-up (see databaseHooks); never from client input.
      locale: { type: "string", required: false, input: false, returned: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once a day
  },

  advanced: {
    useSecureCookies: isProduction,
  },

  rateLimit: {
    // The browser reads the session on every page view. With the default limit (100 per 10 s per
    // IP and path) visitors sharing one carrier/office IP would start getting 429s. It only reads
    // the caller's own cookie; sign-in and login codes keep their own limits.
    customRules: { "/get-session": false },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/phone-number/send-otp") {
        const check = checkLoginPhoneNumber(ctx.body?.phoneNumber);
        if (!check.ok) {
          throw check.reason === "country_not_supported"
            ? hookError("BAD_REQUEST", AUTH_HOOK_ERRORS.COUNTRY_NOT_SUPPORTED, "SMS codes are not available for this country")
            : hookError("BAD_REQUEST", "INVALID_PHONE_NUMBER", "Invalid phone number");
        }
        if (!(await limitLoginCodeRequests(check.e164))) {
          throw hookError("TOO_MANY_REQUESTS", AUTH_HOOK_ERRORS.RATE_LIMITED, "Too many codes requested");
        }
      }
      if (ctx.path === "/phone-number/verify") {
        if (!(await limitLoginCodeChecks())) {
          throw hookError("TOO_MANY_REQUESTS", AUTH_HOOK_ERRORS.RATE_LIMITED, "Too many attempts");
        }
      }
    }),
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          const locale = localeFromRequest(ctx);
          return locale ? { data: { ...user, locale } } : { data: user };
        },
        after: async (user, ctx) => {
          await linkDevice(user.id);
          await sendWelcomeEmail({ ...user, locale: localeFromRequest(ctx) });
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const user = await db.user.findUnique({
            where: { id: session.userId },
            select: { status: true, suspendedUntil: true },
          });
          const block = user ? accountBlock(user) : "deleted";
          if (block === "suspended") {
            throw hookError("FORBIDDEN", AUTH_HOOK_ERRORS.ACCOUNT_SUSPENDED, "This account is suspended");
          }
          if (block === "banned") {
            throw hookError("FORBIDDEN", AUTH_HOOK_ERRORS.ACCOUNT_BANNED, "This account is blocked");
          }
          if (block === "deleted") {
            throw hookError("FORBIDDEN", AUTH_HOOK_ERRORS.ACCOUNT_DELETED, "This account was deleted");
          }
        },
        after: async (session) => {
          await Promise.all([
            linkDevice(session.userId),
            db.user.update({ where: { id: session.userId }, data: { lastSeenAt: new Date() } }),
          ]).catch((error) => console.error("[auth] could not record sign-in", error));
        },
      },
    },
  },

  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: OTP_EXPIRES_IN_SECONDS,
      allowedAttempts: OTP_ALLOWED_ATTEMPTS,
      phoneNumberValidator: (value) => checkLoginPhoneNumber(value).ok,
      sendOTP: async ({ phoneNumber: to, code }, ctx) => {
        try {
          await sendLoginCode({
            phoneNumber: to,
            devCode: code,
            ttlSeconds: OTP_EXPIRES_IN_SECONDS,
            locale: ctx?.getCookie("NEXT_LOCALE"),
          });
        } catch (error) {
          if (error instanceof SmsUnavailableError) {
            console.error("[auth] could not send login code:", error.message);
            throw hookError("SERVICE_UNAVAILABLE", AUTH_HOOK_ERRORS.SMS_UNAVAILABLE, "Could not send the code");
          }
          throw error;
        }
      },
      // Twilio Verify generates and checks its own codes; without Twilio, Better Auth checks
      // the code it generated (development fallback).
      ...(isTwilioConfigured() && {
        verifyOTP: async ({ phoneNumber: to, code }) => {
          let result;
          try {
            result = await checkLoginCode(to, code);
          } catch (error) {
            console.error("[auth] could not check login code:", (error as Error).message);
            throw hookError("SERVICE_UNAVAILABLE", AUTH_HOOK_ERRORS.SMS_UNAVAILABLE, "Could not check the code");
          }
          if (result === "too_many_attempts") {
            throw hookError("FORBIDDEN", "TOO_MANY_ATTEMPTS", "Too many attempts");
          }
          if (result === "expired") {
            throw hookError("BAD_REQUEST", "OTP_EXPIRED", "The code has expired");
          }
          return result === "approved";
        },
      }),
      signUpOnVerification: {
        getTempEmail: placeholderEmailForPhone,
        getTempName: formatPhoneInternational,
      },
    }),
    ...(turnstileSecret
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: turnstileSecret,
            endpoints: ["/phone-number/send-otp"],
            // The <Turnstile action="login"> widget on the login form.
            expectedAction: "login",
          }),
        ]
      : []),
    // Must stay last: lets server actions set the session cookie.
    nextCookies(),
  ],
});

export type Auth = typeof auth;
