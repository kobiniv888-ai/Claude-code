/**
 * SECURITY_REPORT 3.6.c / 12.6.c against the local database: a destructive staff action needs a
 * fresh AUTHENTICATOR proof in this session (src/lib/admin/server/staff-proof.ts, runStaffAction
 * in src/lib/admin/server/common.ts). An emailed code ("email_code") or an email login code
 * ("login_code") never counts (founder's decision 5). "consume" spends the proof after a success;
 * "window" keeps it for its 5 minutes. A failed action spends nothing.
 *
 * Only the staff session check and the rate limit are replaced; the proof rows are real
 * Verification rows ("fresh-proof:<session id>") and are removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ staff: { id: "staff-proof-admin", role: "ADMIN", sessionId: "", isDemo: false } }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  requireStaffForAction: async () => state.staff,
  isStaffTwoFactorSkipped: () => false,
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...real, assertRateLimit: async () => ({ ok: true, remaining: 100, resetAt: new Date(Date.now() + 60_000) }) };
});

const { db } = await import("@/lib/db");
const { markFreshProof } = await import("@/lib/auth/fresh-proof");
const { freshProofKey } = await import("@/lib/auth/fresh-proof-rules");
const { hasFreshStaffProof } = await import("@/lib/admin/server/staff-proof");
const { runStaffAction } = await import("@/lib/admin/server/common");
const { ok, fail } = await import("@/lib/action");

const sessions: string[] = [];
function newSession(): string {
  const id = `staff-proof-${randomUUID()}`;
  sessions.push(id);
  state.staff = { ...state.staff, sessionId: id };
  return id;
}

afterAll(async () => {
  await db.verification.deleteMany({ where: { identifier: { in: sessions.map(freshProofKey) } } });
});

let ran = 0;
const action = (result: "ok" | "fail" = "ok") => async () => {
  ran += 1;
  return result === "ok" ? ok() : fail("invalid_input");
};

describe("a fresh authenticator code before destructive staff actions (3.6.c)", () => {
  beforeEach(() => {
    ran = 0;
  });

  it("no proof: refused before the action runs", async () => {
    newSession();
    expect(await runStaffAction("settings", "test.proof", action(), { freshProof: "consume" })).toEqual({ ok: false, error: "fresh_proof_required" });
    expect(ran).toBe(0);
  });

  it("an emailed code or an email login code never counts for staff (decision 5)", async () => {
    for (const method of ["email_code", "login_code"] as const) {
      const sessionId = newSession();
      await markFreshProof(sessionId, method);
      expect(await hasFreshStaffProof(sessionId), method).toBe(false);
      expect(await runStaffAction("settings", "test.proof", action(), { freshProof: "window" }), method).toEqual({ ok: false, error: "fresh_proof_required" });
    }
    expect(ran).toBe(0);
  });

  it("an authenticator proof: 'consume' runs once and spends it", async () => {
    const sessionId = newSession();
    await markFreshProof(sessionId, "totp");
    expect(await runStaffAction("settings", "test.proof", action(), { freshProof: "consume" })).toEqual({ ok: true, data: undefined });
    expect(await runStaffAction("settings", "test.proof", action(), { freshProof: "consume" })).toEqual({ ok: false, error: "fresh_proof_required" });
    expect(ran).toBe(1);
    expect(await db.verification.count({ where: { identifier: freshProofKey(sessionId) } })).toBe(0);
  });

  it("a failed 'consume' action keeps the proof (nothing was done)", async () => {
    const sessionId = newSession();
    await markFreshProof(sessionId, "totp");
    expect((await runStaffAction("settings", "test.proof", action("fail"), { freshProof: "consume" })).ok).toBe(false);
    expect(await hasFreshStaffProof(sessionId)).toBe(true);
  });

  it("'window': one code covers several actions while it is fresh", async () => {
    const sessionId = newSession();
    await markFreshProof(sessionId, "totp");
    for (let i = 0; i < 3; i++) expect((await runStaffAction("settings", "test.proof", action(), { freshProof: "window" })).ok).toBe(true);
    expect(ran).toBe(3);
    expect(await hasFreshStaffProof(sessionId)).toBe(true);
  });

  it("an expired authenticator proof does not count", async () => {
    const sessionId = newSession();
    await markFreshProof(sessionId, "totp", new Date(Date.now() - 6 * 60 * 1000));
    expect(await hasFreshStaffProof(sessionId)).toBe(false);
  });

  it("the proof belongs to the session: another session of the same staff member has none", async () => {
    const first = newSession();
    await markFreshProof(first, "totp");
    newSession();
    expect(await runStaffAction("settings", "test.proof", action(), { freshProof: "window" })).toEqual({ ok: false, error: "fresh_proof_required" });
  });

  it("an action that is not destructive needs no proof", async () => {
    newSession();
    expect((await runStaffAction("settings", "test.proof", action())).ok).toBe(true);
  });

  it("`allow` refuses before a code is asked for", async () => {
    newSession();
    state.staff = { ...state.staff, role: "MODERATOR" };
    try {
      expect(await runStaffAction("reports", "test.proof", action(), { freshProof: "consume", allow: (s) => s.role === "ADMIN" })).toEqual({ ok: false, error: "forbidden" });
    } finally {
      state.staff = { ...state.staff, role: "ADMIN" };
    }
    expect(ran).toBe(0);
  });
});
