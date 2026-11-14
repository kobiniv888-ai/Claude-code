import "server-only";
import { CaptchaError } from "@/lib/errors";
import { getClientIp } from "@/lib/request";
import { isProductionSite, readSiteEnv } from "@/lib/site-env";

/**
 * Cloudflare Turnstile (invisible CAPTCHA) — server-side check. FAILS CLOSED (SECURITY_REPORT
 * 3.2.b, checklist rule 0.4):
 *
 * - No TURNSTILE_SECRET_KEY: only a DEVELOPMENT site (SITE_ENV=development) skips the check (the
 *   <Turnstile> component then sends the token "dev"). Staging and the real site refuse every
 *   token (they cannot even start without the keys: src/lib/startup-check.ts).
 * - Cloudflare unreachable, a timeout, an error answer: refused.
 * - The token must be for the form that sends it (`expectedAction`, exact match: a token without an
 *   action is refused too) and, outside development, for this site's own address (hostname).
 * - Cloudflare's published TEST keys always pass and carry no action or hostname: accepted on
 *   development and staging sites only, never on the real site.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
let warnedMissing = false;

export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

export type SiteVerifyResponse = {
  success: boolean;
  "error-codes"?: string[];
  action?: string;
  hostname?: string;
  metadata?: { result_with_testing_key?: boolean };
};

type Env = Partial<Record<string, string | undefined>>;

function hostOf(url: string | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** The hostnames a token may come from: this site's configured addresses (none in development: any). */
export function turnstileHostnames(env: Env = process.env): string[] | null {
  if (readSiteEnv(env) === "development") return null;
  const hosts = [env.NEXT_PUBLIC_SITE_URL, env.BETTER_AUTH_URL, env.SITE_URL].map(hostOf).filter((h): h is string => !!h);
  return [...new Set(hosts)];
}

/**
 * Pure: does Cloudflare's answer pass our rules? (`siteverify` already said whether the token is
 * genuine; this adds the action, the hostname and the test-key rule.)
 */
export function acceptSiteVerify(data: SiteVerifyResponse, options: { expectedAction?: string } = {}, env: Env = process.env): boolean {
  if (!data?.success) return false;
  if (data.metadata?.result_with_testing_key === true) return !isProductionSite(env);
  if (options.expectedAction !== undefined && data.action !== options.expectedAction) return false;
  const hosts = turnstileHostnames(env);
  if (hosts !== null) {
    const hostname = data.hostname?.trim().toLowerCase();
    if (!hostname || !hosts.includes(hostname)) return false;
  }
  return true;
}

/**
 * True when the token is valid. Pass `expectedAction` to make sure a token made for one
 * form (e.g. "login") cannot be replayed on another.
 */
export async function verifyTurnstile(
  token?: string | null,
  options: { expectedAction?: string } = {},
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (readSiteEnv() === "development") {
      if (!warnedMissing) {
        warnedMissing = true;
        console.warn("[turnstile] TURNSTILE_SECRET_KEY is not set — CAPTCHA checks are skipped (development site only).");
      }
      return true;
    }
    console.error("[turnstile] TURNSTILE_SECRET_KEY is not set — refusing the request (fail closed).");
    return false;
  }
  if (!token || token.length > 2048) return false;

  const body = new URLSearchParams({ secret, response: token });
  const ip = await getClientIp().catch(() => null);
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[turnstile] siteverify answered ${res.status} — refusing (fail closed)`);
      return false;
    }
    return acceptSiteVerify((await res.json()) as SiteVerifyResponse, options);
  } catch (error) {
    console.error("[turnstile] siteverify failed — refusing (fail closed):", (error as Error)?.message ?? error);
    return false;
  }
}

/** Throws CaptchaError when the token is not valid. */
export async function assertTurnstile(token?: string | null, options?: { expectedAction?: string }): Promise<void> {
  if (!(await verifyTurnstile(token, options))) throw new CaptchaError();
}
