import "server-only";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { captcha } from "better-auth/plugins/captcha";
import { emailOTP } from "better-auth/plugins/email-otp";
import { phoneNumber } from "better-auth/plugins/phone-number";
import type { GenericEndpointContext } from "@better-auth/core";
import { siteConfig } from "@/config/site";
import { db } from "@/lib/db";
import { accountBlock } from "./account-status";
import { codeDisplayForHeaders, isTestModeOn } from "./code-display";
import { authProviders } from "./config";
import { extraTrustedOrigins } from "./dev-origins";
import { checkLoginEmail, sendLoginEmailCode } from "./email-code";
import { AUTH_HOOK_ERRORS } from "./error-codes";
import { cleanFirstName } from "./first-name";
import { linkDevice, sendWelcomeEmail } from "./hooks";
import {
  limitEmailCodeRequests,
  limitLoginCodeChecks,
  limitLoginCodeRequests,
} from "./login-rate-limit";
import { checkLoginPhoneNumber, placeholderEmailForPhone } from "./phone";
import { localeFromRequest } from "./request-locale";
import { isTwoFactorPending, needsTwoFactorSession } from "./two-factor-gate";
import {
  SmsUnavailableError,
  checkLoginCode,
  emailCodeRoute,
  isTwilioConfigured,
  phoneCodeRoute,
  sendLoginCode,
} from "./sms";

/**
 * Better Auth — password-free login (redesign round 2, founder request):
 * - Google (and Apple) when their keys are set;
 * - a 6-digit code by email (emailOTP plugin, sent with sendEmail), for everyone;
 * - a 6-digit code by phone (phone-number plugin) as a LOGIN only where codes may be shown on
 *   screen (development, or AUTH_TEST_MODE on localhost / a Codespaces preview — ./code-display.ts),
 *   so testers can sign in as the demo accounts. On the real site phone codes only verify a number
 *   (a guest's booking, a host before posting), through ./phone-check-actions.ts, once per number.
 * 2-step login (TOTP) is our own code: see ./two-factor.ts.
 */

const isProduction = process.env.NODE_ENV === "production";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? siteConfig.url;
const baseURL = process.env.BETTER_AUTH_URL ?? siteUrl;

export const OTP_EXPIRES_IN_SECONDS = 300;
const OTP_ALLOWED_ATTEMPTS = 5;

if (isProduction && isTestModeOn(process.env)) {
  console.warn(
    "\n[auth] ************************************************************\n" +
      "[auth] AUTH_TEST_MODE=true — login codes are shown on screen, but ONLY for\n" +
      "[auth] requests to localhost or a Codespaces preview (*.app.github.dev).\n" +
      "[auth] This must never be set on the real site.\n" +
      "[auth] ************************************************************\n",
  );
}

type HookErrorStatus = "BAD_REQUEST" | "FORBIDDEN" | "TOO_MANY_REQUESTS" | "SERVICE_UNAVAILABLE";

