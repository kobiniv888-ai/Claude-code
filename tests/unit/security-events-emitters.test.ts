/**
 * The security event log (SECURITY_REPORT 16.2): every kind the checklist names is RECORDED
 * somewhere — logins and failed logins, codes sent by country, permission denials and rate-limit
 * hits, contact reveals, exports and deletions. A static check that each SECURITY_EVENT_TYPES entry
 * is written by real code, plus unit tests of the emitters with recordSecurityEvent mocked (logins
 * and new devices: src/lib/auth/hooks.test.ts; refused login codes: src/lib/auth/code-send-hooks.db.test.ts).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SECURITY_EVENT_TYPES } from "@/lib/security/event-types";

const ROOT = path.resolve(__dirname, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "generated" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("every security event type is recorded by real code", () => {
  const code = sourceFiles(path.join(ROOT, "src"))
    .filter((file) => !file.endsWith(path.join("security", "event-types.ts")))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  for (const type of SECURITY_EVENT_TYPES) {
    it(type, () => {
      // `type: "x"`, or a choice between names (`type: a ? "x" : "y"`).
      const written = new RegExp(`type:[^,}\\n]*"${type}"`).test(code);
      expect(written, `no recordSecurityEvent({ type: "${type}" }) outside the tests`).toBe(true);
    });
  }

  it("contact reveals, exports and deletions are recorded where they happen", () => {
    const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
    expect(read("src/lib/contact/actions.ts")).toMatch(/type: "contact_revealed", userId: user\.id \}\);\s*return ok\(\{\s*methods/);
    expect(read("src/app/api/account/export/route.ts")).toMatch(/type: "data_export", userId: user\.id[\s\S]*status: 200/);
    expect(read("src/lib/account/actions.ts")).toMatch(/type: "account_deleted", userId: user\.id \}\);\s*await deleteAccountData/);
  });
});

const events = vi.hoisted(() => ({ recorded: [] as { type: string; meta?: Record<string, unknown> | null; userId?: string | null }[] }));
const store = vi.hoisted(() => ({ count: 1 }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/security/events", () => ({
  recordSecurityEvent: async (event: { type: string }) => {
    events.recorded.push(event);
    return true;
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: async () => [{ count: store.count, resetAt: new Date(Date.now() + 60_000) }],
    rateLimit: { deleteMany: async () => ({ count: 0 }) },
    user: { findUnique: async () => null },
  },
}));
vi.mock("@/lib/request", () => ({
  getIpHash: async () => "ip-hash",
  getClientIp: async () => "203.0.113.9",
  getCountryCode: async () => "IL",
}));
vi.mock("@/lib/email", () => ({ sendEmail: async () => ({ ok: true }), isEmailAddress: () => true }));

const { rateLimit, rateLimitScope } = await import("@/lib/rate-limit");
const { sendLoginEmailCode } = await import("@/lib/auth/email-code");

beforeEach(() => {
  events.recorded = [];
});

describe("rate_limited: the FIRST refusal of a window, with the key's scope only", () => {
  it("records once per window (count = limit + 1), never for later refusals or allowed requests", async () => {
    for (const count of [1, 5, 6, 7, 8]) {
      store.count = count;
      await rateLimit(`listing:create:user-123`, { limit: 5, windowSeconds: 60 });
    }
    expect(events.recorded).toEqual([{ type: "rate_limited", meta: { scope: "listing:create" } }]);
  });

  it("alert quotas (failOpen) are not security events", async () => {
    store.count = 2;
    await rateLimit("alerts:founder:x", { limit: 1, windowSeconds: 60, failOpen: true });
    expect(events.recorded).toEqual([]);
  });

  it("the scope never carries an id, a hash or an address", () => {
    expect(rateLimitScope("auth:otp-send:phone:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08")).toBe("auth:otp-send");
    expect(rateLimitScope("auth:totp:cmabc123def456")).toBe("auth:totp");
    expect(rateLimitScope("places:ip:unknown")).toBe("places:ip");
    expect(rateLimitScope("ba:9f86d081884c7d659a2feaa0c55ad015")).toBe("ba");
    expect(rateLimitScope("user@example.com")).toBe("other");
  });
});

describe("email_code_sent: codes by country (never the address)", () => {
  it("records the visitor's country and the route", async () => {
    await sendLoginEmailCode({ email: "someone@example.com", code: "123456", ttlSeconds: 600, route: "email" });
    expect(events.recorded).toEqual([{ type: "email_code_sent", meta: { route: "email", sent: true, country: "IL" } }]);
    expect(JSON.stringify(events.recorded)).not.toContain("someone@example.com");
  });
});
