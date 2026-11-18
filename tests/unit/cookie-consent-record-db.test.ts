/**
 * The record of the cookie banner's choice (SECURITY_REPORT 15.5, 15.10.a) against the local
 * database: one AuditLog row "consent.cookies" with what was chosen, how, the consent version and
 * the cookie policy's date, and when (createdAt). A bad input is refused and writes nothing. The
 * session and the request's IP fingerprint are stand-ins; rows and rate-limit keys are removed.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

const ipHash = vi.hoisted(() => `ip-${Math.random().toString(36).slice(2)}`);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => null }));
vi.mock("@/lib/request", () => ({ getIpHash: async () => ipHash, getClientIp: async () => "203.0.113.9" }));

const { db } = await import("@/lib/db");
const { recordCookieConsent } = await import("@/lib/legal/consent-actions");
const { CONSENT_VERSION } = await import("@/lib/consent-cookie");
const { legalDocs } = await import("@/components/content/legal-docs");

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { action: "consent.cookies", ipHash } });
  await db.rateLimit.deleteMany({ where: { key: { contains: ipHash } } });
});

describe("recordCookieConsent (15.5)", () => {
  it("records what, how, which version and when", async () => {
    const before = new Date(Date.now() - 1000);
    expect((await recordCookieConsent({ preferences: true, analytics: false, v: CONSENT_VERSION, method: "custom" })).ok).toBe(true);
    const rows = await db.auditLog.findMany({ where: { action: "consent.cookies", ipHash } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: null, targetType: "CookieConsent" });
    expect(rows[0].details).toEqual({ preferences: true, analytics: false, v: CONSENT_VERSION, method: "custom", policyUpdated: legalDocs.cookies.lastUpdated });
    expect(rows[0].createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("refuses anything else and writes nothing", async () => {
    for (const bad of [{}, { preferences: "yes", analytics: false, v: CONSENT_VERSION, method: "custom" }, { preferences: true, analytics: true, v: 99, method: "accept_all" }, { preferences: true, analytics: true, v: CONSENT_VERSION, method: "accept_all", extra: randomUUID() }]) {
      expect((await recordCookieConsent(bad)).ok).toBe(false);
    }
    expect(await db.auditLog.count({ where: { action: "consent.cookies", ipHash } })).toBe(1);
  });
});
