import { handleEmailBounce, handleEmailDelivered } from "@/lib/booking/alerts";
import { parseResendEvent, svixHeadersOf, verifySvixSignature } from "@/lib/email/webhook";
import { rateLimitByIp, rateLimitHeaders } from "@/lib/rate-limit";

/**
 * POST /api/webhooks/resend — delivery events from Resend (round 3, founder's answer 4).
 *
 * Set up in Resend → Webhooks: endpoint <SITE_URL>/api/webhooks/resend, events email.bounced,
 * email.complained and email.delivered; put the signing secret ("whsec_…") in
 * RESEND_WEBHOOK_SECRET. Every request must carry a valid Svix signature (checked with
 * node:crypto, src/lib/email/webhook.ts); anything else gets 401 and changes nothing.
 *
 * - email.bounced / email.complained: the founder and (for a host's "new booking" alert) the guest
 *   are told right away, and that address's email channel is paused (src/lib/booking/alerts.ts).
 * - email.delivered: a later email to a paused address arrived, so the channel works again.
 * Other events are acknowledged and ignored. Svix retries on 5xx, so failures answer 500.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = { limit: 300, windowSeconds: 60 };
/** Resend's events are small; anything bigger is not from Resend. */
const MAX_BODY_BYTES = 256 * 1024;

function reply(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return reply(503, { error: "not_configured" });

  const rate = await rateLimitByIp("webhook:resend", LIMIT);
  if (!rate.ok) return reply(429, { error: "rate_limited" }, rateLimitHeaders(rate, LIMIT.limit));

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return reply(413, { error: "too_large" });
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return reply(413, { error: "too_large" });

  if (!verifySvixSignature({ secret, headers: svixHeadersOf(request.headers), body })) {
    return reply(401, { error: "bad_signature" });
  }

  const event = parseResendEvent(body);
  if (!event) return reply(200, { ok: true, ignored: true });

  try {
    if (event.kind === "delivered") {
      const { resumed } = await handleEmailDelivered(event);
      return reply(200, { ok: true, resumed: resumed.length });
    }
    const result = await handleEmailBounce(event);
    return reply(200, { ok: true, duplicate: result.duplicate, paused: result.paused.length });
  } catch (error) {
    console.error(`[webhook:resend] ${event.kind} could not be handled:`, error);
    return reply(500, { error: "failed" });
  }
}
