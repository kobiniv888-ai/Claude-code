import "server-only";
import { headers } from "next/headers";
import { fail, ok, type ActionResult } from "@/lib/action";
import { getIpLimitHash, rateLimit, rateLimitByIp } from "@/lib/rate-limit";
import { getDeviceHash } from "@/lib/request";
import { codeDisplayForHeaders } from "./code-display";
import { issueSecurityCode } from "./fresh-proof";
import { SECURITY_CODES_PER_DAY_ACCOUNT, SECURITY_CODES_PER_DAY_IP, maskEmail, type SecurityCodePurpose } from "./fresh-proof-rules";
import { limitCodeSend, refundCodeSend } from "./login-rate-limit";
import { sendSecurityCodeEmail } from "./security-notices";
import { emailCodeRoute } from "./sms";

/**
 * Emails a security code ("confirm it's you", the 2-step unlock, a new contact address) under the
 * SAME per-inbox rules as login codes (SECURITY_REPORT 3.1.c/f, 3.2.b): `limitCodeSend` with the
 * address as the target (Gmail dots and +tags are one inbox) — the 60/120/300/900 s waits, 5 an
 * hour and 10 a day per inbox, 30 a day per IP, 10 per device — plus 10 a day per account. All in
 * one transaction, counted only when a code is issued, stored in RateLimit rows (a clean-up of
 * expired codes does not start the waits again), and one code at a time even for parallel first
 * sends. A code shown on screen in test mode keeps the simpler per-account and per-IP counters.
 */

/** `sent: false`: the wait before another code is not over (`retryAfterSeconds` to go). */
export type CodeSent = { sent: boolean; sentTo: string; retryAfterSeconds: number; screenCode?: string };

export async function sendSecurityCodeWithLimits(input: {
  user: { id: string; isDemo: boolean };
  purpose: SecurityCodePurpose;
  /** The address the code goes to (the login email, or the new contact address). */
  to: string;
  /** What the code is for besides the account (the new contact address), part of its HMAC. */
  bindTo?: string;
}): Promise<ActionResult<CodeSent>> {
  const { user, purpose, to } = input;
  const sentTo = maskEmail(to);
  const requestHeaders = await headers();
  const route = emailCodeRoute(requestHeaders);
  const showOnScreen = codeDisplayForHeaders(requestHeaders) !== null && (route === "screen" || user.isDemo);
  const accountKey = `auth:security-code:day:${user.id}`;
  const keys = { ipHash: await getIpLimitHash(), deviceHash: await getDeviceHash().catch(() => null) };

  let nextWait: number | null = null;
  if (route === "email") {
    const decision = await limitCodeSend({ channel: "email", target: to, ...keys, account: { key: accountKey, cap: SECURITY_CODES_PER_DAY_ACCOUNT } });
    if (!decision.ok) {
      if (decision.reason === "wait") return ok({ sent: false, sentTo, retryAfterSeconds: decision.retryAfterSeconds });
      return fail("rate_limited");
    }
    nextWait = decision.nextSendInSeconds;
  } else {
    // Test mode, a code shown on screen: the account's and the IP's daily counters only.
    const [perAccount, perIp] = await Promise.all([
      rateLimit(accountKey, { limit: SECURITY_CODES_PER_DAY_ACCOUNT, windowSeconds: 86_400 }),
      rateLimitByIp("auth:security-code:day", { limit: SECURITY_CODES_PER_DAY_IP, windowSeconds: 86_400 }),
    ]);
    if (!perAccount.ok || !perIp.ok) return fail("rate_limited");
  }

  const issued = await issueSecurityCode({ userId: user.id, purpose, bindTo: input.bindTo, enforceWait: route !== "email" });
  if (!issued.ok) return ok({ sent: false, sentTo, retryAfterSeconds: issued.retryAfterSeconds });
  const sent = await sendSecurityCodeEmail({ userId: user.id, to, code: issued.code, purpose });
  if (!sent && !showOnScreen) {
    if (route === "email") await refundCodeSend({ channel: "email", target: to, ...keys });
    return fail("email_unavailable");
  }
  return ok({ sent: true, sentTo, retryAfterSeconds: nextWait ?? issued.nextWaitSeconds, ...(showOnScreen ? { screenCode: issued.code } : {}) });
}
