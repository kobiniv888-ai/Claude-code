/**
 * Sessions, fresh codes and 2-step login against the local database (SECURITY_REPORT 3.5, 3.6, 3.7).
 * Fake accounts only (@example.com, no real phone numbers); every row is removed afterwards.
 *
 * - 3.6.a/3.5.e/3.6.d: the contact email changes only after a fresh code AND a code to the new
 *   address; the other sessions end; the OLD address is told.
 * - fresh codes: hashed, single use, 5 tries (also with 10 guesses at once), resend waits.
 * - 3.7.a: 20 wrong 2-step codes in a day lock the account; the email code ONLY resets the count.
 * - 3.7.c/e: 10 hashed recovery codes at setup, each works once, new ones cancel the old, a use is
 *   logged (audit + security event) and the account is emailed.
 * - 3.5.c: 12 idle hours end a staff session's 2-step check; 3.5.a: the Strict staff cookie.
 * - 3.6.e: a new device alerts staff (and the founder), not the first device, not a known one.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import * as OTPAuth from "otpauth";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const jar = vi.hoisted(() => new Map<string, { value: string; options?: Record<string, unknown> }>());
const requestHeaders = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => void jar.set(name, { value, options }),
    delete: (name: string) => void jar.delete(name),
    getAll: () => [...jar.entries()].map(([name, c]) => ({ name, value: c.value })),
    has: (name: string) => jar.has(name),
  }),
  headers: async () => new Headers(Object.fromEntries(requestHeaders)),
}));

type Sent = { to: string; template: string; data: Record<string, unknown> };
const sent = vi.hoisted(() => [] as Sent[]);
vi.mock("@/lib/email", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...original,
    sendEmail: vi.fn(async (input: Sent) => {
      sent.push({ to: input.to, template: input.template, data: input.data });
      return { ok: true, delivery: "logged" };
    }),
  };
});
vi.mock("@/lib/alerts/founder-admin", () => ({
  sendFounderEmail: vi.fn(async (template: string, data: Record<string, unknown>) => {
    sent.push({ to: "founder", template, data });
    return true;
  }),
}));

type FakeUser = Record<string, unknown> & { id: string; sessionId: string; email: string; twoFactorEnabled: boolean; twoFactorVerified: boolean; isStaff: boolean };
const current = vi.hoisted(() => ({ user: null as FakeUser | null }));
vi.mock("@/lib/auth/session", async () => {
  const { AuthRequiredError } = await import("@/lib/errors");
  return {
    getCurrentUser: async () => current.user,
    requireUserForAction: async () => {
      if (!current.user || !current.user.twoFactorVerified) throw new AuthRequiredError();
      return current.user;
    },
  };
});
// The rotation itself is tested in session-rotation-db.test.ts: here a new verified row is enough.
vi.mock("@/lib/auth/session-rotation", async () => {
  const { db } = await import("@/lib/db");
  return {
    rotateSession: vi.fn(async ({ userId, oldSessionId, twoFactorVerified }: { userId: string; oldSessionId: string; twoFactorVerified: boolean }) => {
      const id = `${oldSessionId}-r`;
      await db.session.create({
        data: { id, userId, token: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000), twoFactorVerifiedAt: twoFactorVerified ? new Date() : null },
      });
      await db.session.deleteMany({ where: { id: oldSessionId } });
      if (current.user) Object.assign(current.user, { sessionId: id, twoFactorVerified: true, staffCookieOk: true });
      return { id, token: "t" };
    }),
  };
});

const { db } = await import("@/lib/db");
const { encryptString, hmacHash } = await import("@/lib/crypto");
const { runAction, ok } = await import("@/lib/action");
const freshProof = await import("@/lib/auth/fresh-proof");
const proofActions = await import("@/lib/auth/fresh-proof-actions");
const contactActions = await import("@/lib/auth/contact-email-actions");
const twoStep = await import("@/lib/auth/actions");
const { checkAccountTotp } = await import("@/lib/auth/two-factor");
const { recoveryCodeHash } = await import("@/lib/auth/recovery-codes");
const { normalizeRecoveryCode } = await import("@/lib/auth/recovery-code-format");
const { endOtherSessions } = await import("@/lib/auth/account-sessions");
const staffSession = await import("@/lib/auth/staff-session");
const { staffActiveKey } = await import("@/lib/auth/staff-session-rules");
const { securityCodeKey, decodeSecurityCode } = await import("@/lib/auth/fresh-proof-rules");
const { resetRateLimit } = await import("@/lib/rate-limit");
const { totpWrongKey } = await import("@/lib/auth/totp-lockout");
const { afterSignIn } = await import("@/lib/auth/hooks");
const { staffCookieName, secureCookiesFor } = await import("@/lib/auth/session-cookies");

const prefix = `s2fa${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const userIds: string[] = [];

async function makeUser(name: string, extra: Record<string, unknown> = {}) {
  const id = `${prefix}-${name}`;
  userIds.push(id);
  await db.user.create({ data: { id, name, firstName: name, email: `${id}@example.com`, emailVerified: true, ...extra } });
  const sessionId = `${id}-s1`;
  await db.session.create({ data: { id: sessionId, userId: id, token: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000), twoFactorVerifiedAt: new Date() } });
  return { id, sessionId, email: `${id}@example.com` };
}

function asCurrent(u: { id: string; sessionId: string; email: string }, extra: Partial<FakeUser> = {}): FakeUser {
  return {
    id: u.id,
    sessionId: u.sessionId,
    email: u.email,
    emailIsPlaceholder: false,
    name: "Test",
    phoneNumber: null,
    phoneNumberVerified: false,
    isDemo: false,
    isStaff: false,
    role: "USER",
    twoFactorEnabled: false,
    twoFactorVerified: true,
    staffCookieOk: false,
    ...extra,
  };
}

/** The code inside the last security_code email to `to`. */
function lastCode(to: string): string {
  const mail = [...sent].reverse().find((m) => m.template === "security_code" && m.to === to);
  if (!mail) throw new Error(`no security code sent to ${to}`);
  return String(mail.data.code);
}

