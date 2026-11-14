/**
 * SECURITY_REPORT 15.10.a: only essential cookies, by default and before any consent.
 *
 * - Every place in src/ that writes a cookie is known, and each writes only a cookie of the
 *   cookie policy's list (src/lib/legal/cookies.ts); a new cookie fails this test until it is listed.
 * - Every listed cookie is essential: none waits for the banner's consent.
 * - A visitor's very first page (no cookies, a browser in another language) gets only essential
 *   cookies from the real proxy and the real language middleware.
 * - The durations in the policy's table match the code.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AUTH_COOKIE_KEYS, cookieName, staffCookieName } from "@/lib/auth/session-cookies";
import { CONSENT_MAX_AGE_SECONDS } from "@/lib/consent-cookie";
import { CURRENCY_COOKIE_MAX_AGE } from "@/lib/currency/cookie";
import {
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  DEVICE_COOKIE_NAME,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  SESSION_MAX_DAYS,
  isDocumentedCookie,
  isEssentialCookie,
  siteCookies,
} from "@/lib/legal/cookies";

vi.mock("server-only", () => ({}));
// next-intl's middleware does not load under vitest (it imports "next/server" without ".js"); this
// stand-in sets the language cookie the way it does (syncCookie: a page in another language than
// the browser's). The cookie's name and lifetime are checked against the real routing config below.
vi.mock("next-intl/middleware", async () => {
  const { NextResponse } = await import("next/server");
  return {
    default: () => (request: NextRequest) => {
      const response = NextResponse.next();
      const locale = request.nextUrl.pathname.split("/")[1] || "en";
      const browser = (request.headers.get("accept-language") ?? "").slice(0, 2);
      if (!request.cookies.has("NEXT_LOCALE") && locale !== browser) response.cookies.set("NEXT_LOCALE", locale, { path: "/", maxAge: 31536000 });
      return response;
    },
  };
});

const ROOT = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    if (statSync(path.join(ROOT, rel)).isDirectory()) return rel.includes("generated") ? [] : sourceFiles(rel);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [rel] : [];
  });
}

/** Writing a cookie: Next's cookies().set / response.cookies.set, a cookie jar, or document.cookie. */
const WRITES_COOKIE = /cookies\(\)\)\.set\(|\.cookies\.set\(|\bjar\.set\(|document\.cookie\s*=/;

/** The files that write cookies, and the cookie each writes (all from the policy's list). */
const KNOWN_WRITERS: Record<string, string> = {
  "src/proxy.ts": DEVICE_COOKIE_NAME,
  "src/lib/currency/actions.ts": "bayit_currency",
  "src/lib/consent-cookie.ts": "bayit_consent",
  "src/components/content/cookie-settings-button.tsx": "bayit_consent",
  // The login library's own cookies, written by our session rotation, logout and the staff cookie.
  "src/lib/auth/session-rotation.ts": cookieName("session_token", true),
  "src/lib/auth/logout-actions.ts": cookieName("session_token", true),
  "src/lib/auth/staff-session.ts": staffCookieName(true),
};

describe("every cookie the code writes is listed in the cookie policy, and essential", () => {
  it("only the known files write cookies", () => {
    const writers = sourceFiles("src").filter((file) => WRITES_COOKIE.test(read(file)));
    expect(writers.sort()).toEqual(Object.keys(KNOWN_WRITERS).sort());
  });

  it("each of them writes a listed, essential cookie", () => {
    for (const [file, name] of Object.entries(KNOWN_WRITERS)) {
      expect(isDocumentedCookie(name), `${file} → ${name}`).toBe(true);
      expect(isEssentialCookie(name), name).toBe(true);
    }
    expect(read("src/proxy.ts")).toContain("DEVICE_COOKIE_MAX_AGE_SECONDS");
  });

  it("every login-library cookie (https and plain-http names) and the staff cookie are listed", () => {
    for (const secure of [true, false]) {
      for (const key of AUTH_COOKIE_KEYS) expect(isDocumentedCookie(cookieName(key, secure)), key).toBe(true);
      expect(isDocumentedCookie(staffCookieName(secure))).toBe(true);
    }
    expect(isDocumentedCookie("_ga")).toBe(false);
    expect(isDocumentedCookie("bayit_prefs")).toBe(false);
  });

  it("lists no optional cookie: everything optional is browser storage behind the banner", () => {
    expect(siteCookies.map((c) => c.category)).toEqual(siteCookies.map(() => "necessary"));
    expect(siteCookies.map((c) => c.id).sort()).toEqual(["consent", "currency", "device", "locale", "session"]);
  });

  it("the durations in the table are the code's", async () => {
    const days = Object.fromEntries(siteCookies.map((c) => [c.id, c.days]));
    expect(days).toEqual({ session: 30, consent: 180, device: 365, locale: 365, currency: 365 });
    expect(CONSENT_MAX_AGE_SECONDS).toBe(180 * 86400);
    expect(CURRENCY_COOKIE_MAX_AGE).toBe(365 * 86400);
    expect(DEVICE_COOKIE_MAX_AGE_SECONDS).toBe(365 * 86400);
    const { routing } = await import("@/i18n/routing");
    const localeCookie = routing.localeCookie as { name?: string; maxAge?: number };
    expect(localeCookie.name).toBe(LOCALE_COOKIE_NAME);
    expect(localeCookie.maxAge).toBe(LOCALE_COOKIE_MAX_AGE_SECONDS);
    expect(read("src/lib/auth/server.ts")).toMatch(new RegExp(`expiresIn: 60 \\* 60 \\* 24 \\* ${SESSION_MAX_DAYS},`));
    // The English table says the same (the other languages are checked by i18n:check for the keys).
    const rows = JSON.parse(read("messages/en/legal.json")).cookies.sections.list.table.rows as Record<string, { duration: string }>;
    expect(rows.consent.duration).toMatch(/180 days/);
    expect(rows.device.duration).toMatch(/1 year/);
    expect(rows.locale.duration).toMatch(/1 year/);
    expect(rows.currency.duration).toMatch(/1 year/);
    expect(rows.session.duration).toMatch(/30 days/);
  });
});

describe("a first visit gets only essential cookies", () => {
  it("the real proxy (with the language cookie) sets nothing optional before any consent", async () => {
    vi.resetModules();
    vi.stubEnv("SITE_ENV", "development");
    const proxy = (await import("@/proxy")).default as (request: NextRequest) => Promise<Response>;
    for (const url of ["http://localhost:4784/he", "http://localhost:4784/en/search", "http://localhost:4784/ru/legal/privacy"]) {
      // An English-language browser opening a Hebrew page: next-intl remembers the page's language.
      const response = await proxy(new NextRequest(url, { headers: { "accept-language": "en-US,en;q=0.9", "sec-fetch-dest": "document" } }));
      const names = response.headers
        .getSetCookie()
        .map((line) => line.split("=")[0]!.trim())
        .filter(Boolean);
      expect(names, url).toContain(DEVICE_COOKIE_NAME);
      for (const name of names) expect(isEssentialCookie(name), `${url} sets ${name}`).toBe(true);
    }
    vi.unstubAllEnvs();
  });
});
