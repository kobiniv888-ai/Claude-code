"use server";

import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { CONSENT_VERSION } from "@/lib/consent-cookie";
import { assertRateLimitByIp } from "@/lib/rate-limit";
import { legalDocs } from "@/components/content/legal-docs";

/**
 * The record of a visitor's cookie choice (SECURITY_REPORT 15.5, 15.10.a): what they chose, when,
 * on which consent version and which cookie policy, as one AuditLog row ("consent.cookies"; kept
 * AUDIT_LOG_RETENTION_DAYS, longer than the 180-day cookie). No schema change: the banner's cookie
 * keeps the choice in the browser, this row is the site's proof of it. The row holds no personal
 * data beyond the keyed IP fingerprint every audit row has, and the account id when signed in.
 * Public (the banner shows before sign-in), rate-limited per IP; a failed write never blocks the
 * banner (the choice is saved in the cookie either way).
 */

const COOKIE_CONSENT_METHODS = ["accept_all", "necessary_only", "custom"] as const;

const consentSchema = z
  .object({
    preferences: z.boolean(),
    analytics: z.boolean(),
    v: z.literal(CONSENT_VERSION),
    method: z.enum(COOKIE_CONSENT_METHODS),
  })
  .strict();

export async function recordCookieConsent(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = consentSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimitByIp("consent:cookies", { limit: 20, windowSeconds: 60 * 60 });
    const user = await getCurrentUser().catch(() => null);
    await audit({
      actorId: user?.twoFactorVerified ? user.id : null,
      action: "consent.cookies",
      targetType: "CookieConsent",
      targetId: null,
      details: { ...parsed.data, policyUpdated: legalDocs.cookies.lastUpdated },
    });
    return ok();
  });
}