function totpNow(secret: string, offsetSteps = 0): string {
  return new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate({ timestamp: Date.now() + offsetSteps * 30_000 });
}

/** A documentation-range address (RFC 5737), so the per-IP code limits have their own key, removed afterwards. */
const TEST_IP = "198.51.100.77";

beforeEach(() => {
  sent.length = 0;
  jar.clear();
  requestHeaders.clear();
  requestHeaders.set("x-forwarded-for", TEST_IP);
  current.user = null;
});

afterAll(async () => {
  const sessions = await db.session.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const ids = sessions.map((s) => s.id);
  await db.verification.deleteMany({
    where: {
      OR: [
        { identifier: { in: ids.flatMap((id) => [`fresh-proof:${id}`, staffActiveKey(id), `fresh-proof:${id}-r`, staffActiveKey(`${id}-r`)]) } },
        ...userIds.flatMap((id) => [{ identifier: { contains: id } }]),
      ],
    },
  });
  await db.rateLimit.deleteMany({ where: { OR: [...userIds.map((id) => ({ key: { contains: id } })), { key: { contains: hmacHash(`ip:${TEST_IP}`) } }] } });
  await db.securityEvent.deleteMany({ where: { userId: { in: userIds } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await db.deviceLink.deleteMany({ where: { userId: { in: userIds } } });
  await db.twoFactorRecoveryCode.deleteMany({ where: { userId: { in: userIds } } });
  await db.session.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("fresh proof before sensitive changes (3.6)", () => {
  it("refuses a sensitive action without a fresh code, as fresh_proof_required", async () => {
    const u = await makeUser("gate");
    const result = await runAction(async () => {
      await freshProof.requireFreshProof({ sessionId: u.sessionId });
      return ok();
    });
    expect(result).toEqual({ ok: false, error: "fresh_proof_required" });
  });

  it("emails a hashed, single-use code to the LOGIN address and accepts it once", async () => {
    const u = await makeUser("proof");
    current.user = asCurrent(u);
    const sentResult = await proofActions.sendProofCode();
    expect(sentResult).toMatchObject({ ok: true, data: { sent: true, retryAfterSeconds: 60 } });
    const code = lastCode(u.email);
    expect(code).toMatch(/^\d{6}$/);
    const row = await db.verification.findFirst({ where: { identifier: securityCodeKey(u.id, "confirm") } });
    expect(row?.value).not.toContain(code);
    expect(decodeSecurityCode(row?.value)).toMatchObject({ attempts: 0, sent: 1 });

    // The resend wait is on the server.
    expect(await proofActions.sendProofCode()).toMatchObject({ ok: true, data: { sent: false } });

    expect(await proofActions.confirmProof({ method: "email", code })).toEqual({ ok: true, data: undefined });
    expect(await freshProof.hasFreshProof(u.sessionId)).toBe(true);
    // Single use.
    expect(await proofActions.confirmProof({ method: "email", code })).toEqual({ ok: false, error: "code_expired" });
  });

  it("counts parallel wrong guesses one by one: a code dies after exactly 5", async () => {
    const u = await makeUser("parallel");
    const issued = await freshProof.issueSecurityCode({ userId: u.id, purpose: "confirm" });
    if (!issued.ok) throw new Error("not issued");
    const wrong = issued.code === "000000" ? "111111" : "000000";
    const results = await Promise.all(Array.from({ length: 10 }, () => freshProof.checkSecurityCode({ userId: u.id, purpose: "confirm", code: wrong })));
    expect(results.filter((r) => r === "wrong")).toHaveLength(4);
    const row = await db.verification.findFirst({ where: { identifier: securityCodeKey(u.id, "confirm") } });
    expect(decodeSecurityCode(row?.value)?.attempts).toBe(5);
    // Dead: the right code no longer works.
    expect(await freshProof.checkSecurityCode({ userId: u.id, purpose: "confirm", code: issued.code })).not.toBe("ok");
  });
});

describe("changing the contact email (3.6.a, 3.5.e, 3.6.d)", () => {
  it("needs a fresh code, then a code to the new address; ends other sessions; tells the old address", async () => {
    const u = await makeUser("contact");
    await db.session.create({ data: { id: `${u.id}-s2`, userId: u.id, token: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) } });
    current.user = asCurrent(u);
    const next = `${u.id}-new@example.com`;

    expect(await contactActions.sendContactEmailCode({ contactEmail: next })).toEqual({ ok: false, error: "fresh_proof_required" });
    expect(sent).toHaveLength(0);

    await freshProof.markFreshProof(u.sessionId, "email_code");
    expect(await contactActions.sendContactEmailCode({ contactEmail: next })).toMatchObject({ ok: true, data: { sent: true } });
    const code = lastCode(next);

    // The code is bound to that address.
    expect(await contactActions.confirmContactEmailChange({ contactEmail: `${u.id}-other@example.com`, code })).toMatchObject({ ok: false });
    // (The wrong address used up a try; the right one still works.)
    const saved = await contactActions.confirmContactEmailChange({ contactEmail: next, code });
    expect(saved).toEqual({ ok: true, data: { contactEmail: next, sessionsEnded: 1 } });

    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).contactEmail).toBe(next);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(1);
    expect(await db.session.count({ where: { id: u.sessionId } })).toBe(1);
    const notice = sent.find((m) => m.template === "security_change");
    expect(notice).toMatchObject({ to: u.email, data: { kind: "contact_email" } });
    expect(String(notice?.data.masked)).not.toContain(`${u.id}-new`);
    expect(await db.securityEvent.count({ where: { userId: u.id, type: "sensitive_change" } })).toBe(1);
    // The proof is used up.
    expect(await freshProof.hasFreshProof(u.sessionId)).toBe(false);
  });
});

describe("2-step login: daily lock and the email reset (3.7.a, decision 5)", () => {
  it("locks after 20 wrong codes; the email code only resets the count; the app code is still needed", async () => {
    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    const u = await makeUser("lock", { twoFactorEnabled: true, totpSecret: encryptString(secret) });
    await db.session.update({ where: { id: u.sessionId }, data: { twoFactorVerifiedAt: null } });
    current.user = asCurrent(u, { twoFactorEnabled: true, twoFactorVerified: false });
    const wrong = totpNow(secret) === "000000" ? "111111" : "000000";

    let last: unknown = null;
    for (let i = 0; i < 20; i++) {
      await resetRateLimit(`auth:totp:${u.id}`); // the 5-per-10-minutes limit is tested elsewhere
      last = await twoStep.verifyTotpForSession({ code: wrong });
    }
    expect(last).toEqual({ ok: false, error: "totp_locked" });
    await resetRateLimit(`auth:totp:${u.id}`);
    // Locked: even the right code is not checked.
    expect(await twoStep.verifyTotpForSession({ code: totpNow(secret) })).toEqual({ ok: false, error: "totp_locked" });
    expect(sent.some((m) => m.template === "security_change" && m.data.kind === "totp_locked")).toBe(true);
    expect(await db.securityEvent.count({ where: { userId: u.id, type: "totp_locked" } })).toBe(1);

    expect(await proofActions.sendUnlockCode()).toMatchObject({ ok: true, data: { sent: true } });
    expect(await proofActions.confirmUnlockCode({ code: lastCode(u.email) })).toEqual({ ok: true, data: undefined });
    // Only the counter: the session is still waiting for its 2-step code.
    expect((await db.session.findUniqueOrThrow({ where: { id: u.sessionId } })).twoFactorVerifiedAt).toBeNull();
    expect(await db.rateLimit.count({ where: { key: totpWrongKey(u.id) } })).toBe(0);

    await resetRateLimit(`auth:totp:${u.id}`);
    expect(await twoStep.verifyTotpForSession({ code: totpNow(secret) })).toEqual({ ok: true, data: undefined });
  });

  it("refuses the unlock code for an account that is not locked", async () => {
    const u = await makeUser("notlocked", { twoFactorEnabled: true, totpSecret: encryptString(new OTPAuth.Secret({ size: 20 }).base32) });
    current.user = asCurrent(u, { twoFactorEnabled: true, twoFactorVerified: false });
    expect(await proofActions.sendUnlockCode()).toEqual({ ok: false, error: "not_locked" });
  });

  it("accepts a code once, even from two requests at the same moment (replay check in one transaction)", async () => {
    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    const u = await makeUser("replay", { twoFactorEnabled: true, totpSecret: encryptString(secret) });
    const code = totpNow(secret);
    const results = await Promise.all([checkAccountTotp(u.id, code), checkAccountTotp(u.id, code), checkAccountTotp(u.id, code)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe("recovery codes (3.7.c, 3.7.e)", () => {
  it("are made at setup (after a fresh code), stored hashed, work once, and new ones cancel the old", async () => {
    const u = await makeUser("recovery");
    current.user = asCurrent(u);
    expect(await twoStep.startTotpEnrollment()).toEqual({ ok: false, error: "fresh_proof_required" });
    await freshProof.markFreshProof(u.sessionId, "email_code");
    const started = await twoStep.startTotpEnrollment();
    if (!started.ok) throw new Error(started.error);
    await resetRateLimit(`auth:totp:${u.id}`);
    const confirmed = await twoStep.confirmTotpEnrollment({ code: totpNow(started.data.secret) });
    if (!confirmed.ok) throw new Error(confirmed.error);
    const codes = confirmed.data.recoveryCodes;
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    const rows = await db.twoFactorRecoveryCode.findMany({ where: { userId: u.id } });
    expect(rows).toHaveLength(10);
    for (const row of rows) for (const code of codes) expect(row.codeHash).not.toContain(code.replace("-", ""));
    expect(rows.map((r) => r.codeHash)).toContain(recoveryCodeHash(u.id, normalizeRecoveryCode(codes[0])!));
    expect(sent.some((m) => m.template === "security_change" && m.data.kind === "two_factor_on")).toBe(true);

    // A new login waiting for its 2-step code: a recovery code lets it in, once.
    current.user = asCurrent(u, { sessionId: current.user!.sessionId, twoFactorEnabled: true, twoFactorVerified: false });
    await resetRateLimit(`auth:totp:${u.id}`);
    expect(await twoStep.verifyRecoveryCodeForSession({ code: codes[0].toLowerCase() })).toEqual({ ok: true, data: { left: 9 } });
    expect(sent.some((m) => m.template === "security_change" && m.data.kind === "recovery_code_used" && m.data.left === 9)).toBe(true);
    expect(await db.auditLog.count({ where: { actorId: u.id, action: "auth.recovery" } })).toBe(1);
    expect(await db.securityEvent.count({ where: { userId: u.id, type: "recovery_code_used" } })).toBe(1);
    current.user!.twoFactorVerified = false;
    expect(await twoStep.verifyRecoveryCodeForSession({ code: codes[0] })).toEqual({ ok: false, error: "recovery_code_invalid" });

    // New codes need a fresh code and cancel the old set.
    current.user!.twoFactorVerified = true;
    await freshProof.consumeFreshProof(current.user!.sessionId);
    expect(await twoStep.regenerateRecoveryCodes()).toEqual({ ok: false, error: "fresh_proof_required" });
    await freshProof.markFreshProof(current.user!.sessionId, "totp");
    const fresh = await twoStep.regenerateRecoveryCodes();
    expect(fresh.ok).toBe(true);
    current.user!.twoFactorVerified = false;
    expect(await twoStep.verifyRecoveryCodeForSession({ code: codes[1] })).toEqual({ ok: false, error: "recovery_code_invalid" });
  });
});

describe("staff sessions (3.5.a, 3.5.c)", () => {
  it("ends a staff session's 2-step check after 12 idle hours", async () => {
    const u = await makeUser("idle", { role: "MODERATOR", twoFactorEnabled: true });
    await staffSession.markStaffSessionActive(u.sessionId);
    expect(await staffSession.checkStaffSessionIdle({ userId: u.id, sessionId: u.sessionId })).toBe("active");
    await db.verification.updateMany({ where: { identifier: staffActiveKey(u.sessionId) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await staffSession.checkStaffSessionIdle({ userId: u.id, sessionId: u.sessionId })).toBe("idle");
    expect((await db.session.findUniqueOrThrow({ where: { id: u.sessionId } })).twoFactorVerifiedAt).toBeNull();
    expect(await db.securityEvent.count({ where: { userId: u.id, type: "staff_session_idle_logout" } })).toBe(1);
    // No marker at all (a session from before) counts as idle too.
    expect(await staffSession.checkStaffSessionIdle({ userId: u.id, sessionId: `${u.sessionId}-none` })).toBe("idle");
  });

  it("sets a SameSite=Strict, HttpOnly staff cookie bound to the session", async () => {
    await staffSession.issueStaffCookie("session-a");
    const name = staffCookieName(secureCookiesFor(process.env));
    expect(jar.get(name)?.options).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/", maxAge: 12 * 3600 });
    expect(await staffSession.hasStaffCookie("session-a")).toBe(true);
    expect(await staffSession.hasStaffCookie("session-b")).toBe(false);
    await staffSession.clearStaffCookie();
    expect(await staffSession.hasStaffCookie("session-a")).toBe(false);
  });

  it("endOtherSessions keeps the current one", async () => {
    const u = await makeUser("others");
    await db.session.createMany({
      data: [1, 2].map((n) => ({ id: `${u.id}-o${n}`, userId: u.id, token: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) })),
    });
    expect(await endOtherSessions(u.id, u.sessionId)).toBe(2);
    expect((await db.session.findMany({ where: { userId: u.id } })).map((s) => s.id)).toEqual([u.sessionId]);
  });
});

describe("new-device alerts (3.6.e)", () => {
  it("emails staff (and the founder) on a new device, never on the first device or a known one; a code login is a fresh proof", async () => {
    const u = await makeUser("device", { role: "MODERATOR" });
    requestHeaders.set("user-agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36");
    jar.set("bayit_did", { value: randomUUID() });
    await afterSignIn({ id: u.sessionId, userId: u.id }, "/sign-in/email-otp");
    expect(sent).toHaveLength(0); // the first device
    expect(await freshProof.hasFreshProof(u.sessionId)).toBe(true);

    await afterSignIn({ id: u.sessionId, userId: u.id }, "/callback/:id");
    expect(sent).toHaveLength(0); // the same device again

    jar.set("bayit_did", { value: randomUUID() });
    await afterSignIn({ id: u.sessionId, userId: u.id }, "/callback/:id");
    expect(sent.map((m) => [m.to, m.template])).toEqual([
      [u.email, "security_new_device"],
      ["founder", "security_staff_alert"],
    ]);
    expect(sent[0]?.data.device).toBe("Chrome · Android");
    expect(await db.securityEvent.count({ where: { userId: u.id, type: "new_device_login" } })).toBe(1);
  });

  it("does not email a guest (no listings, not staff) about a new device", async () => {
    const u = await makeUser("guest");
    jar.set("bayit_did", { value: randomUUID() });
    await afterSignIn({ id: u.sessionId, userId: u.id }, undefined);
    jar.set("bayit_did", { value: randomUUID() });
    await afterSignIn({ id: u.sessionId, userId: u.id }, undefined);
    expect(sent).toHaveLength(0);
    expect(await db.securityEvent.count({ where: { userId: u.id, type: "new_device_login" } })).toBe(1);
  });
});
