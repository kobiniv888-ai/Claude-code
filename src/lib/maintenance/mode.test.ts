/**
 * Maintenance mode (SECURITY_REPORT 12.5.c, 17.1): the switch's fail-safe reading, who gets through,
 * the calm 503 page in 5 languages, and the REAL proxy (src/proxy.ts) with the switch on.
 */
import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { locales } from "@/config/site";
import {
  MAINTENANCE_RETRY_AFTER_SECONDS,
  envForcesMaintenance,
  maintenanceAllows,
  maintenanceArea,
  maintenanceLocale,
  parseStoredMaintenance,
  readMaintenanceEnv,
  type MaintenanceViewer,
} from "./mode";
import { maintenanceMessages, maintenancePageHtml, maintenanceResponse } from "./page";

vi.mock("server-only", () => ({}));
vi.mock("next-intl/middleware", () => ({ default: () => () => NextResponse.next() }));

const switchState = vi.hoisted(() => ({ on: true, viewer: null as MaintenanceViewer, viewerCalls: 0 }));
vi.mock("@/lib/maintenance/state", () => ({
  maintenanceState: async () => ({ on: switchState.on, source: switchState.on ? "admin" : null, stored: { on: switchState.on, since: null, by: null } }),
}));
vi.mock("@/lib/maintenance/viewer", () => ({
  maintenanceViewer: async () => {
    switchState.viewerCalls += 1;
    return switchState.viewer;
  },
}));

afterEach(() => {
  switchState.on = true;
  switchState.viewer = null;
  switchState.viewerCalls = 0;
});

describe("the switch is read fail-safe", () => {
  it("MAINTENANCE_MODE: on / off / unset, and anything unknown counts as ON", () => {
    for (const on of ["on", "ON", "true", "1", "yes", " on "]) expect(readMaintenanceEnv(on)).toBe("on");
    for (const off of ["off", "false", "0", "no"]) expect(readMaintenanceEnv(off)).toBe("off");
    expect(readMaintenanceEnv(undefined)).toBe("unset");
    expect(readMaintenanceEnv("")).toBe("unset");
    expect(readMaintenanceEnv("onn")).toBe("invalid");
    expect(envForcesMaintenance("invalid")).toBe(true);
    expect(envForcesMaintenance("on")).toBe(true);
    expect(envForcesMaintenance("off")).toBe(false);
    expect(envForcesMaintenance("unset")).toBe(false);
  });

  it("the stored switch is on only when it says exactly { on: true }", () => {
    expect(parseStoredMaintenance({ on: true, since: "2026-11-09T00:00:00.000Z", by: "u1" })).toEqual({ on: true, since: "2026-11-09T00:00:00.000Z", by: "u1" });
    for (const value of [null, undefined, "on", true, { on: "true" }, { on: 1 }, [], {}]) expect(parseStoredMaintenance(value).on).toBe(false);
  });
});

const ANON: MaintenanceViewer = null;
const USER: MaintenanceViewer = { role: "USER", twoFactorVerified: true };
const MODERATOR: MaintenanceViewer = { role: "MODERATOR", twoFactorVerified: true };
const ADMIN_PENDING: MaintenanceViewer = { role: "ADMIN", twoFactorVerified: false };
const ADMIN: MaintenanceViewer = { role: "ADMIN", twoFactorVerified: true };

const get = (pathname: string) => ({ pathname, method: "GET", isAction: false });
const action = (pathname: string) => ({ pathname, method: "POST", isAction: true });

describe("who gets through while it is on", () => {
  it("open paths: health, cron, webhooks, the login library, security.txt, photos and static files", () => {
    for (const path of ["/api/health", "/api/cron/cleanup", "/api/webhooks/resend", "/api/auth/get-session", "/.well-known/security.txt", "/api/media/listings/x.webp", "/_next/image", "/icons/logo.svg", "/sw.js"]) {
      expect(maintenanceArea(path), path).toBe("open");
      expect(maintenanceAllows(get(path), ANON), path).toBe(true);
    }
  });

  it("no SMS code goes out while it is on: the login library's text-message endpoints are closed", () => {
    for (const path of ["/api/auth/phone-number/send-otp", "/api/auth/phone-number/verify", "/api/auth/sign-in/phone-number"]) {
      expect(maintenanceArea(path), path).toBe("closed");
      for (const viewer of [ANON, USER, MODERATOR, ADMIN_PENDING]) expect(maintenanceAllows(action(path), viewer), `${path} ${viewer?.role}`).toBe(false);
    }
    // The email code and Google stay open, so an ADMIN can still log in.
    for (const path of ["/api/auth/email-otp/send-verification-otp", "/api/auth/sign-in/email-otp", "/api/auth/sign-in/social", "/api/auth/callback/google"]) {
      expect(maintenanceArea(path), path).toBe("open");
    }
  });

  it("every public page and API is closed to visitors, users and non-admin staff", () => {
    for (const path of ["/", "/he", "/en/search", "/he/listing/12-flat", "/he/listing/12-x.y", "/ru/account/trips/BT-12345", "/api/geocode", "/api/csp-report", "/robots.txt", "/sitemap.xml", "/he/safety"]) {
      expect(maintenanceArea(path), path).toBe("closed");
      for (const viewer of [ANON, USER, MODERATOR, ADMIN_PENDING]) expect(maintenanceAllows(get(path), viewer), `${path} ${viewer?.role}`).toBe(false);
      expect(maintenanceAllows(get(path), ADMIN), path).toBe(true);
    }
  });

  it("server actions on a public page: only an ADMIN with the 2-step code entered", () => {
    for (const viewer of [ANON, USER, MODERATOR, ADMIN_PENDING]) expect(maintenanceAllows(action("/he/listing/12/book"), viewer)).toBe(false);
    expect(maintenanceAllows(action("/he/listing/12/book"), ADMIN)).toBe(true);
  });

  it("the staff login pages load for anyone; their actions run only for an ADMIN account", () => {
    for (const path of ["/he/login", "/login", "/en/two-factor", "/he/two-factor/setup"]) {
      expect(maintenanceArea(path), path).toBe("staff-entry");
      expect(maintenanceAllows(get(path), ANON)).toBe(true);
      expect(maintenanceAllows(action(path), ANON)).toBe(false);
      expect(maintenanceAllows(action(path), MODERATOR)).toBe(false);
      // The 2-step code itself is a server action of a session whose code is not entered yet.
      expect(maintenanceAllows(action(path), ADMIN_PENDING)).toBe(true);
    }
  });

  it("the admin panel: ADMIN accounts only (the panel itself still asks for the 2-step code)", () => {
    for (const path of ["/he/admin", "/he/admin/maintenance", "/api/admin/documents/x/0"]) {
      expect(maintenanceArea(path), path).toBe("admin");
      for (const viewer of [ANON, USER, MODERATOR]) {
        expect(maintenanceAllows(get(path), viewer)).toBe(false);
        expect(maintenanceAllows(action(path), viewer)).toBe(false);
      }
      expect(maintenanceAllows(get(path), ADMIN_PENDING)).toBe(true);
      expect(maintenanceAllows(action(path), ADMIN)).toBe(true);
    }
  });
});

