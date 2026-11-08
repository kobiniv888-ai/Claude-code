/**
 * The Content-Security-Policy (SECURITY_REPORT 10.2), built for every page by src/proxy.ts with a
 * fresh nonce. Pure: no server imports, so the proxy and the tests can use it.
 *
 * Two policies (checklist 10.2: "start in report-only mode, fix the reports, then enforce"):
 *
 * - ENFORCED (Content-Security-Policy), today's policy: nonce + 'strict-dynamic' scripts,
 *   object-src 'none', base-uri 'none', frame-ancestors 'none', form-action limited to us and the
 *   Google / Apple sign-in pages, frames for Turnstile, YouTube and Vimeo only, and images/media
 *   from any https address (the loose part the trial below replaces).
 * - STRICT (Content-Security-Policy-Report-Only while CSP_STRICT is not "enforce"): the same, but
 *   images only from us, data: (blur placeholders), blob: (upload previews), our photo bucket
 *   (NEXT_PUBLIC_MEDIA_BASE_URL), the map tiles (src/config/map.ts) and Google account photos;
 *   media only from us, blob: and the bucket.
 *   Violations are sent to CSP_REPORT_PATH (/api/csp-report), which writes a "csp_report"
 *   security event (rate-limited). After a clean week, CSP_STRICT=enforce makes the strict policy
 *   the enforced one (and the report-only header goes away).
 *
 * Both policies report to the same endpoint (report-uri for every browser, report-to for the
 * Reporting API), so a violation of the enforced policy shows up in the log too.
 * Development adds 'unsafe-eval' (React's dev tools) and ws: (hot reload); never in production.
 */

export const CSP_REPORT_PATH = "/api/csp-report";
/** The Reporting API group name (Reporting-Endpoints header + report-to directive). */
export const CSP_REPORT_GROUP = "csp-endpoint";

/** The sign-in pages a login form may be posted to (Google, Apple). */
const SIGN_IN_FORM_TARGETS = ["https://accounts.google.com", "https://appleid.apple.com"];
const FRAME_SOURCES = ["https://challenges.cloudflare.com", "https://www.youtube-nocookie.com", "https://www.youtube.com", "https://player.vimeo.com"];
/** Profile photos of Google accounts (Better Auth keeps the Google picture as the user's image). */
const ACCOUNT_PHOTO_ORIGINS = ["https://lh3.googleusercontent.com"];

export type CspEnv = Partial<Record<string, string | undefined>>;

export type CspOptions = {
  nonce: string;
  /** `next dev`: adds 'unsafe-eval' and ws:/wss:. */
  dev: boolean;
  /** Images and media only from the known hosts (false: any https address, the trial's old rule). */
  strictMedia: boolean;
  /** The public photo bucket's origin ("https://media.bayit.example"), or null. */
  mediaOrigin: string | null;
  /** Map tile origins ("https://a.basemaps.cartocdn.com", …). */
  tileOrigins: readonly string[];
  /** For the Report-Only header: leaves out upgrade-insecure-requests (browsers ignore it there). */
  reportOnly?: boolean;
};

/** "https://media.bayit.example" from NEXT_PUBLIC_MEDIA_BASE_URL, or null (unset, or not plain https). */
export function mediaOriginFrom(env: CspEnv): string | null {
  const raw = env.NEXT_PUBLIC_MEDIA_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The https origins a Leaflet URL template loads tiles from: "https://{s}.basemaps.cartocdn.com/…"
 * with subdomains "abcd" → the four hosts. Anything that is not an https template is skipped.
 */
export function tileOriginsFrom(styles: readonly { url: string; subdomains?: string }[]): string[] {
  const origins = new Set<string>();
  for (const style of styles) {
    const subdomains = style.url.includes("{s}") ? [...(style.subdomains || "abc")] : [""];
    for (const sub of subdomains) {
      try {
        const url = new URL(style.url.replace("{s}", sub).replace(/\{[a-z]+\}/g, "0"));
        if (url.protocol === "https:") origins.add(url.origin);
      } catch {
        // Not a URL template: nothing to allow.
      }
    }
  }
  return [...origins].sort();
}

/** True when CSP_STRICT=enforce: the strict policy is the enforced one (after the report-only week). */
export function strictCspEnforced(env: CspEnv): boolean {
  return env.CSP_STRICT?.trim().toLowerCase() === "enforce";
}

/** One policy as a header value. */
export function buildCsp(options: CspOptions): string {
  const { nonce, dev, strictMedia, mediaOrigin, tileOrigins, reportOnly = false } = options;
  const bucket = mediaOrigin ? [mediaOrigin] : [];
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "https://challenges.cloudflare.com", ...(dev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", strictMedia ? ["'self'", "data:", "blob:", ...bucket, ...tileOrigins, ...ACCOUNT_PHOTO_ORIGINS] : ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", "https://*.ingest.sentry.io", "https://*.ingest.de.sentry.io", ...(dev ? ["ws:", "wss:"] : [])]],
    ["frame-src", FRAME_SOURCES],
    ["media-src", strictMedia ? ["'self'", "blob:", ...bucket] : ["'self'", "blob:", "https:"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    // No <base> element anywhere: a base-uri of 'none' means an injected one can't move our
    // relative links and scripts elsewhere (SECURITY_REPORT 10.2.a).
    ["base-uri", ["'none'"]],
    ["form-action", ["'self'", ...SIGN_IN_FORM_TARGETS]],
    ["frame-ancestors", ["'none'"]],
    ["report-uri", [CSP_REPORT_PATH]],
    ["report-to", [CSP_REPORT_GROUP]],
  ];
  const csp = directives.map(([key, values]) => `${key} ${values.join(" ")}`).join("; ");
  return dev || reportOnly ? csp : `${csp}; upgrade-insecure-requests`;
}

export type CspHeaders = {
  /** The enforced policy (also passed to the app as the request header, for the nonce). */
  enforced: string;
  /** The strict policy on trial, or null once it is enforced. */
  reportOnly: string | null;
  /** The Reporting-Endpoints header value. */
  reportingEndpoints: string;
};

/** Both policies for one response. */
export function cspHeaders(input: { nonce: string; dev: boolean; env: CspEnv; tileOrigins: readonly string[] }): CspHeaders {
  const base = { nonce: input.nonce, dev: input.dev, mediaOrigin: mediaOriginFrom(input.env), tileOrigins: input.tileOrigins };
  const enforceStrict = strictCspEnforced(input.env);
  return {
    enforced: buildCsp({ ...base, strictMedia: enforceStrict }),
    reportOnly: enforceStrict ? null : buildCsp({ ...base, strictMedia: true, reportOnly: true }),
    reportingEndpoints: `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`,
  };
}