/** Better Auth endpoints of the phone login (HTTP): only where codes may be shown on screen. */
const PHONE_LOGIN_PATHS = new Set(["/phone-number/send-otp", "/phone-number/verify"]);

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
      // The first name for "שלום, <name>", so Google sign-ups skip the first-name step.
      mapProfileToUser: (profile) => ({ firstName: cleanFirstName(profile.given_name) }),
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
    ...new Set([siteUrl, baseURL, ...extraTrustedOrigins()]),
    // Apple returns to /api/auth/callback/apple with a cross-site form POST.
    ...(authProviders.apple ? ["https://appleid.apple.com"] : []),
  ],

  // Password-free: Google, Apple, email codes and (development/test) phone codes.
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
    // Email codes are for signing in only.
    "/email-otp/check-verification-otp",
    "/email-otp/verify-email",
    "/email-otp/request-email-change",
    "/email-otp/change-email",
    "/email-otp/request-password-reset",
    "/email-otp/reset-password",
    "/forget-password/email-otp",
  ],
  socialProviders,
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "apple"],
      // Phone-first accounts have a placeholder email; they can still connect Google/Apple
      // from their settings while signed in. An email-code account and a Google account with the
      // same (verified) address are the same account.
      allowDifferentEmails: true,
    },
  },

  user: {
    additionalFields: {
      // Set from the NEXT_LOCALE cookie on sign-up (see databaseHooks); never from client input.
      locale: { type: "string", required: false, input: false, returned: false },
      // Set by the first-name step (./profile-actions.ts) or from Google; never from sign-in input.
      firstName: { type: "string", required: false, input: false, returned: false },
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
      // Phone LOGIN over HTTP only where codes may be shown on screen. Server code (the phone
      // check for bookings and hosts, ./phone-check-actions.ts) calls auth.api without a request.
      if (PHONE_LOGIN_PATHS.has(ctx.path) && ctx.request && !codeDisplayForHeaders(ctx.headers)) {
        throw hookError("FORBIDDEN", AUTH_HOOK_ERRORS.PHONE_LOGIN_DISABLED, "Phone login is not available");
      }
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
      if (ctx.path === "/phone-number/verify" || ctx.path === "/sign-in/email-otp") {
        if (!(await limitLoginCodeChecks())) {
          throw hookError("TOO_MANY_REQUESTS", AUTH_HOOK_ERRORS.RATE_LIMITED, "Too many attempts");
        }
      }
      if (ctx.path === "/email-otp/send-verification-otp") {
        if (ctx.body?.type !== "sign-in") {
          throw hookError("BAD_REQUEST", "INVALID_OTP_TYPE", "Email codes are for signing in only");
        }
        const email = checkLoginEmail(ctx.body?.email);
        if (!email) throw hookError("BAD_REQUEST", AUTH_HOOK_ERRORS.INVALID_EMAIL, "Invalid email address");
        if (emailCodeRoute(ctx.headers) === "unavailable") {
          throw hookError("SERVICE_UNAVAILABLE", AUTH_HOOK_ERRORS.EMAIL_UNAVAILABLE, "Email codes are not set up");
        }
        if (!(await limitEmailCodeRequests(email))) {
          throw hookError("TOO_MANY_REQUESTS", AUTH_HOOK_ERRORS.RATE_LIMITED, "Too many codes requested");
        }
      }
      if (ctx.path === "/sign-in/email-otp") {
        if (!checkLoginEmail(ctx.body?.email)) {
          throw hookError("BAD_REQUEST", AUTH_HOOK_ERRORS.INVALID_EMAIL, "Invalid email address");
        }
        // The name comes from the first-name step, the photo from the settings: not from here.
        if (ctx.body?.name !== undefined || ctx.body?.image !== undefined) {
          throw hookError("BAD_REQUEST", "INVALID_INPUT", "Unexpected sign-up fields");
        }
      }
      // Sensitive account functions wait for the 2-step code in sessions that need it (./two-factor-gate.ts).
      if (needsTwoFactorSession(ctx.path, ctx.body)) {
        const session = await getSessionFromCtx(ctx);
        if (session) {
          const row = await db.session.findUnique({
            where: { id: session.session.id },
            select: { twoFactorVerifiedAt: true, user: { select: { twoFactorEnabled: true } } },
          });
          if (!row || isTwoFactorPending({ twoFactorEnabled: row.user.twoFactorEnabled, twoFactorVerifiedAt: row.twoFactorVerifiedAt })) {
            throw hookError("FORBIDDEN", AUTH_HOOK_ERRORS.TWO_FACTOR_REQUIRED, "Enter your 2-step login code first");
          }
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
    emailOTP({
      otpLength: 6,
      expiresIn: OTP_EXPIRES_IN_SECONDS,
      allowedAttempts: OTP_ALLOWED_ATTEMPTS,
      // Only a hash is stored; the code itself is in the email (and on screen in dev/test mode).
      storeOTP: "hashed",
      // Better Auth's own limiter (per server instance); ours (Postgres) runs in the hook above.
      rateLimit: { window: 60, max: 5 },
      sendVerificationOTP: async ({ email, otp, type }, ctx) => {
        if (type !== "sign-in") return;
        await sendLoginEmailCode({
          email,
          code: otp,
          ttlSeconds: OTP_EXPIRES_IN_SECONDS,
          locale: ctx?.getCookie("NEXT_LOCALE"),
          route: emailCodeRoute(ctx?.headers),
        });
      },
    }),
    phoneNumber({
      otpLength: 6,
      expiresIn: OTP_EXPIRES_IN_SECONDS,
      allowedAttempts: OTP_ALLOWED_ATTEMPTS,
      phoneNumberValidator: (value) => checkLoginPhoneNumber(value).ok,
      sendOTP: async ({ phoneNumber: to, code }, ctx) => {
        try {
          await sendLoginCode({
            phoneNumber: to,
            code,
            ttlSeconds: OTP_EXPIRES_IN_SECONDS,
            locale: ctx?.getCookie("NEXT_LOCALE"),
            route: await phoneCodeRoute(to, ctx?.headers),
          });
        } catch (error) {
          if (error instanceof SmsUnavailableError) {
            console.error("[auth] could not send a phone code:", error.message);
            throw hookError("SERVICE_UNAVAILABLE", AUTH_HOOK_ERRORS.SMS_UNAVAILABLE, "Could not send the code");
          }
          throw error;
        }
      },
      // Twilio Verify makes and checks its own codes. Codes shown on screen (the demo accounts in
      // development/test mode) are checked here like Better Auth would; without Twilio Verify,
      // Better Auth checks the code it made.
      ...(isTwilioConfigured() && {
        verifyOTP: async ({ phoneNumber: to, code }, ctx) => {
          if ((await phoneCodeRoute(to, ctx?.headers)) === "screen") return checkStoredPhoneCode(ctx, to, code);
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
        // Never the number itself (bug 8.2): the first-name step names the account.
        getTempName: () => "",
      },
    }),
    ...(turnstileSecret
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: turnstileSecret,
            endpoints: ["/phone-number/send-otp", "/email-otp/send-verification-otp"],
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

/**
 * Checks a phone code Better Auth made and stored (value "<code>:<attempts>"), the same way the
 * phone-number plugin does when there is no `verifyOTP`. The plugin deletes it after a match.
 */
async function checkStoredPhoneCode(ctx: GenericEndpointContext | undefined, phone: string, code: string): Promise<boolean> {
  const adapter = ctx?.context.internalAdapter;
  if (!adapter) return false;
  const existing = await adapter.findVerificationValue(phone);
  if (!existing) throw hookError("BAD_REQUEST", "OTP_NOT_FOUND", "No code was sent");
  if (existing.expiresAt < new Date()) {
    await adapter.deleteVerificationByIdentifier(phone);
    throw hookError("BAD_REQUEST", "OTP_EXPIRED", "The code has expired");
  }
  const [value, rawAttempts] = existing.value.split(":");
  const attempts = Number.parseInt(rawAttempts ?? "0", 10) || 0;
  if (attempts >= OTP_ALLOWED_ATTEMPTS) {
    await adapter.deleteVerificationByIdentifier(phone);
    throw hookError("FORBIDDEN", "TOO_MANY_ATTEMPTS", "Too many attempts");
  }
  if (value === code) return true;
  await adapter.deleteVerificationByIdentifier(phone);
  await adapter.createVerificationValue({ identifier: phone, value: `${value}:${attempts + 1}`, expiresAt: existing.expiresAt });
  return false;
}
