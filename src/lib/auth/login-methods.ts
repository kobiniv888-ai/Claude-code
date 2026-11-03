/**
 * Can anybody log in on the real site? (pure; round 3 brief, section 1). Login is Google and email
 * codes (Resend); phone codes log in only in development / test mode. So in production, without
 * GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET and without RESEND_API_KEY, nobody can log in at all.
 * The server says so loudly at startup (src/instrumentation.ts) and the admin overview and settings
 * show a banner (<LoginMethodsBanner>).
 */

export type LoginMethodsEnv = Partial<
  Record<"NODE_ENV" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "RESEND_API_KEY", string | undefined>
>;

export type LoginMethodsStatus = {
  google: boolean;
  /** Email login codes can be delivered (Resend). */
  emailCodes: boolean;
  /** Production with neither of them: no visitor can log in. */
  noneInProduction: boolean;
};

const set = (value: string | undefined) => !!value?.trim();

export function loginMethodsStatus(env: LoginMethodsEnv): LoginMethodsStatus {
  const google = set(env.GOOGLE_CLIENT_ID) && set(env.GOOGLE_CLIENT_SECRET);
  const emailCodes = set(env.RESEND_API_KEY);
  return { google, emailCodes, noneInProduction: env.NODE_ENV === "production" && !google && !emailCodes };
}

/** The startup warning (English: it is for the server log), or null when a login method is set. */
export function loginMethodsWarning(env: LoginMethodsEnv): string | null {
  if (!loginMethodsStatus(env).noneInProduction) return null;
  const line = "!".repeat(78);
  return [
    line,
    "!! NO LOGIN METHOD IS CONFIGURED: nobody can log in on this site.",
    "!! Set RESEND_API_KEY (email login codes) and/or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET",
    "!! (Google login). Phone codes log in only in development / test mode. See OWNER_TODO.md.",
    line,
  ].join("\n");
}
