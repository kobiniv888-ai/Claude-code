import { rateLimit, rateLimitByIp } from "@/lib/rate-limit";
import { CSP_REPORT_CONTENT_TYPES, CSP_REPORT_MAX_BYTES, parseCspReports } from "@/lib/security/csp-report";
import { recordSecurityEvent } from "@/lib/security/events";

/**
 * POST /api/csp-report — Content-Security-Policy violation reports from browsers (SECURITY_REPORT
 * 10.2.c): both policies of src/lib/security/csp.ts send them here (report-uri and report-to).
 * Each violation becomes a "csp_report" security event with only short, non-personal values
 * (src/lib/security/csp-report.ts); the IP is stored hashed, as for every security event.
 *
 * Open to everyone (browsers send no cookie we rely on), so it is limited: 20 requests a minute
 * per IP and 600 an hour for the whole site; over a limit, or when the limit store cannot be
 * checked, nothing is written (429). Bodies over 16 KB are refused without reading further (413),
 * other content types too (415).
 * → 204 (nothing to say back to a browser).
 */

export const dynamic = "force-dynamic";

const PER_IP = { limit: 20, windowSeconds: 60 };
const SITE_WIDE = { limit: 600, windowSeconds: 3600 };
const NO_STORE = { "Cache-Control": "no-store" } as const;

function empty(status: number): Response {
  return new Response(null, { status, headers: NO_STORE });
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

  // Per IP first, then the site-wide cap; both fail closed (a broken store writes nothing).
  const perIp = await rateLimitByIp("csp-report", PER_IP);
  if (!perIp.ok) return empty(429);
  const siteWide = await rateLimit("csp-report:all", SITE_WIDE);
  if (!siteWide.ok) return empty(429);

  const body = await readCapped(request);
  if (body === null) return empty(413);
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return empty(400);
  }

  const violations = parseCspReports(payload);
  await Promise.all(
    violations.map((v) =>
      recordSecurityEvent({
        type: "csp_report",
        meta: { directive: v.directive, blocked: v.blocked, page: v.page, disposition: v.disposition, ...(v.source ? { source: v.source } : {}) },
      }),
    ),
  );
  return empty(204);
}
