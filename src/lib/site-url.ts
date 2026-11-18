import { isTestHost, normalizeHost } from "@/lib/auth/code-display";

/**
 * THE address for every link that leaves the site (round 3 brief 2.1): calendar export links that
 * hosts paste into Airbnb / Booking.com, links in emails and text messages, share links, the
 * sitemap, canonical and hreflang URLs.
 *
 *   SITE_URL              the site's permanent public address, e.g. "https://bayit.ge" (server)
 *   NEXT_PUBLIC_SITE_URL  the address the site runs on (the codespace's forwarded port in a
 *                         codespace); used when SITE_URL is not set
 *
 * BETTER_AUTH_URL stays the RUNNING origin (logins, cookies, trusted origins), so a codespace with
 * SITE_URL set to the real domain still logs in on its own address while the links it builds point
 * at the permanent one.
 *
 * A link is only worth copying when the address is permanent (isPermanentSiteUrl): https, a real
 * domain, not localhost / an IP / a Codespaces, Vercel preview or tunnel address. Until then the
 * shared copy field (<CopyLinkField>) says "the link will work once the site is on its permanent
 * address" and disables Copy.
 *
 * Pure (no server imports): the server passes `siteUrl()` / `isPermanentSiteUrl()` to client
 * components as props; client code never reads SITE_URL itself (it is not sent to the browser).
 */

export type SiteUrlEnv = {
  NODE_ENV?: string;
  SITE_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  AUTH_TEST_MODE?: string;
};

const FALLBACK = "http://localhost:3000";

function env(): SiteUrlEnv {
  return process.env as SiteUrlEnv;
}

/** "https://bayit.ge/" → "https://bayit.ge"; null for anything that is not an http(s) URL. */
function cleanOrigin(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // Keep a path prefix if one was configured (a site under /bayit), without the trailing slash.
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** The site's address for outgoing links, without a trailing slash. */
export function siteUrl(source: SiteUrlEnv = env()): string {
  return cleanOrigin(source.SITE_URL) ?? cleanOrigin(source.NEXT_PUBLIC_SITE_URL) ?? FALLBACK;
}

/** "/he/about" → "https://bayit.ge/he/about". Absolute http(s) URLs are returned unchanged. */
export function absoluteUrl(path: string = "/", source?: SiteUrlEnv): string {
  if (/^https?:\/\//i.test(path)) return path;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl(source)}${clean}`;
}

/** Temporary hosting, preview and tunnel addresses: they change or stop working. */
const TEMPORARY_SUFFIXES = [
  ".app.github.dev",
  ".github.dev",
  ".githubpreview.dev",
  ".vercel.app",
  ".netlify.app",
  ".pages.dev",
  ".ngrok.io",
  ".ngrok.app",
  ".ngrok-free.app",
  ".ngrok-free.dev",
  ".trycloudflare.com",
  ".loca.lt",
  ".localtunnel.me",
  ".serveo.net",
  ".gitpod.io",
  ".repl.co",
  ".replit.dev",
  ".csb.app",
  ".stackblitz.io",
  ".webcontainer.io",
];

/** Reserved names that never resolve on the internet (RFC 2606 / 6761) and local network names. */
const RESERVED_TLDS = ["localhost", "local", "test", "example", "invalid", "internal", "lan", "home", "corp"];

function isIpAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

/** Is this host a permanent public domain (not local, not an IP, not a preview or tunnel)? */
export function isPermanentHost(value: string | null | undefined): boolean {
  const host = normalizeHost(value);
  if (!host || !host.includes(".")) return false;
  if (isTestHost(host) || isIpAddress(host)) return false;
  const tld = host.slice(host.lastIndexOf(".") + 1);
  if (RESERVED_TLDS.includes(tld)) return false;
  return !TEMPORARY_SUFFIXES.some((suffix) => host.endsWith(suffix) || host === suffix.slice(1));
}

/** Links built from this address keep working: https on a permanent domain. */
export function isPermanentSiteUrl(url: string = siteUrl()): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && isPermanentHost(parsed.host);
  } catch {
    return false;
  }
}

export type SiteUrlProblem = "missing" | "invalid" | "local" | "not_https" | "temporary";

/**
 * What is wrong with the configured address for a real site (null = fine). `missing`: neither
 * SITE_URL nor NEXT_PUBLIC_SITE_URL is set (links would say localhost).
 */
export function siteUrlProblem(source: SiteUrlEnv = env()): SiteUrlProblem | null {
  const raw = source.SITE_URL?.trim() || source.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return "missing";
  const origin = cleanOrigin(raw);
  if (!origin) return "invalid";
  const url = new URL(origin);
  const host = normalizeHost(url.host) ?? "";
  if (host === "localhost" || host.endsWith(".localhost") || isIpAddress(host)) return "local";
  if (url.protocol !== "https:") return "not_https";
  return isPermanentHost(url.host) ? null : "temporary";
}

const PROBLEM_TEXT: Record<SiteUrlProblem, string> = {
  missing: "SITE_URL is not set, so every link that leaves the site says http://localhost:3000.",
  invalid: "SITE_URL is not a valid http(s) address.",
  local: "SITE_URL points at localhost or an IP address.",
  not_https: "SITE_URL does not use https.",
  temporary: "SITE_URL is a temporary address (a Codespaces, preview or tunnel address).",
};

/**
 * The startup message for production (src/instrumentation.ts), or null when the address is
 * permanent. A loud error on a real server; a short note for a production check in a codespace
 * (test mode on a test address), where a temporary address is expected.
 */
export function siteUrlWarning(source: SiteUrlEnv = env()): { level: "error" | "info"; text: string } | null {
  if (source.NODE_ENV !== "production") return null;
  const problem = siteUrlProblem(source);
  if (!problem) return null;
  const url = siteUrl(source);
  const testCheck = source.AUTH_TEST_MODE?.trim().toLowerCase() === "true" && problem !== "missing" && !isPermanentHost(new URL(url).host);
  if (testCheck) {
    return {
      level: "info",
      text: `[site-url] Links are built from ${url} (a test address): calendar export links can't be copied until SITE_URL is the permanent domain.`,
    };
  }
  const line = "!".repeat(78);
  return {
    level: "error",
    text: [
      line,
      `!! ${PROBLEM_TEXT[problem]}`,
      `!! Links are built from: ${url}`,
      "!! Calendar export links, links in emails and text messages, share links and the sitemap",
      "!! all use it. Set SITE_URL to the site's permanent https address (e.g. https://bayit.ge)",
      "!! and restart. Hosts can't copy their calendar link until then. See OWNER_TODO.md.",
      line,
    ].join("\n"),
  };
}
