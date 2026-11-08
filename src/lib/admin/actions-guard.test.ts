/**
 * Every admin server action refuses accounts that may not use the panel (founder's answer 1,
 * round 3). The test walks every "use server" module under src/lib/admin, calls each export with
 * empty input and checks that it fails BEFORE it touches the database:
 *
 * - signed out → auth_required
 * - a regular account (USER) → forbidden
 * - a demo ADMIN on the permanent address (even with 2-step login) → forbidden
 * - a demo ADMIN on the real site (SITE_ENV=production) → not signed in at all (auth_required)
 * - a real ADMIN without 2-step login, in development with DEV_SKIP_STAFF_2FA=true → forbidden
 *
 * The real session code runs (src/lib/auth/session.ts); only the Better Auth cookie check, the
 * request headers and the database are replaced.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type FakeUser = {
  id: string;
  name: string;
  firstName: string | null;
  email: string;
  image: null;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  role: "USER" | "ADMIN" | "MODERATOR" | "SUPPORT" | "EDITOR";
  isDemo: boolean;
  status: "ACTIVE";
  suspendedUntil: null;
  accountType: "INDIVIDUAL";
  businessName: null;
  locale: "he";
  currency: null;
  timezone: string;
  keepsShabbat: boolean;
  showHebrewDates: boolean;
  twoFactorEnabled: boolean;
  idVerifiedAt: null;
};

const state = vi.hoisted(() => ({
  user: null as FakeUser | null,
  twoFactorVerifiedAt: null as Date | null,
  host: "localhost:3000",
  dbTouched: [] as string[],
  /** Security events written (a refused signed-in account is logged as permission_denied, 16.2). */
  events: [] as string[],
  // The SameSite=Strict staff cookie and the 12-hour idle marker (src/lib/auth/staff-session.ts).
  staffCookie: true,
  staffIdle: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: state.host }),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {}, has: () => false }),
}));
vi.mock("@/lib/monitoring", () => ({ reportError: async () => {} }));
// The refusal itself is logged (src/lib/auth/session.ts recordPermissionDenied): captured here, so
// "nothing is read or changed before the staff check" stays strict for every other table.
vi.mock("@/lib/security/events", () => ({
  recordSecurityEvent: async (event: { type: string }) => {
    state.events.push(event.type);
    return true;
  },
}));
vi.mock("@/lib/auth/staff-session", () => ({
  checkStaffSessionIdle: async () => (state.staffIdle ? "idle" : "active"),
  hasStaffCookie: async () => state.staffCookie,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "he",
  getTranslations: async () => (key: string) => key,
  setRequestLocale: () => {},
}));
vi.mock("@/i18n/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  getPathname: () => "/",
  Link: () => null,
}));
vi.mock("@/lib/auth/server", () => ({
  auth: {
    api: {
      getSession: async () => (state.user ? { session: { id: "session-1" }, user: { id: state.user.id } } : null),
    },
  },
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
            state.dbTouched.push(`${name}.${String(method)}`);
            throw new Error(`database touched before the staff check: ${name}.${String(method)}`);
          };
        },
      },
    );
  const db = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "then") return undefined;
        return model(String(key));
      },
    },
  );
  return { db };
});

const ROOT = path.resolve(__dirname);

/** Every file under src/lib/admin that starts with "use server" (tests excluded). */
function actionModules(dir = ROOT): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...actionModules(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    const head = readFileSync(full, "utf8").trimStart();
    if (head.startsWith('"use server"') || head.startsWith("'use server'")) found.push(full);
  }
  return found.sort();
}

