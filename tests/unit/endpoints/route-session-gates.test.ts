/**
 * SECURITY_REPORT 4.2.a / 4.3.b: route handlers apply the same session rules as pages and server
 * actions. The trip's calendar file (exact address, host phone) and the address search refuse a
 * session whose 2-step code was not entered yet, exactly like a signed-out visitor, BEFORE they
 * read a booking or call the geocoder.
 *
 * The real session code runs (src/lib/auth/session.ts); only the Better Auth cookie check, the
 * request headers and the database are replaced (the pattern of src/lib/admin/actions-guard.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeUser = Record<string, unknown> & { id: string; role: string; isDemo: boolean; twoFactorEnabled: boolean };

const state = vi.hoisted(() => ({
  user: null as FakeUser | null,
  twoFactorVerifiedAt: null as Date | null,
  touched: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {}, has: () => false }),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "he", getTranslations: async () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  getPathname: () => "/",
  Link: () => null,
}));
vi.mock("@/lib/auth/staff-session", () => ({ checkStaffSessionIdle: async () => "active", hasStaffCookie: async () => true }));
vi.mock("@/lib/auth/server", () => ({
  auth: { api: { getSession: async () => (state.user ? { session: { id: "session-1" }, user: { id: state.user.id } } : null) } },
}));
vi.mock("@/lib/db", () => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get(_target, method) {
          if (name === "session" && method === "findUnique") {
            return async () => (state.user ? { twoFactorVerifiedAt: state.twoFactorVerifiedAt, user: state.user } : null);
          }
          return () => {
            state.touched.push(`db.${name}.${String(method)}`);
            throw new Error(`database touched: ${name}.${String(method)}`);
          };
        },
      },
    );
  return { db: new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : model(String(key))) }) };
});
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ ok: true, remaining: 1, resetAt: new Date() }),
  rateLimitByIp: async () => ({ ok: true, remaining: 1, resetAt: new Date() }),
  rateLimitHeaders: () => ({}),
}));
vi.mock("@/lib/booking/queries", () => ({
  getGuestTrip: async () => {
    state.touched.push("getGuestTrip");
    return { code: "BT-TEST1", status: "CONFIRMED", reveal: { address: "Exact street 1" } };
  },
}));
vi.mock("@/lib/trip/calendar-server", () => ({ tripIcsFile: async () => "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n" }));
vi.mock("@/lib/geocode", async () => {
  const core = await import("@/lib/geocode/core");
  return {
    OSM_ATTRIBUTION: "OSM",
    QueueFullError: core.QueueFullError,
    GeocodeUnavailableError: class extends Error {},
    geocodeAddress: async () => {
      state.touched.push("geocodeAddress");
      return [];
    },
  };
});

const ics = await import("@/app/api/ical/booking/[code]/route");
const geocode = await import("@/app/api/geocode/route");

function account(over: Partial<FakeUser> = {}): FakeUser {
  return {
    id: "guest-1",
    name: "Noa",
    firstName: "Noa",
    email: "guest-1@example.com",
    image: null,
    phoneNumber: "+995500000001",
    phoneNumberVerified: true,
    role: "USER",
    isDemo: false,
    status: "ACTIVE",
    suspendedUntil: null,
    accountType: "INDIVIDUAL",
    businessName: null,
    locale: "he",
    currency: null,
    timezone: "Asia/Tbilisi",
    keepsShabbat: false,
    showHebrewDates: false,
    twoFactorEnabled: false,
    idVerifiedAt: null,
    ...over,
  };
}

const getIcs = () =>
  ics.GET(new Request("http://localhost/api/ical/booking/BT-TEST1.ics"), { params: Promise.resolve({ code: "BT-TEST1.ics" }) });
const getGeocode = () => {
  const url = new URL("http://localhost/api/geocode?q=Rustaveli+12&locale=he");
  return geocode.GET({ nextUrl: url } as Parameters<typeof geocode.GET>[0]);
};

describe("route handlers: the session rules of pages and actions", () => {
  beforeEach(() => {
    state.touched = [];
    state.user = null;
    state.twoFactorVerifiedAt = null;
  });

  it("the trip calendar file refuses a signed-out visitor (401) before reading the booking", async () => {
    const res = await getIcs();
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(state.touched).toEqual([]);
  });

  it("the trip calendar file refuses a session whose 2-step code was not entered (401), with no address in the answer", async () => {
    state.user = account({ twoFactorEnabled: true });
    state.twoFactorVerifiedAt = null;
    const res = await getIcs();
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain("Exact street");
    expect(state.touched).toEqual([]);
  });

  it("the trip calendar file is served once the 2-step code was entered", async () => {
    state.user = account({ twoFactorEnabled: true });
    state.twoFactorVerifiedAt = new Date();
    const res = await getIcs();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/calendar");
    expect(state.touched).toEqual(["getGuestTrip"]);
  });

  it("the address search refuses signed-out visitors and 2-step-pending sessions (401) before calling the geocoder", async () => {
    let res = await getGeocode();
    expect(res.status).toBe(401);
    state.user = account({ twoFactorEnabled: true });
    res = await getGeocode();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(state.touched).toEqual([]);

    state.twoFactorVerifiedAt = new Date();
    res = await getGeocode();
    expect(res.status).toBe(200);
    expect(state.touched).toEqual(["geocodeAddress"]);
  });

  it("a banned account counts as signed out", async () => {
    state.user = account({ status: "BANNED" });
    expect((await getIcs()).status).toBe(401);
    expect((await getGeocode()).status).toBe(401);
    expect(state.touched).toEqual([]);
  });
});
