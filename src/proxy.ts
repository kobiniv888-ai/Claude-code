import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { mapTiles } from "@/config/map";
import { locales, type AppLocale } from "@/config/site";
import { routing } from "@/i18n/routing";
import { maintenanceGate } from "@/lib/maintenance/proxy-gate";
import { cspHeaders, tileOriginsFrom } from "@/lib/security/csp";
import { NOINDEX_HEADER_VALUE, robotsHeaderFor } from "@/lib/seo";

const intlMiddleware = createIntlMiddleware(routing);

const DEVICE_COOKIE = "bayit_did";
const isDev = process.env.NODE_ENV !== "production";

/** The map tile hosts the strict CSP allows for images (the provider in src/config/map.ts). */
const TILE_ORIGINS = mapTiles.available ? tileOriginsFrom(Object.values(mapTiles.provider.styles)) : [];

/** The booking review page ("/he/listing/<id>/book"): never indexed, on any host (SECURITY_REPORT 10.4.d). */
const BOOKING_PATH = new RegExp(`^/(?:${locales.join("|")})/listing/[^/]+/book(?:/|$)`);

/** "/he/listing/113" — a listing link without the words after the number. */
const BARE_LISTING_PATH = new RegExp(`^/(${locales.join("|")})/listing/(\\d{1,10})/?$`);
const MAX_PUBLIC_ID = 2_147_483_647;

/**
 * Bare listing links (emails, links typed or shared by hand) get a real HTTP 308 to the
 * canonical "/<locale>/listing/<id>-<slug>" address. The page cannot do this itself: it streams
 * behind loading.tsx, so its redirect would be a client-side meta refresh with status 200.
 * Only public listings are redirected here (the rest is left to the page), and any failure
 * falls back to the page as well.
 */
