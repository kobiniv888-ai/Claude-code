/**
 * Maintenance mode's session check (src/lib/maintenance/viewer.ts; SECURITY_REPORT 12.5.c) against
 * the local database: only a live session of an active account counts; "2-step done" needs the
 * code entered in this session, the 12-hour idle marker AND the session's staff cookie. Read-only
 * on the shared database; creates its own fake user, sessions and marker and removes them.
 */
import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { maintenanceViewer } = await import("@/lib/maintenance/viewer");
const { secureCookiesFor, sessionCookieName, staffCookieName } = await import("@/lib/auth/session-cookies");
const { staffActiveKey, staffCookiePayload } = await import("@/lib/auth/staff-session-rules");
const { hmacHash } = await import("@/lib/crypto");

const prefix = `mv${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const secure = secureCookiesFor(process.env);
const HOUR = 3600 * 1000;

const jar = (values: Record<string, string>) => ({ get: (name: string) => (name in values ? { value: values[name]! } : undefined) });

async function makeUser(name: string, role: "ADMIN" | "MODERATOR" | "USER", extra: { status?: "ACTIVE" | "BANNED" } = {}) {
  const id = `${prefix}-${name}`;
  await db.user.create({ data: { id, name, email: `${id}@example.com`, role, twoFactorEnabled: role !== "USER", status: extra.status ?? "ACTIVE" } });
  return id;
}

async function makeSession(userId: string, opts: { verified?: boolean; expiresInMs?: number } = {}) {
  const id = `${prefix}-s-${randomBytes(4).toString("hex")}`;
  const token = randomBytes(24).toString("base64url");
  await db.session.create({
    data: { id, token, userId, expiresAt: new Date(Date.now() + (opts.expiresInMs ?? 24 * HOUR)), twoFactorVerifiedAt: opts.verified ? new Date() : null },
  });
  return { id, token, cookie: `${token}.c2lnbmF0dXJl` };
}

const users: Record<string, string> = {};
beforeAll(async () => {
  users.admin = await makeUser("admin", "ADMIN");
  users.moderator = await makeUser("moderator", "MODERATOR");
  users.banned = await makeUser("banned", "ADMIN", { status: "BANNED" });
});

afterAll(async () => {
  await db.verification.deleteMany({ where: { identifier: { startsWith: `staff-active:${prefix}` } } });
  await db.session.deleteMany({ where: { userId: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.$disconnect();
});

describe("maintenance mode: who is asking", () => {
  it("no cookie, a malformed cookie or an unknown token: nobody", async () => {
    expect(await maintenanceViewer(jar({}))).toBeNull();
    expect(await maintenanceViewer(jar({ [sessionCookieName(secure)]: "%%%" }))).toBeNull();
    expect(await maintenanceViewer(jar({ [sessionCookieName(secure)]: `${randomBytes(24).toString("base64url")}.x` }))).toBeNull();
  });

  it("an ADMIN's session without the 2-step code (or without the staff cookie / idle marker) is not 'verified'", async () => {
    const pending = await makeSession(users.admin!);
    expect(await maintenanceViewer(jar({ [sessionCookieName(secure)]: pending.cookie }))).toEqual({ role: "ADMIN", twoFactorVerified: false });
    const verified = await makeSession(users.admin!, { verified: true });
    // Code entered, but no idle marker and no staff cookie: not enough.
    expect(await maintenanceViewer(jar({ [sessionCookieName(secure)]: verified.cookie }))).toEqual({ role: "ADMIN", twoFactorVerified: false });
    await db.verification.create({ data: { id: randomUUID(), identifier: staffActiveKey(verified.id), value: "1", expiresAt: new Date(Date.now() + HOUR) } });
    const staffCookie = hmacHash(staffCookiePayload(verified.id));
    expect(await maintenanceViewer(jar({ [sessionCookieName(secure)]: verified.cookie }))).toEqual({ role: "ADMIN", twoFactorVerified: false });
    expect(await maintenanceViewer(jar({ [sessionCookieName(secure)]: verified.cookie, [staffCookieName(secure)]: staffCookie }))).toEqual({
      role: "ADMIN",
      twoFactorVerified: true,
    });
    // Another session's staff cookie does not count.
    expect(
      await maintenanceViewer(jar({ [sessionCookieName(secure)]: verified.cookie, [staffCookieName(secure)]: hmacHash(staffCookiePayload(pending.id)) })),
    ).toEqual({ role: "ADMIN", twoFactorVerified: false });
  });

  it("an idle marker that ran out ends 'verified'", async () => {
    const idle = await makeSession(users.admin!, { verified: true });
    await db.verification.create({ data: { id: randomUUID(), identifier: staffActiveKey(idle.id), value: "1", expiresAt: new Date(Date.now() - 1000) } });
    const cookies = jar({ [sessionCookieName(secure)]: idle.cookie, [staffCookieName(secure)]: hmacHash(staffCookiePayload(idle.id)) });
    expect(await maintenanceViewer(cookies)).toEqual({ role: "ADMIN", twoFactorVerified: false });
  });

  it("an expired session or a banned account is nobody; a moderator is a moderator", async () => {
    const expired = await makeSession(users.admin!, { verified: true, expiresInMs: -1000 });
    expect(await maintenanceViewer(jar({ [sessionCookieName(secure)]: expired.cookie }))).toBeNull();
    const banned = await makeSession(users.banned!, { verified: true });
    expect(await maintenanceViewer(jar({ [sessionCookieName(secure)]: banned.cookie }))).toBeNull();
    const moderator = await makeSession(users.moderator!, { verified: true });
    expect((await maintenanceViewer(jar({ [sessionCookieName(secure)]: moderator.cookie })))?.role).toBe("MODERATOR");
  });
});
