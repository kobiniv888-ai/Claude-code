/**
 * The security headers on every response (next.config.ts headers(); SECURITY_REPORT section 10).
 * Pure, so next.config.ts can load it and src/config/security-headers.test.ts can check it.
 * The Content-Security-Policy is per request (a nonce) and lives in src/lib/security/csp.ts.
 *
 * - HSTS for 2 years with subdomains and preload (10.1.b; submitting to the preload list is the
 *   founder's decision once every subdomain serves https: OWNER_TODO).
 * - nosniff, no framing (also frame-ancestors 'none' in the CSP), strict-origin-when-cross-origin.
 * - Permissions-Policy: no camera, microphone, payment or USB; geolocation only for our own
 *   "Use my location" (10.3.c).
 * - Cross-Origin-Opener-Policy: same-origin (10.3.d). Nothing on the site needs a cross-site window
 *   that can talk back: Google and Apple sign-in are full-page redirects (Better Auth's
 *   signIn.social), Turnstile and the YouTube / Vimeo players are iframes (COOP does not apply to
 *   them), and every outside link opens with rel="noopener".
 */
export const SECURITY_HEADERS: readonly { key: string; value: string }[] = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];
