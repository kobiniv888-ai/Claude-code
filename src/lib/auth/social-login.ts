import { cleanFirstName } from "./first-name";

/**
 * Google and Apple sign-in rules (SECURITY_REPORT 3.3). Pure, so they are unit-tested; the login
 * library is configured with them in ./server.ts.
 *
 * - 3.3.a: only the redirect flow with state + PKCE. The ID-token sign-in (a Google ID token
 *   posted to /sign-in/social, with no state and no PKCE) is switched off for every provider.
 *   OAuth tokens are stored encrypted, and the ID token is not stored at all (we never use it).
 * - 3.3.b: only VERIFIED provider emails (`email_verified` true), on sign-up, on sign-in and when
 *   linking. Basic scopes only (the library's defaults: openid, email, profile).
 * - 3.3.c: a Google sign-in NEVER joins an existing account by itself (no implicit linking): it
 *   answers "account_not_linked", and the login page explains how to connect Google from the
 *   settings, which needs a fresh code first (./fresh-proof-rules.ts; the /link-social gate in
 *   ./server.ts) and sends a "new sign-in method" notice.
 *
 * Separate OAuth clients for production and development (exact redirect URLs, no localhost in the
 * production client): OWNER_TODO.md.
 */

/** Our error code for an unverified provider email (shown as `auth.errors.oauth_email_unverified`). */
export const OAUTH_EMAIL_UNVERIFIED = "OAUTH_EMAIL_UNVERIFIED";

type Env = Partial<Record<string, string | undefined>>;

type GoogleProfile = { given_name?: string | null };

/** The `socialProviders` option for the login library (only the providers whose keys are set). */
export function socialProviderOptions(env: Env) {
  const google = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET;
  const apple = env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET;
  return {
    ...(google && {
      google: {
        clientId: env.GOOGLE_CLIENT_ID!,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
        prompt: "select_account" as const,
        disableIdTokenSignIn: true,
        // The first name for "שלום, <name>", so Google sign-ups skip the first-name step.
        mapProfileToUser: (profile: GoogleProfile) => ({ firstName: cleanFirstName(profile.given_name) }),
      },
    }),
    ...(apple && {
      apple: {
        clientId: env.APPLE_CLIENT_ID!,
        // A JWT signed with the Apple key (valid up to 6 months) — see .env.example.
        clientSecret: env.APPLE_CLIENT_SECRET!,
        disableIdTokenSignIn: true,
        ...(env.APPLE_APP_BUNDLE_IDENTIFIER && { appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER }),
      },
    }),
  };
}

/** Is a provider's "email verified" claim really true? (Apple sends the string "true".) */
export function providerEmailVerified(value: unknown): boolean {
  return value === true || value === "true";
}

type ValidateInput = {
  user: { emailVerified?: unknown };
  source: { method: string; oauth?: { providerId: string; profile?: Record<string, unknown> } };
};

/**
 * The login library's `user.validateUserInfo` gate: refuses an OAuth sign-up, sign-in or link
 * whose provider email is not verified. Other methods (email and phone codes) pass.
 */
export function validateOAuthUserInfo({ user, source }: ValidateInput): { error: string; errorDescription: string } | undefined {
  if (source.method !== "oauth") return undefined;
  const claim = source.oauth?.profile?.email_verified;
  const verified = providerEmailVerified(user.emailVerified) && (claim === undefined || providerEmailVerified(claim));
  if (verified) return undefined;
  return { error: OAUTH_EMAIL_UNVERIFIED, errorDescription: "This Google or Apple email address is not verified" };
}

export const ACCOUNT_LINKING_OPTIONS = {
  enabled: true,
  // Never "trusted": a provider's email alone never joins an existing account.
  trustedProviders: [] as string[],
  disableImplicitLinking: true,
  // Phone-first accounts have a placeholder email; they connect Google/Apple from their settings
  // while signed in, after a fresh code (the /link-social gate in ./server.ts).
  allowDifferentEmails: true,
};