async function bareListingRedirect(request: NextRequest): Promise<NextResponse | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const match = BARE_LISTING_PATH.exec(request.nextUrl.pathname);
  if (!match) return null;
  const locale = match[1] as AppLocale;
  const publicId = Number(match[2]);
  if (!Number.isSafeInteger(publicId) || publicId <= 0 || publicId > MAX_PUBLIC_ID) return null;
  try {
    // Loaded on demand, so other requests never load the database client here.
    const { publicListingCanonicalPath } = await import("@/lib/listing-page/canonical");
    const path = await publicListingCanonicalPath(publicId, locale);
    if (!path || path === `/listing/${publicId}`) return null;
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${path}`;
    const response = NextResponse.redirect(url, 308);
    // Search engines still see a permanent move; browsers do not keep it, as the slug follows the title.
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[proxy] could not resolve a listing link:", error);
    return null;
  }
}

/** The first matcher below: a page (not the API, Next.js internals or a file with an extension). */
const PAGE_PATH = /^\/(?!api|_next|_vercel|.*\..*)/;

/**
 * Not a page: the API, optimized images (/_next/image) and files with an extension (public/
 * photos and icons, the manifest, robots.txt, sitemap.xml). The proxy adds their X-Robots-Tag and,
 * outside the API and Next.js internals, the CSP too (see below).
 */
function isNonPagePath(pathname: string): boolean {
  return !PAGE_PATH.test(pathname);
}

/** API routes and Next.js internals: they never render a page, so they need no CSP or nonce. */
const NEVER_A_PAGE = /^\/(?:api|_next|_vercel)(?:\/|$)/;

/**
 * Request headers that only the proxy may set (the layout trusts them). A visitor's own values are
 * always removed, on every path the proxy sees (SECURITY_REPORT 10.2.a/c).
 */
const PROXY_REQUEST_HEADERS = ["x-nonce", "x-pathname", "content-security-policy"] as const;

function cspFor(nonce: string) {
  return cspHeaders({ nonce, dev: isDev, env: process.env, tileOrigins: TILE_ORIGINS });
}

function setCspHeaders(response: NextResponse, policies: ReturnType<typeof cspFor>): void {
  response.headers.set("Content-Security-Policy", policies.enforced);
  if (policies.reportOnly) response.headers.set("Content-Security-Policy-Report-Only", policies.reportOnly);
  response.headers.set("Reporting-Endpoints", policies.reportingEndpoints);
}

export default async function proxy(request: NextRequest) {
  // Maintenance mode (SECURITY_REPORT 12.5.c): one switch answers every public page and API with a
  // calm 503 (admins with 2-step login, the health check, cron and security.txt stay reachable).
  // Off: one cached read, no database work per request (src/lib/maintenance/).
  const closed = await maintenanceGate(request);
  if (closed) return closed;

  // Round 3, brief 10: every response of an address that isn't SITE_URL's (a codespace, localhost,
  // a preview) and the private areas everywhere say "noindex, nofollow". Headers only, no database.
  const robotsTag =
    robotsHeaderFor({ headers: request.headers, pathname: request.nextUrl.pathname }) ??
    (BOOKING_PATH.test(request.nextUrl.pathname) ? NOINDEX_HEADER_VALUE : null);

  // Not a page (seo-4): no language redirect or cookie. robots.txt lets crawlers fetch everything on
  // a non-production host, so each response must say noindex itself. A path with a dot can still
  // render an app page (a listing id with a dot, the not-found page of "/x.txt"), so outside the API
  // and Next.js internals it gets the same CSP and nonce as a page (static files ignore CSP); and
  // the visitor's own x-nonce / x-pathname / content-security-policy headers never reach the app.
  if (isNonPagePath(request.nextUrl.pathname)) {
    const headers = new Headers(request.headers);
    for (const name of PROXY_REQUEST_HEADERS) headers.delete(name);
    let policies: ReturnType<typeof cspFor> | null = null;
    if (!NEVER_A_PAGE.test(request.nextUrl.pathname)) {
      const nonce = btoa(crypto.randomUUID());
      policies = cspFor(nonce);
      headers.set("x-nonce", nonce);
      headers.set("content-security-policy", policies.enforced);
      headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
    }
    const response = NextResponse.next({ request: { headers } });
    if (policies) setCspHeaders(response, policies);
    if (robotsTag) response.headers.set("X-Robots-Tag", robotsTag);
    return response;
  }

  const listingRedirect = await bareListingRedirect(request);
  if (listingRedirect) {
    if (robotsTag) listingRedirect.headers.set("X-Robots-Tag", robotsTag);
    return listingRedirect;
  }

  // Content-Security-Policy with a per-request nonce (Next.js applies it to its own scripts), plus
  // the stricter policy on trial as Report-Only (src/lib/security/csp.ts, SECURITY_REPORT 10.2).
  const nonce = btoa(crypto.randomUUID());
  const policies = cspFor(nonce);
  const csp = policies.enforced;

  // Pass the nonce to the app (layout reads it for next-themes / JSON-LD scripts).
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);
  // The page being opened, for "?next=" when a layout sends a signed-out visitor to /login
  // (requireUser / requireStaff; validated there by safeNextPath). Always overwritten here.
  request.headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);

  const response = intlMiddleware(request) ?? NextResponse.next({ request });

  setCspHeaders(response, policies);
  if (robotsTag) response.headers.set("X-Robots-Tag", robotsTag);

  // A random, first-party device id used only for anti-fraud ("several accounts on one device").
  if (!request.cookies.get(DEVICE_COOKIE)) {
    response.cookies.set(DEVICE_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: !isDev,
      path: "/",
      maxAge: 60 * 60 * 24 * 365 * 2,
    });
  }

  return response;
}

export const config = {
  matcher: [
    // Pages: everything except API routes, Next.js internals and files with an extension.
    "/((?!api|_next|_vercel|.*\\..*).*)",
    // The rest a crawler can fetch, for its X-Robots-Tag only (isNonPagePath): the API, optimized
    // images, and files with an extension outside /_next (public/, robots.txt, sitemap.xml, the
    // manifest). Not /_next/static: hashed scripts and styles, never shown as search results.
    "/api/:path*",
    "/_next/image",
    "/((?!_next/|_vercel).*\\..*)",
  ],
};
