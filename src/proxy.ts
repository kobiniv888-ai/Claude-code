import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
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
      "https://nominatim.openstreetmap.org",
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

export default function proxy(request: NextRequest) {
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