describe("the 503 page", () => {
  it("speaks the visitor's language: the path first, then Accept-Language, then Hebrew", () => {
    expect(maintenanceLocale("/ru/search", "en-US")).toBe("ru");
    expect(maintenanceLocale("/api/geocode", "ka-GE,ka;q=0.9")).toBe("ka");
    expect(maintenanceLocale("/", "fr-FR, ar;q=0.5")).toBe("ar");
    expect(maintenanceLocale("/", null)).toBe("he");
  });

  it("is calm, complete and self-contained in all 5 languages (RTL for he and ar)", () => {
    for (const locale of locales) {
      const html = maintenancePageHtml(locale, "abc123");
      const t = maintenanceMessages(locale).page;
      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain(`dir="${locale === "he" || locale === "ar" ? "rtl" : "ltr"}"`);
      expect(html).toContain(t.heading.replace(/'/g, "&#39;"));
      expect(html).toContain('<style nonce="abc123">');
      expect(html).toContain('<meta name="robots" content="noindex">');
      // No scripts, no outside files.
      expect(html).not.toMatch(/<script|src=|<link/i);
    }
    expect(maintenanceMessages("he").page.heading).toBe("נחזור בעוד כמה דקות");
  });

  it("answers 503 with Retry-After, never cached, with its own strict CSP", async () => {
    const res = maintenanceResponse("en", "html", "n0nce");
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe(String(MAINTENANCE_RETRY_AFTER_SECONDS));
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'; style-src 'nonce-n0nce'");
    const json = maintenanceResponse("he", "json", "x");
    expect(json.headers.get("content-type")).toContain("application/json");
    expect(await json.json()).toEqual({ error: "maintenance", message: maintenanceMessages("he").api });
  });
});

describe("the real proxy with maintenance mode on", () => {
  async function proxy() {
    vi.resetModules();
    return (await import("@/proxy")).default as (request: NextRequest) => Promise<Response>;
  }
  const req = (url: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
    new NextRequest(`https://bayit.ge${url}`, { method: init.method ?? "GET", headers: { host: "bayit.ge", ...init.headers } });

  it("closes public pages and APIs with the 503, in the path's language", async () => {
    const run = await proxy();
    const page = await run(req("/ru/search"));
    expect(page.status).toBe(503);
    expect(page.headers.get("retry-after")).toBe("600");
    expect(await page.text()).toContain(maintenanceMessages("ru").page.heading);
    const api = await run(req("/api/places/search?q=x"));
    expect(api.status).toBe(503);
    expect((await api.json()).error).toBe("maintenance");
  });

  it("lets the health check, cron, security.txt and the staff login page through without a session lookup", async () => {
    const run = await proxy();
    for (const url of ["/api/health", "/api/cron/cleanup", "/.well-known/security.txt", "/he/login"]) {
      const res = await run(req(url));
      expect(res.status, url).not.toBe(503);
    }
    expect(switchState.viewerCalls).toBe(0);
  });

  it("refuses a server action on the login page from a signed-out visitor, lets an ADMIN's through", async () => {
    const run = await proxy();
    expect((await run(req("/he/login", { method: "POST", headers: { "next-action": "abc" } }))).status).toBe(503);
    switchState.viewer = ADMIN_PENDING;
    expect((await run(req("/he/login", { method: "POST", headers: { "next-action": "abc" } }))).status).not.toBe(503);
  });

  it("admits an ADMIN with the 2-step code to public pages and the panel; a moderator waits", async () => {
    const run = await proxy();
    switchState.viewer = MODERATOR;
    expect((await run(req("/he/admin"))).status).toBe(503);
    switchState.viewer = ADMIN;
    expect((await run(req("/he/admin"))).status).not.toBe(503);
    expect((await run(req("/he"))).status).not.toBe(503);
  });

  it("does nothing while the switch is off", async () => {
    switchState.on = false;
    const run = await proxy();
    expect((await run(req("/he/search"))).status).not.toBe(503);
    expect(switchState.viewerCalls).toBe(0);
  });
});
