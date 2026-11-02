import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { locales, type AppLocale } from "@/config/site";
import { routing } from "@/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const DEVICE_COOKIE = "bayit_did";
const isDev = process.env.NODE_ENV !== "production";

/** Content-Security-Policy with a per-request nonce (Next.js applies it to its own scripts). */
function buildCsp(nonce: string) {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "https://challenges.cloudflare.com",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      "https://*.ingest.sentry.io",
      "https://*.ingest.de.sentry.io",
      ...(isDev ? ["ws:", "wss:"] : []),
    ],
    "frame-src": [
      "https://challenges.cloudflare.com",
      "https://www.youtube-nocookie.com",
      "https://www.youtube.com",
      "https://player.vimeo.com",
    ],
    "media-src": ["'self'", "blob:", "https:"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", "https://accounts.google.com", "https://appleid.apple.com"],
    "frame-ancestors": ["'none'"],
  };
  const csp = Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
  return isDev ? csp : `${csp}; upgrade-insecure-requests`;
}

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

export default async function proxy(request: NextRequest) {
  const listingRedirect = await bareListingRedirect(request);
  if (listingRedirect) return listingRedirect;

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Pass the nonce to the app (layout reads it for next-themes / JSON-LD scripts).
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);
  // The page being opened, for "?next=" when a layout sends a signed-out visitor to /login
  // (requireUser / requireStaff; validated there by safeNextPath). Always overwritten here.
  request.headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);

  const response = intlMiddleware(request) ?? NextResponse.next({ request });

  response.headers.set("Content-Security-Policy", csp);

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
  // Everything except API routes, Next.js internals and files with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
