import { createHash } from "node:crypto";
import { rateLimit, rateLimitByIp, resetRateLimit } from "@/lib/rate-limit";
import { CSP_REPORT_CONTENT_TYPES, CSP_REPORT_MAX_BYTES, parseCspReports, type CspViolation } from "@/lib/security/csp-report";
import { recordSecurityEvent } from "@/lib/security/events";

/**
 * POST /api/csp-report — Content-Security-Policy violation reports from browsers (SECURITY_REPORT
 * 10.2.c): both policies of src/lib/security/csp.ts send them here (report-uri and report-to).
 * Each violation becomes a "csp_report" security event with only short, non-personal values
 * (src/lib/security/csp-report.ts); the IP is stored hashed, as for every security event.
 *
 * Open to everyone (browsers send no cookie we rely on), so it is limited:
 * - 5 requests a minute per IP, before the body is read;
 * - a violation is written once an hour per kind: its signature (policy, directive, blocked origin,
 *   page path) is remembered for the hour, and repeats are dropped without using the cap below, so
 *   one recurring violation (or one client sending the same report) cannot hide new ones;
 * - 600 NEW kinds an hour for the whole site; when that is reached, one "csp_report_capped" event
 *   is written for the hour (so the founder sees the trial is blinded) and the rest get 429.
 * When the limit store cannot be checked, nothing is written (429, fail closed). Bodies over
 * 16 KB are refused without reading further (413), other content types too (415).
 * → 204 (nothing to say back to a browser).
 */

export const dynamic = "force-dynamic";

const PER_IP = { limit: 5, windowSeconds: 60 };
const CSP_REPORT_SITE_WIDE = { limit: 600, windowSeconds: 3600 };
const HOUR = 3600;
const NO_STORE = { "Cache-Control": "no-store" } as const;

function empty(status: number): Response {
  return new Response(null, { status, headers: NO_STORE });
}

/** The kind of a violation: the same policy, directive, blocked origin and page path. */
function cspSignature(v: Pick<CspViolation, "disposition" | "directive" | "blocked" | "page">): string {
  return createHash("sha256").update(`${v.disposition}|${v.directive}|${v.blocked}|${v.page}`).digest("hex").slice(0, 32);
}

/**
 * True the first time a key is seen in its hour. These are "first time?" markers, not limits: a
 * repeat is expected, so it must not write a "rate_limited" event (failOpen turns that off); a
 * store failure is handled by the caller as a refusal (`failed`), so nothing fails open.
 */
async function firstThisHour(key: string): Promise<{ first: boolean; failed: boolean }> {
  const result = await rateLimit(key, { limit: 1, windowSeconds: HOUR, failOpen: true });
  return { first: result.ok && !result.failed, failed: Boolean(result.failed) };
}

/** The body as text, never more than CSP_REPORT_MAX_BYTES (null when it is larger). */
async function readCapped(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > CSP_REPORT_MAX_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > CSP_REPORT_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: Request) {
  const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!(CSP_REPORT_CONTENT_TYPES as readonly string[]).includes(type)) return empty(415);

  // Per IP, before the body is read; fails closed (a broken store writes nothing).
  const perIp = await rateLimitByIp("csp-report", PER_IP);
  if (!perIp.ok) return empty(429);

  const body = await readCapped(request);
  if (body === null) return empty(413);
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return empty(400);
  }

  for (const v of parseCspReports(payload)) {
    const signatureKey = `csp-report:sig:${cspSignature(v)}`;
    const seen = await firstThisHour(signatureKey);
    if (seen.failed) return empty(429);
    // Already written this hour: dropped, and it does not use the site-wide cap.
    if (!seen.first) continue;
    const siteWide = await rateLimit("csp-report:all", CSP_REPORT_SITE_WIDE);
    if (!siteWide.ok) {
      // Not written, so not "seen": the same kind is written once the cap has room again.
      await resetRateLimit(signatureKey);
      if (!siteWide.failed && (await firstThisHour("csp-report:capped")).first) {
        await recordSecurityEvent({ type: "csp_report_capped", meta: { limit: CSP_REPORT_SITE_WIDE.limit } });
      }
      return empty(429);
    }
    await recordSecurityEvent({
      type: "csp_report",
      meta: { directive: v.directive, blocked: v.blocked, page: v.page, disposition: v.disposition, ...(v.source ? { source: v.source } : {}) },
    });
  }
  return empty(204);
}
