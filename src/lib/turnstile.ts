import "server-only";
import { CaptchaError } from "@/lib/errors";
import { getClientIp } from "@/lib/request";

/**
 * Cloudflare Turnstile (invisible CAPTCHA) — server-side check.
 * When TURNSTILE_SECRET_KEY is not set (development) every token is accepted,
 * and the <Turnstile> component sends the token "dev".
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
let warnedMissing = false;

export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

type SiteVerifyResponse = { success: boolean; "error-codes"?: string[]; action?: string; hostname?: string };

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
    if (process.env.NODE_ENV === "production" && !warnedMissing) {
      warnedMissing = true;
      console.warn("[turnstile] TURNSTILE_SECRET_KEY is not set — CAPTCHA checks are skipped.");
    }
    return true;
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
      console.error(`[turnstile] siteverify answered ${res.status}`);
      return false;
    }
    const data = (await res.json()) as SiteVerifyResponse;
    if (!data.success) return false;
    if (options.expectedAction && data.action && data.action !== options.expectedAction) return false;
    return true;
  } catch (error) {
    console.error("[turnstile] siteverify failed:", error);
    return false;
  }
}

/** Throws CaptchaError when the token is not valid. */
export async function assertTurnstile(token?: string | null, options?: { expectedAction?: string }): Promise<void> {
  if (!(await verifyTurnstile(token, options))) throw new CaptchaError();
}
