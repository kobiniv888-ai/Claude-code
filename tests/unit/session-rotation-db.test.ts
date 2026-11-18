/**
 * A new session id when a session gains rights (SECURITY_REPORT 3.5.b) and logging out on the
 * server (3.5.d), against the local database. The login library is replaced by a small stand-in
 * that stores sessions the same way (the cookie format is Better Auth's: token "." HMAC-SHA256
 * base64). Fake accounts (@example.com); every row is removed afterwards.
 */
import "dotenv/config";
import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const jar = vi.hoisted(() => new Map<string, { value: string; options?: Record<string, unknown> }>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => void jar.set(name, { value, options }),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers(),
}));

const SECRET = "test-secret-for-the-rotation-test-only-000";
vi.mock("@/lib/auth/server", async () => {
  const { db } = await import("@/lib/db");
  return {
    auth: {
      $context: Promise.resolve({
        secret: SECRET,
        authCookies: {
          sessionToken: { name: "__Host-bayit.session_token", attributes: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 2_592_000 } },
          sessionData: { name: "__Host-bayit.session_data", attributes: { secure: true, sameSite: "lax", path: "/" } },
          dontRememberToken: { name: "__Host-bayit.dont_remember", attributes: { secure: true, sameSite: "lax", path: "/" } },
        },
        internalAdapter: {
          createSession: async (userId: string, _dontRemember: boolean, override: { ipAddress?: string; userAgent?: string }) =>
            db.session.create({
              data: { id: randomUUID(), userId, token: randomUUID().replace(/-/g, ""), expiresAt: new Date(Date.now() + 86_400_000), ...override },
            }),
        },
      }),
    },
  };
});

const session = vi.hoisted(() => ({ value: null as null | { session: { id: string }; user: { id: string } } }));
const actionUser = vi.hoisted(() => ({ value: null as null | { id: string; sessionId: string; isStaff: boolean; twoFactorVerified: boolean } }));
vi.mock("@/lib/auth/session", async () => {
  const { AuthRequiredError } = await import("@/lib/errors");
  return {
    getSession: async () => session.value,
    requireUserForAction: async () => {
      if (!actionUser.value) throw new AuthRequiredError();
      return actionUser.value;
    },
  };
});

const { db } = await import("@/lib/db");
const { rotateSession, signedSessionValue } = await import("@/lib/auth/session-rotation");
const { markFreshProof, hasFreshProof } = await import("@/lib/auth/fresh-proof");
const { markStaffSessionActive } = await import("@/lib/auth/staff-session");
const { staffActiveKey } = await import("@/lib/auth/staff-session-rules");
const { logOutHere, logOutEverywhere } = await import("@/lib/auth/logout-actions");

const prefix = `rot${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const userIds: string[] = [];

async function makeUser(name: string) {
  const id = `${prefix}-${name}`;
  userIds.push(id);
  await db.user.create({ data: { id, name, email: `${id}@example.com` } });
  const sessionId = `${id}-s1`;
  await db.session.create({ data: { id: sessionId, userId: id, token: `${id}-token`, expiresAt: new Date(Date.now() + 86_400_000), userAgent: "test-agent" } });
  return { id, sessionId };
}

beforeEach(() => {
  jar.clear();
  session.value = null;
  actionUser.value = null;
});

afterAll(async () => {
  await db.verification.deleteMany({ where: { OR: userIds.map((id) => ({ identifier: { contains: id } })) } });
  const sessions = await db.session.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  await db.verification.deleteMany({ where: { identifier: { in: sessions.flatMap((s) => [`fresh-proof:${s.id}`, staffActiveKey(s.id)]) } } });
  await db.rateLimit.deleteMany({ where: { OR: userIds.map((id) => ({ key: { contains: id } })) } });
  await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await db.session.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("session rotation at the 2-step step (3.5.b)", () => {
  it("replaces the session: the old token is gone, the new one is verified and set as the signed cookie", async () => {
    const u = await makeUser("rotate");
    await markFreshProof(u.sessionId, "login_code");
    await markStaffSessionActive(u.sessionId);

    const rotated = await rotateSession({ userId: u.id, oldSessionId: u.sessionId, twoFactorVerified: true });
    expect(rotated.id).not.toBe(u.sessionId);
    expect(await db.session.count({ where: { id: u.sessionId } })).toBe(0);
    expect(await db.session.count({ where: { token: `${u.id}-token` } })).toBe(0);
    const row = await db.session.findUniqueOrThrow({ where: { id: rotated.id } });
    expect(row.twoFactorVerifiedAt).not.toBeNull();
    expect(row.userAgent).toBe("test-agent");

    const cookie = jar.get("__Host-bayit.session_token");
    const expectedSignature = createHmac("sha256", SECRET).update(rotated.token).digest("base64");
    expect(cookie?.value).toBe(`${rotated.token}.${expectedSignature}`);
    expect(cookie?.value).toBe(signedSessionValue(rotated.token, SECRET));
    expect(cookie?.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });

    // The fresh code of the login follows; the old session's staff marker does not.
    expect(await hasFreshProof(rotated.id)).toBe(true);
    expect(await hasFreshProof(u.sessionId)).toBe(false);
    expect(await db.verification.count({ where: { identifier: staffActiveKey(u.sessionId) } })).toBe(0);
  });

  it("refuses to rotate a session that is not the account's", async () => {
    const u = await makeUser("foreign");
    const other = await makeUser("other");
    await expect(rotateSession({ userId: u.id, oldSessionId: other.sessionId, twoFactorVerified: true })).rejects.toThrow();
    expect(await db.session.count({ where: { id: other.sessionId } })).toBe(1);
  });
});

describe("logging out ends the session on the server (3.5.d)", () => {
  it("logOutHere deletes this session row, expires the cookies, and says so only when the row is gone", async () => {
    const u = await makeUser("here");
    await db.session.create({ data: { id: `${u.id}-s2`, userId: u.id, token: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) } });
    session.value = { session: { id: u.sessionId }, user: { id: u.id } };

    expect(await logOutHere()).toEqual({ ok: true, data: undefined });
    expect(await db.session.count({ where: { id: u.sessionId } })).toBe(0);
    expect(await db.session.count({ where: { id: `${u.id}-s2` } })).toBe(1);
    expect(jar.get("__Host-bayit.session_token")).toMatchObject({ value: "", options: { maxAge: 0, secure: true, path: "/" } });

    // The row is already gone (another tab, a failed delete): not reported as a success.
    expect(await logOutHere()).toEqual({ ok: false, error: "logout_failed" });
  });

  it("logOutEverywhere ends every session of the account", async () => {
    const u = await makeUser("everywhere");
    await db.session.create({ data: { id: `${u.id}-s2`, userId: u.id, token: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) } });
    actionUser.value = { id: u.id, sessionId: u.sessionId, isStaff: false, twoFactorVerified: true };
    expect(await logOutEverywhere()).toEqual({ ok: true, data: { sessions: 2 } });
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
  });
});