function account(over: Partial<FakeUser> = {}): FakeUser {
  return {
    id: "user-1",
    name: "Test",
    firstName: "Test",
    email: "test@example.com",
    image: null,
    phoneNumber: null,
    phoneNumberVerified: false,
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

type Scenario = {
  name: string;
  env: Record<string, string>;
  host: string;
  user: FakeUser | null;
  twoFactorVerifiedAt: Date | null;
  expected: string;
};

const LOCAL_DEV = { NODE_ENV: "development", SITE_ENV: "development", DEV_SKIP_STAFF_2FA: "true", NEXT_PUBLIC_SITE_URL: "http://localhost:3000", BETTER_AUTH_URL: "http://localhost:3000" };
const REAL_PROD = { NODE_ENV: "production", SITE_ENV: "production", DEV_SKIP_STAFF_2FA: "false", NEXT_PUBLIC_SITE_URL: "https://bayit.example", BETTER_AUTH_URL: "https://bayit.example" };
/** A development site (a codespace) configured with the permanent address. */
const PERMANENT_DEV = { ...REAL_PROD, SITE_ENV: "development" };

const SCENARIOS: Scenario[] = [
  { name: "signed out", env: REAL_PROD, host: "bayit.example", user: null, twoFactorVerifiedAt: null, expected: "auth_required" },
  {
    name: "a regular account (USER)",
    env: REAL_PROD,
    host: "bayit.example",
    user: account({ role: "USER", twoFactorEnabled: true }),
    twoFactorVerifiedAt: new Date(),
    expected: "forbidden",
  },
  {
    name: "a regular account (USER) on localhost",
    env: LOCAL_DEV,
    host: "localhost:3000",
    user: account({ role: "USER" }),
    twoFactorVerifiedAt: null,
    expected: "forbidden",
  },
  {
    name: "a demo ADMIN with 2-step login on the permanent address",
    env: PERMANENT_DEV,
    host: "bayit.example",
    user: account({ role: "ADMIN", isDemo: true, twoFactorEnabled: true }),
    twoFactorVerifiedAt: new Date(),
    expected: "forbidden",
  },
  {
    name: "a demo MODERATOR with 2-step login on the permanent address",
    env: PERMANENT_DEV,
    host: "bayit.example",
    user: account({ role: "MODERATOR", isDemo: true, twoFactorEnabled: true }),
    twoFactorVerifiedAt: new Date(),
    expected: "forbidden",
  },
  {
    // SITE_ENV=production: a demo account is not even signed in there (src/lib/auth/session.ts).
    name: "a demo ADMIN with 2-step login on the real site",
    env: REAL_PROD,
    host: "bayit.example",
    user: account({ role: "ADMIN", isDemo: true, twoFactorEnabled: true }),
    twoFactorVerifiedAt: new Date(),
    expected: "auth_required",
  },
  {
    name: "a real ADMIN without 2-step login, even with the development shortcut on",
    env: LOCAL_DEV,
    host: "localhost:3000",
    user: account({ role: "ADMIN", isDemo: false, twoFactorEnabled: false }),
    twoFactorVerifiedAt: null,
    expected: "forbidden",
  },
];

const modules = actionModules();

describe("admin server actions refuse accounts without panel access", () => {
  // Loading every admin module the first time takes several seconds (cold transform).
  beforeAll(async () => {
    for (const file of modules) await import(file);
    await import("@/app/api/admin/documents/[requestId]/[index]/route");
  }, 120_000);

  beforeEach(() => {
    state.dbTouched = [];
    state.events = [];
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("finds the admin action modules", () => {
    const names = modules.map((file) => path.relative(ROOT, file));
    expect(names).toContain(path.join("actions", "moderation.ts"));
    expect(names).toContain(path.join("content", "actions", "roles.ts"));
    expect(names).toContain(path.join("maintenance", "actions.ts"));
    expect(names.length).toBeGreaterThanOrEqual(15);
  });

  for (const scenario of SCENARIOS) {
    it(`every export refuses ${scenario.name}`, async () => {
      for (const [key, value] of Object.entries(scenario.env)) vi.stubEnv(key, value);
      state.user = scenario.user;
      state.twoFactorVerifiedAt = scenario.twoFactorVerifiedAt;
      state.host = scenario.host;

      let checked = 0;
      for (const file of modules) {
        const mod = (await import(file)) as Record<string, unknown>;
        for (const [name, fn] of Object.entries(mod)) {
          expect(typeof fn, `${path.basename(file)} exports only functions (${name})`).toBe("function");
          const input = name.toLowerCase().includes("photo") ? new FormData() : {};
          const result = (await (fn as (input: unknown) => Promise<unknown>)(input)) as { ok: boolean; error?: string };
          expect(result, `${path.relative(ROOT, file)} → ${name}`).toEqual({ ok: false, error: scenario.expected });
          checked += 1;
        }
      }
      expect(state.dbTouched).toEqual([]);
      expect(checked).toBeGreaterThan(40);
      // The only thing written is the refusal's own "permission_denied" security event.
      expect(state.events.every((type) => type === "permission_denied")).toBe(true);
    });
  }

  it("the admin documents route refuses them too", async () => {
    const { GET } = await import("@/app/api/admin/documents/[requestId]/[index]/route");
    for (const scenario of SCENARIOS) {
      for (const [key, value] of Object.entries(scenario.env)) vi.stubEnv(key, value);
      state.user = scenario.user;
      state.twoFactorVerifiedAt = scenario.twoFactorVerifiedAt;
      state.host = scenario.host;
      const res = await GET(new Request("http://localhost/api/admin/documents/x/0"), { params: Promise.resolve({ requestId: "x", index: "0" }) });
      expect(res.status, scenario.name).toBe(scenario.expected === "auth_required" ? 401 : 404);
    }
    expect(state.dbTouched).toEqual([]);
  });

  it("lets a demo ADMIN through on localhost in development (the harness can tell the difference)", async () => {
    for (const [key, value] of Object.entries(LOCAL_DEV)) vi.stubEnv(key, value);
    state.user = account({ role: "ADMIN", isDemo: true });
    state.twoFactorVerifiedAt = null;
    state.host = "localhost:3000";
    const { requireStaffForAction } = await import("@/lib/auth/session");
    await expect(requireStaffForAction("settings")).resolves.toMatchObject({ role: "ADMIN", isDemo: true });

    // … but not when the request comes from a real domain.
    state.host = "bayit.example";
    await expect(requireStaffForAction("settings")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("lets a real ADMIN with 2-step login through on the permanent address", async () => {
    for (const [key, value] of Object.entries(REAL_PROD)) vi.stubEnv(key, value);
    state.user = account({ role: "ADMIN", twoFactorEnabled: true });
    state.twoFactorVerifiedAt = new Date();
    state.host = "bayit.example";
    const { requireStaffForAction } = await import("@/lib/auth/session");
    await expect(requireStaffForAction("settings")).resolves.toMatchObject({ role: "ADMIN", isDemo: false });

    // Without the code in this session: refused.
    state.twoFactorVerifiedAt = null;
    await expect(requireStaffForAction("settings")).rejects.toMatchObject({ code: "auth_required" });
  });

  it("refuses a verified real ADMIN without the SameSite=Strict staff cookie, or after 12 idle hours (SECURITY_REPORT 3.5.a/c)", async () => {
    for (const [key, value] of Object.entries(REAL_PROD)) vi.stubEnv(key, value);
    state.user = account({ role: "ADMIN", twoFactorEnabled: true });
    state.twoFactorVerifiedAt = new Date();
    state.host = "bayit.example";
    const { requireStaffForAction } = await import("@/lib/auth/session");
    try {
      state.staffCookie = false;
      await expect(requireStaffForAction("settings")).rejects.toMatchObject({ code: "auth_required" });
      state.staffCookie = true;
      state.staffIdle = true;
      await expect(requireStaffForAction("settings")).rejects.toMatchObject({ code: "auth_required" });
    } finally {
      state.staffCookie = true;
      state.staffIdle = false;
    }
  });
});
