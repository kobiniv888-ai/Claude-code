import "server-only";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { siteConfig } from "@/config/site";
import { db } from "@/lib/db";
import { sessionCreateBlock } from "./account-status";
import { readSiteEnv, testModeOn } from "@/lib/site-env";
import { recordSecurityEvent } from "@/lib/security/events";
import { authIpAddressHeaders, betterAuthRateLimitStorage } from "./auth-rate-limit";
import { codeDisplayForHeaders } from "./code-display";
import { authProviders } from "./config";
import { extraTrustedOrigins } from "./dev-origins";
import { LOGIN_CODE_MAX_ATTEMPTS, LOGIN_CODE_TTL_SECONDS, type CodeSendDecision } from "./code-rules";
import { checkLoginEmail, exactLoginEmail, hashEmailCode, sendLoginEmailCode } from "./email-code";
import { AUTH_HOOK_ERRORS } from "./error-codes";
import { consumeFreshProof, hasFreshProof } from "./fresh-proof";
import { afterSignIn, linkDevice, sendWelcomeEmail } from "./hooks";
import { notifySecurityChange } from "./security-notices";
import { authCookieOptions, secureCookiesFor } from "./session-cookies";
import { ACCOUNT_LINKING_OPTIONS, socialProviderOptions, validateOAuthUserInfo } from "./social-login";
import {
  limitCodeSend,
  limitEmailCodeRequests,
  limitLoginCodeChecks,
  limitLoginCodeRequests,
  refundCodeSend,
  refundConfirmedCodeSend,
  rememberCodeDevice,
} from "./login-rate-limit";
import { checkLoginPhoneNumber, placeholderEmailForPhone } from "./phone";
import { checkPhoneCode, hashPhoneCodeRow } from "./phone-code";
import { isNeutralPhoneSend, neutralSendDelay } from "./phone-neutral";
import { getIpLimitHash } from "@/lib/rate-limit";
import { getDeviceHash } from "@/lib/request";
import { verifyTurnstile } from "@/lib/turnstile";
import { localeFromRequest } from "./request-locale";
import { isTwoFactorPending, needsTwoFactorSession } from "./two-factor-gate";
import { SmsUnavailableError, emailCodeRoute, phoneCodeRoute, sendLoginCode } from "./sms";
import { recordSmsCodeVerified, smsBudgetAvailable, smsPausedFor, smsSourceForThisCall } from "./sms-guard";

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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? siteConfig.url;
const baseURL = process.env.BETTER_AUTH_URL ?? siteUrl;

/** Login codes: 10 minutes, 5 wrong tries (founder's decision 3; ./code-rules.ts). */
export const OTP_EXPIRES_IN_SECONDS = LOGIN_CODE_TTL_SECONDS;
const OTP_ALLOWED_ATTEMPTS = LOGIN_CODE_MAX_ATTEMPTS;

