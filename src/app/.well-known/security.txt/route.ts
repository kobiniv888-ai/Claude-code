import { buildSecurityTxt, securityContactEmail } from "@/lib/security/security-txt";
import { siteUrl } from "@/lib/site-url";

/**
 * GET /.well-known/security.txt (RFC 9116; SECURITY_REPORT 18.1): built from settings on every
 * request (src/lib/security/security-txt.ts), so the security address (SECURITY_CONTACT_EMAIL, a
 * private hosting setting) is never in the repository and Expires is always less than a year ahead.
 * No database. Reachable in maintenance mode too (src/lib/maintenance/mode.ts).
 *
 * Without SECURITY_CONTACT_EMAIL (a codespace) it answers 404: a security.txt without a Contact is
 * not valid. The real site cannot start without it (src/lib/ops-startup.ts).
 */

export const dynamic = "force-dynamic";

export function GET(): Response {
  const contact = securityContactEmail(process.env);
  if (!contact) {
    return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return new Response(buildSecurityTxt({ contact, siteUrl: siteUrl(), now: new Date() }), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
