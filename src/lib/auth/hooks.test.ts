/**
 * After a sign-in (src/lib/auth/hooks.ts afterSignIn): the security event log (16.2: every login,
 * with its method) and the new-device alert (3.6.e). A login WITHOUT the bayit_did cookie (a
 * script, or the cookie stripped) must not hide a new device: it counts as unknown, except for a
 * sign-up's own first session. Our own session rotation (no login endpoint) records nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  events: [] as { type: string; meta?: Record<string, unknown> }[],
  alerts: [] as unknown[],
  links: 0,
  otherSessions: 0,
  knownDevice: false,
  createdAt: new Date(Date.now() - 30 * 86_400_000),
  role: "USER",
  listings: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "curl/8.5.0" }),
  cookies: async () => ({ get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined) }),
}));
vi.mock("@/lib/email", () => ({ sendEmail: async () => ({ ok: true }) }));
vi.mock("@/lib/security/events", () => ({
  recordSecurityEvent: async (event: { type: string; meta?: Record<string, unknown> }) => void state.events.push(event),
}));
vi.mock("./security-notices", () => ({ notifyNewDevice: async (alert: unknown) => void state.alerts.push(alert) }));
vi.mock("./fresh-proof", () => ({ markFreshProof: async () => {} }));
vi.mock("@/lib/db", () => ({
  db: {
    deviceLink: {
      findUnique: async () => (state.knownDevice ? { id: "link-1" } : null),
      count: async () => state.links,
      upsert: async () => ({}),
      update: async () => ({}),
    },
    session: { count: async () => state.otherSessions },
    user: {
      update: async () => ({}),
      findUnique: async () => ({ role: state.role, createdAt: state.createdAt, _count: { listings: state.listings } }),
    },
  },
}));

const { afterSignIn, loginMethodOf } = await import("./hooks");
const DEVICE = "11111111-2222-3333-4444-555555555555";
const types = () => state.events.map((event) => event.type);

beforeEach(() => {
  state.cookies.clear();
  state.events = [];
  state.alerts = [];
  state.links = 3;
  state.otherSessions = 1;
  state.knownDevice = false;
  state.createdAt = new Date(Date.now() - 30 * 86_400_000);
  state.role = "ADMIN";
  state.listings = 2;
});

describe("afterSignIn: the login in the security event log (16.2)", () => {
  it("every login is a login_success with its method and whether it is staff", async () => {
    state.knownDevice = true;
    state.cookies.set("bayit_did", DEVICE);
    await afterSignIn({ id: "s1", userId: "u1" }, "/sign-in/email-otp");
    expect(state.events).toEqual([{ type: "login_success", userId: "u1", meta: { method: "email_code", staff: true } }]);
    expect(loginMethodOf("/phone-number/verify")).toBe("phone_code");
    expect(loginMethodOf("/callback/:id")).toBe("social");
  });

  it("our own session rotation (no login endpoint) records nothing and sends nothing", async () => {
    await afterSignIn({ id: "s1", userId: "u1" }, undefined);
    expect(state.events).toEqual([]);
    expect(state.alerts).toEqual([]);
  });
});

describe("afterSignIn: new devices (3.6.e)", () => {
  it("an unknown device id: a new_device_login event and an alert", async () => {
    state.cookies.set("bayit_did", DEVICE);
    await afterSignIn({ id: "s1", userId: "u1" }, "/sign-in/email-otp");
    expect(types()).toEqual(["login_success", "new_device_login"]);
    expect(state.alerts).toHaveLength(1);
  });

  it("NO device cookie on an established account: still a new device (event + alert), marked noDeviceId", async () => {
    await afterSignIn({ id: "s2", userId: "u1" }, "/sign-in/email-otp");
    expect(types()).toEqual(["login_success", "new_device_login"]);
    expect(state.events[1]?.meta).toMatchObject({ noDeviceId: true, staff: true, host: true });
    expect(state.alerts).toHaveLength(1);
  });

  it("no device cookie, no devices and no other session, but an older account: still a new device", async () => {
    state.links = 0;
    state.otherSessions = 0;
    await afterSignIn({ id: "s2", userId: "u1" }, "/callback/:id");
    expect(types()).toEqual(["login_success", "new_device_login"]);
  });

  it("a sign-up's own first session (account just created, no devices, no other session) stays silent", async () => {
    state.links = 0;
    state.otherSessions = 0;
    state.createdAt = new Date();
    await afterSignIn({ id: "s3", userId: "u1" }, "/sign-in/email-otp");
    expect(types()).toEqual(["login_success"]);
    expect(state.alerts).toEqual([]);
  });

  it("the account's first device (with a cookie) and a known device stay silent", async () => {
    state.links = 0;
    state.cookies.set("bayit_did", DEVICE);
    await afterSignIn({ id: "s4", userId: "u1" }, "/sign-in/email-otp");
    state.knownDevice = true;
    await afterSignIn({ id: "s5", userId: "u1" }, "/sign-in/email-otp");
    expect(types()).toEqual(["login_success", "login_success"]);
    expect(state.alerts).toEqual([]);
  });

  it("a guest (no listings, not staff): the event, but no email", async () => {
    state.role = "USER";
    state.listings = 0;
    await afterSignIn({ id: "s6", userId: "u1" }, "/sign-in/email-otp");
    expect(types()).toEqual(["login_success", "new_device_login"]);
    expect(state.alerts).toEqual([]);
  });
});