if (testModeOn(process.env)) {
  console.warn(
    "\n[auth] ************************************************************\n" +
      `[auth] Test mode (AUTH_TEST_MODE=true, SITE_ENV=${readSiteEnv(process.env)}): login codes are shown\n` +
      "[auth] on screen, ONLY for this site's own test address (./code-display.ts). The real\n" +
      "[auth] site (SITE_ENV=production) refuses to start with it.\n" +
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

/**
 * Better Auth endpoints that send a code: a Turnstile token is required over HTTP. Google/Apple
 * sign-up has no Turnstile of ours: it relies on the provider's own bot checks (a bot needs a real
 * Google or Apple account), SECURITY_REPORT 3.8.a.
 */
const CODE_SEND_PATHS = new Set(["/phone-number/send-otp", "/email-otp/send-verification-otp"]);

/**
 * A refused code send (./login-rate-limit.ts `limitCodeSend`): 429 with the seconds to wait, in the
 * body (`retryAfter`, read by the login forms) and in Retry-After / X-Retry-After.
 */
function codeLimitError(decision: Extract<CodeSendDecision, { ok: false }>) {
  const code =
    decision.reason === "wait"
      ? AUTH_HOOK_ERRORS.CODE_RESEND_WAIT
      : decision.reason === "daily_cap"
        ? AUTH_HOOK_ERRORS.CODE_DAILY_CAP
        : AUTH_HOOK_ERRORS.RATE_LIMITED;
  const seconds = String(decision.retryAfterSeconds);
  return new APIError(
    "TOO_MANY_REQUESTS",
    { code, message: "Please wait before asking for another code", retryAfter: decision.retryAfterSeconds },
    { "Retry-After": seconds, "X-Retry-After": seconds },
  );
}

/** The visitor's hashed IP (an IPv6 address by its /64) and device id for the code caps (null when unreadable). */
async function requestKeys() {
  const [ipHash, deviceHash] = await Promise.all([getIpLimitHash(), getDeviceHash().catch(() => null)]);
  return { ipHash, deviceHash };
}

/** Better Auth endpoints that check a login code (the security event log records refusals). */
const LOGIN_CODE_PATHS = new Set(["/sign-in/email-otp", "/phone-number/verify"]);

/**
 * A refused login code: `login_failed` (channel and the error code, never the address). An email
 * code that has just used up its 5 tries is also `login_code_locked` (the plugin answers
 * INVALID_OTP to the 5th wrong try and stores 5 attempts; phone codes record their own lock in
 * ./phone-code.ts).
 */
async function recordLoginCodeFailure(path: string, code: unknown, rawEmail: unknown): Promise<void> {
  const channel = path === "/sign-in/email-otp" ? "email" : "sms";
  const reason = typeof code === "string" && /^[A-Z_]{2,40}$/.test(code) ? code : "UNKNOWN";
  await recordSecurityEvent({ type: "login_failed", meta: { channel, reason } });
  if (channel !== "email" || reason !== "INVALID_OTP") return;
  const email = checkLoginEmail(rawEmail);
  if (!email) return;
  const row = await db.verification
    .findFirst({ where: { identifier: `sign-in-otp-${email}` }, orderBy: { createdAt: "desc" }, select: { value: true } })
    .catch(() => null);
  const attempts = Number.parseInt(row?.value.split(":").pop() ?? "", 10);
  if (Number.isFinite(attempts) && attempts >= OTP_ALLOWED_ATTEMPTS) {
    await recordSecurityEvent({ type: "login_code_locked", meta: { channel: "email" } });
  }
}

// Google / Apple: redirect flow only (no ID-token sign-in), verified emails only, no automatic
// joining of an existing account (SECURITY_REPORT 3.3, ./social-login.ts).
const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = socialProviderOptions(process.env);

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
    // Removing Google/Apple goes through our own action (a fresh code, a notice, never the last
    // way to sign in): src/lib/account/actions.ts unlinkSocialAccount.
    "/unlink-account",
  ],
  socialProviders,
  account: {
    // A Google sign-in never joins an email account by itself: Google is connected from the
    // settings after a fresh code (SECURITY_REPORT 3.3.c, founder's Q8).
    accountLinking: ACCOUNT_LINKING_OPTIONS,
    // Provider tokens are stored encrypted (3.3.a); the ID token is not kept at all (databaseHooks).
    encryptOAuthTokens: true,
  },

  user: {
    // Only verified Google/Apple emails, on sign-up, sign-in and linking (SECURITY_REPORT 3.3.b).
    validateUserInfo: (data) => validateOAuthUserInfo(data),
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

  // "__Host-bayit.*" cookies wherever they are Secure (SECURITY_REPORT 3.5.a, ./session-cookies.ts).
  advanced: {
    ...authCookieOptions(secureCookiesFor(process.env)),
    // The client IP for the limiter and session rows: the same headers as src/lib/request.ts.
    ipAddress: { ipAddressHeaders: authIpAddressHeaders(process.env) },
  },

  rateLimit: {
    // The browser reads the session on every page view. With the default limit (100 per 10 s per
    // IP and path) visitors sharing one carrier/office IP would start getting 429s. It only reads
    // the caller's own cookie; sign-in and login codes keep their own limits.
    customRules: { "/get-session": false },
    // In our Postgres table, shared by every server instance and failing closed (12.5.b).
    customStorage: betterAuthRateLimitStorage,
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Phone LOGIN over HTTP only where codes may be shown on screen. Server code (the phone
      // check for bookings and hosts, ./phone-check-actions.ts) calls auth.api without a request.
      if (PHONE_LOGIN_PATHS.has(ctx.path) && ctx.request && !codeDisplayForHeaders(ctx.headers)) {
        throw hookError("FORBIDDEN", AUTH_HOOK_ERRORS.PHONE_LOGIN_DISABLED, "Phone login is not available");
      }
      // Turnstile before ANY code, checked on the server and failing closed (SECURITY_REPORT 3.2.b,
      // src/lib/turnstile.ts). Server calls without a request (the phone check, which verified its
      // own token in ./phone-check-actions.ts) skip it here.
      if (CODE_SEND_PATHS.has(ctx.path) && ctx.request) {
        if (!(await verifyTurnstile(ctx.headers?.get("x-captcha-response"), { expectedAction: "login" }))) {
          throw hookError("FORBIDDEN", "VERIFICATION_FAILED", "Captcha verification failed");
        }
      }
      if (ctx.path === "/phone-number/send-otp") {
        // Only mobile numbers in Israel and Georgia, before anything is sent (SECURITY_REPORT 3.2.a/e).
        const check = checkLoginPhoneNumber(ctx.body?.phoneNumber);
        if (!check.ok) {
          throw check.reason === "country_not_supported"
            ? hookError("BAD_REQUEST", AUTH_HOOK_ERRORS.COUNTRY_NOT_SUPPORTED, "SMS codes are not available for this country")
            : check.reason === "not_mobile"
              ? hookError("BAD_REQUEST", AUTH_HOOK_ERRORS.NOT_MOBILE_NUMBER, "SMS codes go to mobile numbers only")
              : hookError("BAD_REQUEST", "INVALID_PHONE_NUMBER", "Invalid phone number");
        }
        // Resend waits, hourly and daily caps for codes that really go out by SMS (counted only when
        // sent). A code shown on screen in test mode (development / staging only) sends nothing and
        // costs nothing: only the hourly request limits apply to it.
        const route = await phoneCodeRoute(check.e164, ctx.headers);
        if (!(await limitLoginCodeRequests(check.e164, { perTarget: route !== "sms" }))) {
          throw hookError("TOO_MANY_REQUESTS", AUTH_HOOK_ERRORS.RATE_LIMITED, "Too many codes requested");
        }
        if (route === "sms") {
          // A paused country, or no budget left for this source: refused BEFORE anything is
          // counted (a retry costs the person nothing). Trusted sources go through a pause.
          const source = await smsSourceForThisCall();
          if ((await smsPausedFor(check.country, source)) || !(await smsBudgetAvailable(source.trusted))) {
            throw hookError("SERVICE_UNAVAILABLE", AUTH_HOOK_ERRORS.SMS_PAUSED, "SMS codes are paused right now");
          }
          const decision = await limitCodeSend({ channel: "phone", target: check.e164, ...(await requestKeys()) });
          if (!decision.ok) throw codeLimitError(decision);
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
        // Exactly what the plugin accepts (no spaces around it, a valid address), BEFORE anything is
        // charged: a padded address the plugin then refuses must not use up someone's limits.
        const email = exactLoginEmail(ctx.body?.email);
        if (!email) throw hookError("BAD_REQUEST", AUTH_HOOK_ERRORS.INVALID_EMAIL, "Invalid email address");
        if (emailCodeRoute(ctx.headers) === "unavailable") {
          throw hookError("SERVICE_UNAVAILABLE", AUTH_HOOK_ERRORS.EMAIL_UNAVAILABLE, "Email codes are not set up");
        }
        if (!(await limitEmailCodeRequests(email, { perTarget: emailCodeRoute(ctx.headers) !== "email" }))) {
          throw hookError("TOO_MANY_REQUESTS", AUTH_HOOK_ERRORS.RATE_LIMITED, "Too many codes requested");
        }
        // Resend waits, hourly and daily caps per inbox (and IP, device) for codes that really go out
        // by email, counted only when sent. The same answer whether or not an account exists (3.1.d).
        if (emailCodeRoute(ctx.headers) === "email") {
          const decision = await limitCodeSend({ channel: "email", target: email, ...(await requestKeys()) });
          if (!decision.ok) throw codeLimitError(decision);
        }
      }
      if (ctx.path === "/sign-in/email-otp") {
        if (!exactLoginEmail(ctx.body?.email)) {
          throw hookError("BAD_REQUEST", AUTH_HOOK_ERRORS.INVALID_EMAIL, "Invalid email address");
        }
        // The name comes from the first-name step, the photo from the settings: not from here.
        if (ctx.body?.name !== undefined || ctx.body?.image !== undefined) {
          throw hookError("BAD_REQUEST", "INVALID_INPUT", "Unexpected sign-up fields");
        }
      }
      // Connecting Google/Apple to a signed-in account needs a fresh code (SECURITY_REPORT 3.3.c, 3.6).
      if (ctx.path === "/link-social") {
        const session = await getSessionFromCtx(ctx);
        if (!session || !(await hasFreshProof(session.session.id))) {
          throw hookError("FORBIDDEN", "FRESH_PROOF_REQUIRED", "Confirm it's you with a fresh code first");
        }
        // One code, one change: the proof is spent when the link starts (a failed round trip to
        // Google needs a new code).
        await consumeFreshProof(session.session.id);
      }
      // The phone number changes only through our own phone check (a fresh code, a notice and the
      // other sessions ended: ./phone-check-actions.ts), never through the library's endpoint.
      if (ctx.path === "/phone-number/verify" && ctx.request && (ctx.body as { updatePhoneNumber?: unknown } | undefined)?.updatePhoneNumber) {
        throw hookError("FORBIDDEN", "INVALID_INPUT", "Change the phone number in the settings");
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
    // Refused login codes in the security event log (SECURITY_REPORT 16.2, 3.1.b): never blocks.
    after: createAuthMiddleware(async (ctx) => {
      if (!LOGIN_CODE_PATHS.has(ctx.path)) return;
      const returned = ctx.context.returned;
      if (!isAPIError(returned)) {
        // A code that went out by email was entered: its IP and device share comes back, and this
        // device gets its own allowance for the address next time (3.1.c/f).
        if (ctx.path === "/sign-in/email-otp" && emailCodeRoute(ctx.headers) === "email") {
          const keys = await requestKeys();
          await refundConfirmedCodeSend(keys);
          const email = checkLoginEmail(ctx.body?.email);
          if (email) await rememberCodeDevice({ channel: "email", target: email, deviceHash: keys.deviceHash });
        }
        return;
      }
      await recordLoginCodeFailure(ctx.path, (returned.body as { code?: unknown } | undefined)?.code, ctx.body?.email);
    }),
  },

  databaseHooks: {
    account: {
      create: {
        // The ID token is never needed after sign-in: not stored (SECURITY_REPORT 3.3.a).
        before: async (account) => ({ data: { ...account, idToken: null } }),
        // A login method added to an existing account (not a sign-up): tell the account (3.6.d).
        after: async (account) => {
          const user = await db.user.findUnique({ where: { id: account.userId }, select: { createdAt: true } }).catch(() => null);
          if (!user || Date.now() - user.createdAt.getTime() < 2 * 60 * 1000) return;
          await notifySecurityChange({ userId: account.userId, kind: "login_method_added", provider: account.providerId });
        },
      },
      update: {
        before: async (account) => ({ data: { ...account, ...("idToken" in account ? { idToken: null } : {}) } }),
      },
    },
    verification: {
      create: {
        // Phone codes never reach the database in plain text: Better Auth's phone-number plugin
        // writes "<code>:<attempts>", stored here as a keyed hash (./phone-code.ts).
        before: async (verification) => {
          const hashed = hashPhoneCodeRow(verification);
          return hashed ? { data: { ...verification, value: hashed } } : { data: verification };
        },
      },
    },
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
            select: { status: true, suspendedUntil: true, isDemo: true },
          });
          // Demo accounts never sign in on the real site (SECURITY_REPORT 3.4.c, decision 1); no
          // session for a blocked or missing account (./account-status.ts sessionCreateBlock).
          const block = sessionCreateBlock(user, process.env);
          if (block === "demo_disabled") {
            throw hookError("FORBIDDEN", AUTH_HOOK_ERRORS.DEMO_ACCOUNT_DISABLED, "Demo accounts cannot sign in here");
          }
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
        // Device link, last seen, the fresh proof of a code login, the new-device alert (./hooks.ts).
        after: async (session, ctx) => {
          await afterSignIn(session, ctx?.path);
        },
      },
    },
  },

  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: OTP_EXPIRES_IN_SECONDS,
      allowedAttempts: OTP_ALLOWED_ATTEMPTS,
      // Only a keyed hash is stored (./email-code.ts); the code itself is in the email (and on
      // screen in test mode). Single use, constant-time compare, 5 tries (the plugin).
      storeOTP: { hash: hashEmailCode },
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
        // Founder's answer (5): a phone check for a number another account has stores its code and
        // charges every limit (above), but sends nothing, after a wait like a real send's
        // (./phone-neutral.ts). The answer is the same "sent".
        if (isNeutralPhoneSend()) {
          await neutralSendDelay();
          return;
        }
        const route = await phoneCodeRoute(to, ctx?.headers);
        try {
          await sendLoginCode({
            phoneNumber: to,
            code,
            ttlSeconds: OTP_EXPIRES_IN_SECONDS,
            locale: ctx?.getCookie("NEXT_LOCALE"),
            route,
          });
        } catch (error) {
          if (error instanceof SmsUnavailableError) {
            console.error("[auth] could not send a phone code:", error.message);
            // No text went out: the waits and caps the send hook counted are given back (3.1.c).
            if (route === "sms") await refundCodeSend({ channel: "phone", target: to, ...(await requestKeys()) });
            throw error.reason === "paused"
              ? hookError("SERVICE_UNAVAILABLE", AUTH_HOOK_ERRORS.SMS_PAUSED, "SMS codes are paused right now")
              : error.reason === "limited"
                ? hookError("TOO_MANY_REQUESTS", AUTH_HOOK_ERRORS.RATE_LIMITED, "Too many codes requested")
                : hookError("SERVICE_UNAVAILABLE", AUTH_HOOK_ERRORS.SMS_UNAVAILABLE, "Could not send the code");
          }
          throw error;
        }
      },
      // We always check phone codes ourselves (./phone-code.ts): the stored value is our keyed
      // hash, compared in constant time; atomic attempts; dead after 5 wrong tries; single use.
      verifyOTP: async ({ phoneNumber: to, code }, ctx) => {
        const adapter = ctx?.context.internalAdapter;
        if (!adapter) return false;
        const number = checkLoginPhoneNumber(to);
        const country = number.ok ? number.country : null;
        const right = await checkPhoneCode(adapter, to, code, { country });
        // Confirmed ÷ sent per country (./sms-guard.ts) counts codes that went out by SMS only; the
        // source's brake is released and its IP and device share comes back.
        if (right && country && (await phoneCodeRoute(to, ctx?.headers)) === "sms") {
          await recordSmsCodeVerified(country, await smsSourceForThisCall());
          const keys = await requestKeys();
          await refundConfirmedCodeSend(keys);
          await rememberCodeDevice({ channel: "phone", target: to, deviceHash: keys.deviceHash });
        }
        return right;
      },
      signUpOnVerification: {
        getTempEmail: placeholderEmailForPhone,
        // Never the number itself (bug 8.2): the first-name step names the account.
        getTempName: () => "",
      },
    }),
    // Must stay last: lets server actions set the session cookie.
    nextCookies(),
  ],
});

export type Auth = typeof auth;

/** Where Better Auth's phone-number plugin stores a phone code (kept here for older imports). */
export { phoneOtpIdentifier } from "./phone-code";
