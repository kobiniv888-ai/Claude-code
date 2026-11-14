/**
 * /.well-known/security.txt (RFC 9116; SECURITY_REPORT 18.1), built when it is asked for, from
 * settings: never a committed file, so the security address is never in the repository.
 *
 *   Contact              mailto: SECURITY_CONTACT_EMAIL (a PRIVATE setting at the hosting; the real
 *                        site refuses to start without it, src/lib/ops-startup.ts)
 *   Expires              SECURITY_TXT_EXPIRES_DAYS (330) days after today (UTC midnight): always
 *                        less than a year ahead (RFC 9116 2.5.5), worked out again on every request
 *                        so it never lapses; the yearly check that the mailbox still works is an
 *                        OWNER_TODO reminder
 *   Preferred-Languages  he, en
 *   Canonical            <site address>/.well-known/security.txt
 *   Policy               the "Report a security problem" page, in Hebrew and in English
 *
 * Pure (no server imports): the route (src/app/.well-known/security.txt/route.ts), the page and
 * the tests use it.
 */

export const SECURITY_TXT_PATH = "/.well-known/security.txt";
/** The page with the rules (under each language: /he/security, /en/security…). */
export const SECURITY_PAGE_PATH = "/security";
export const SECURITY_TXT_EXPIRES_DAYS = 330;
export const SECURITY_TXT_LANGUAGES = ["he", "en"] as const;

const EMAIL = /^[^\s@<>"',;:/\\]+@[^\s@<>"',;:/\\]+\.[A-Za-z]{2,}$/;

/** SECURITY_CONTACT_EMAIL when it is set and looks like one address; else null. */
export function securityContactEmail(env: Partial<Record<string, string | undefined>>): string | null {
  const raw = env.SECURITY_CONTACT_EMAIL?.trim() ?? "";
  return raw.length <= 254 && EMAIL.test(raw) ? raw : null;
}

/** The Expires date: today (UTC) + SECURITY_TXT_EXPIRES_DAYS, at midnight, so it stays the same all day. */
export function securityTxtExpires(now: Date): Date {
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(day + SECURITY_TXT_EXPIRES_DAYS * 86_400_000);
}

/** The file's text (LF line ends, a trailing new line). `siteUrl` is the site's origin, no slash at the end. */
export function buildSecurityTxt(input: { contact: string; siteUrl: string; now: Date }): string {
  const origin = input.siteUrl.replace(/\/+$/, "");
  const expires = securityTxtExpires(input.now).toISOString().replace(/\.\d{3}Z$/, "Z");
  return [
    "# How to report a security problem: read the policy first. Please do not send other people's personal data.",
    `Contact: mailto:${input.contact}`,
    `Expires: ${expires}`,
    `Preferred-Languages: ${SECURITY_TXT_LANGUAGES.join(", ")}`,
    `Canonical: ${origin}${SECURITY_TXT_PATH}`,
    ...SECURITY_TXT_LANGUAGES.map((locale) => `Policy: ${origin}/${locale}${SECURITY_PAGE_PATH}`),
    "",
  ].join("\n");
}
