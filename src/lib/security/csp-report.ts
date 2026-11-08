/**
 * Reading Content-Security-Policy violation reports (POST /api/csp-report, SECURITY_REPORT 10.2.c).
 * Pure, so it is easy to test. Browsers send two formats:
 *
 * - report-uri: `Content-Type: application/csp-report`, `{ "csp-report": { "document-uri", … } }`;
 * - report-to (Reporting API): `Content-Type: application/reports+json`,
 *   `[{ "type": "csp-violation", "url", "body": { "documentURL", "effectiveDirective", … } }]`.
 *
 * Each report becomes a few short, non-personal values for the security log: the directive, the
 * blocked origin (never its path or query: a URL can hold a token), the page's path with long
 * IDs replaced by ":id" and no query, the policy (enforce / report) and the script's origin.
 */

/** The largest body read (a browser report is ~1 KB; a batch of a few is far below this). */
export const CSP_REPORT_MAX_BYTES = 16 * 1024;
/** At most this many reports of one request are written. */
export const CSP_REPORTS_PER_REQUEST = 5;

export const CSP_REPORT_CONTENT_TYPES = ["application/csp-report", "application/reports+json", "application/json"] as const;

export type CspViolation = {
  directive: string;
  blocked: string;
  page: string;
  disposition: "enforce" | "report";
  source: string | null;
};

const KEYWORDS = new Set(["inline", "eval", "data", "blob", "self", "wasm-eval", "trusted-types-policy", "trusted-types-sink"]);

function text(value: unknown, max = 120): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

/** "https://evil.example/x.png?t=1" → "https://evil.example"; "inline" stays "inline"; else "other". */
export function blockedOrigin(value: unknown): string {
  const raw = text(value, 2048);
  if (!raw) return "unknown";
  const keyword = raw.toLowerCase();
  if (KEYWORDS.has(keyword)) return keyword;
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "wss:" || url.protocol === "ws:") return url.origin.slice(0, 120);
    return url.protocol.replace(/:$/, "").slice(0, 20) || "other";
  } catch {
    return "other";
  }
}

/**
 * The page's path without its query, with long or numeric IDs replaced: "/he/lists/AbC…xyz" →
 * "/he/lists/:id", "/he/listing/123-flat" → "/he/listing/:id". Null when it is not a URL.
 */
export function pagePath(value: unknown): string | null {
  const raw = text(value, 2048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const parts = url.pathname
      .split("/")
      .slice(0, 6)
      .map((part) => (/\d/.test(part) || part.length > 24 ? ":id" : part.slice(0, 24)));
    return parts.join("/").slice(0, 120) || "/";
  } catch {
    return null;
  }
}

function directiveOf(value: unknown): string | null {
  // "img-src 'self' data:" (old violated-directive) → "img-src".
  const raw = text(value, 200);
  const name = raw?.split(/\s+/)[0]?.toLowerCase() ?? null;
  return name && /^[a-z-]{3,40}$/.test(name) ? name : null;
}

function one(body: Record<string, unknown>): CspViolation | null {
  const directive = directiveOf(body["effective-directive"] ?? body.effectiveDirective ?? body["violated-directive"] ?? body.violatedDirective);
  if (!directive) return null;
  const disposition = (text(body.disposition) ?? "enforce").toLowerCase() === "report" ? "report" : "enforce";
  const sourceRaw = body["source-file"] ?? body.sourceFile;
  return {
    directive,
    blocked: blockedOrigin(body["blocked-uri"] ?? body.blockedURL ?? body.blockedUri),
    page: pagePath(body["document-uri"] ?? body.documentURL ?? body.documentUri) ?? "unknown",
    disposition,
    source: sourceRaw ? blockedOrigin(sourceRaw) : null,
  };
}

/** The violations in a parsed report body (either format), at most CSP_REPORTS_PER_REQUEST. */
export function parseCspReports(payload: unknown): CspViolation[] {
  const bodies: Record<string, unknown>[] = [];
  const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  if (Array.isArray(payload)) {
    for (const item of payload.slice(0, 50)) {
      if (isObject(item) && item.type === "csp-violation" && isObject(item.body)) bodies.push(item.body);
    }
  } else if (isObject(payload) && isObject(payload["csp-report"])) {
    bodies.push(payload["csp-report"]);
  }
  const out: CspViolation[] = [];
  for (const body of bodies) {
    const violation = one(body);
    if (violation) out.push(violation);
    if (out.length >= CSP_REPORTS_PER_REQUEST) break;
  }
  return out;
}
