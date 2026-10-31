import { locales } from "@/config/site";

/**
 * Validation of the `?next=` parameter used after login, phone verification and 2-step login.
 * Pure, safe on server and client.
 *
 * Only relative, same-site paths are accepted (open-redirect protection). The result never
 * carries a locale prefix: navigation helpers from `@/i18n/navigation` add the current one.
 */

export const DEFAULT_AFTER_LOGIN_PATH = "/account";

const MAX_LENGTH = 1024;
const PLACEHOLDER_ORIGIN = "https://next-path.invalid";

/** Pages that must not be a "next" target (they would loop back to themselves). */
const AUTH_PAGES = ["/login", "/verify-phone", "/two-factor"];

function stripLocale(pathname: string): string {
  const [, first, ...rest] = pathname.split("/");
  if (first && (locales as readonly string[]).includes(first)) {
    return `/${rest.join("/")}`;
  }
  return pathname;
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`));
}

/**
 * Returns a safe, locale-less path (with query and hash) or `fallback`.
 *
 * safeNextPath("/he/listing/12?x=1") → "/listing/12?x=1"
 * safeNextPath("https://evil.example") → "/account"
 * safeNextPath("//evil.example") → "/account"
 */
export function safeNextPath(
  value: unknown,
  fallback: string = DEFAULT_AFTER_LOGIN_PATH,
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return fallback;
  const input = raw.trim();
  if (!input || input.length > MAX_LENGTH) return fallback;

  // Must be a root-relative path. "//host" and "/\host" are protocol-relative in browsers.
  if (!input.startsWith("/") || input.startsWith("//") || input.startsWith("/\\")) return fallback;
  // Backslashes and control characters are normalized differently by browsers — refuse them.
  if (/[\\\u0000-\u001f\u007f]/.test(input)) return fallback;

  let url: URL;
  try {
    url = new URL(input, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;

  const pathname = stripLocale(url.pathname) || "/";
  if (pathname.startsWith("/api/") || pathname === "/api") return fallback;
  if (isAuthPage(pathname)) return fallback;

  return `${pathname}${url.search}${url.hash}`;
}

/** Builds `/login?next=…`-style hrefs for `Link`/`redirect` from `@/i18n/navigation`. */
export function withNext(pathname: string, next: string | null | undefined) {
  const safe = next ? safeNextPath(next, "") : "";
  return safe ? { pathname, query: { next: safe } } : { pathname };
}
