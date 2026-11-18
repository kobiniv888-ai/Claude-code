/**
 * Permission denials are security events (SECURITY_REPORT 16.2; the "many permission denials"
 * alert): a signed-in account that is not staff, refused /admin (a 404) or a staff action.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const events = vi.hoisted(() => ({ recorded: [] as { type: string; userId?: string; meta?: Record<string, unknown> }[], role: "USER" }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "he" }));
vi.mock("@/i18n/navigation", () => ({ redirect: () => {
  throw new Error("NEXT_REDIRECT");
} }));
vi.mock("@/lib/security/taint", () => ({ taintObject: () => {}, taintValue: () => {} }));
vi.mock("@/lib/security/events", () => ({
  recordSecurityEvent: async (event: { type: string }) => {
    events.recorded.push(event);
    return true;
  },
}));
vi.mock("./server", () => ({
  auth: { api: { getSession: async () => ({ session: { id: "s1", token: "t1" }, user: { id: "u1" } }) } },
}));
vi.mock("@/lib/db", () => ({
  db: {
    session: {
      findUnique: async () => ({
        twoFactorVerifiedAt: null,
        user: {
          id: "u1",
          name: "",
          firstName: "Dana",
          email: "dana@example.com",
          image: null,
          phoneNumber: null,
          phoneNumberVerified: false,
          role: events.role,
          isDemo: false,
          status: "ACTIVE",
          suspendedUntil: null,
          accountType: "PRIVATE",
          businessName: null,
          locale: "he",
          currency: null,
          timezone: "Asia/Tbilisi",
          keepsShabbat: false,
          showHebrewDates: false,
          twoFactorEnabled: false,
          idVerifiedAt: null,
        },
      }),
    },
  },
}));

const { requireStaff, requireStaffForAction } = await import("./session");

beforeEach(() => {
  events.recorded = [];
  events.role = "USER";
});

describe("permission_denied", () => {
  it("a regular account refused /admin (404) is recorded, with the access and permission", async () => {
    await expect(requireStaff("moderation")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(events.recorded).toEqual([{ type: "permission_denied", userId: "u1", meta: { access: "not_staff", permission: "moderation" } }]);
  });

  it("a regular account refused a staff action is recorded", async () => {
    await expect(requireStaffForAction("settings")).rejects.toMatchObject({ code: "forbidden" });
    expect(events.recorded).toEqual([{ type: "permission_denied", userId: "u1", meta: { access: "not_staff", permission: "settings" } }]);
  });

  it("a real ADMIN without 2-step login refused a staff action (forbidden) is recorded too", async () => {
    events.role = "ADMIN";
    await expect(requireStaffForAction("settings")).rejects.toMatchObject({ code: "forbidden" });
    expect(events.recorded).toEqual([{ type: "permission_denied", userId: "u1", meta: { access: "needs_setup", permission: "settings" } }]);
  });
});
