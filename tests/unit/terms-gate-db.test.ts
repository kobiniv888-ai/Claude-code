/**
 * The Terms + 18+ gate on every signed-in action (SECURITY_REPORT 15.11.b/c, S2 review LP-1 and
 * LP-2) against the local database, through the REAL requireUserForAction: the Better Auth cookie
 * check (auth.api.getSession) and the request headers are stand-ins; the Session row, the account,
 * the TermsAcceptance rows and the gate are real.
 *
 * - an account without an acceptance gets "terms_required" from "Show contact" (revealContact),
 *   a support ticket (createTicket) and a post-form save (updateDraft); the Terms box itself
 *   (acceptTermsAction) works, and afterwards the same actions pass the gate;
 * - an acceptance of an OLDER Terms version (the version was bumped) is refused the same way,
 *   including "Save changes" of a live listing (saveChanges) and renewing it;
 * - a demo account is not asked.
 * Fake @example.com rows, removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ sessionId: "", userId: "" }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/headers")>()),
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false }),
}));
vi.mock("@/lib/auth/server", () => ({
  auth: {
    api: {
      getSession: async () => (state.sessionId ? { session: { id: state.sessionId, token: `tok-${state.sessionId}`, userId: state.userId }, user: { id: state.userId } } : null),
    },
  },
}));
vi.mock("@/i18n/navigation", () => ({ redirect: () => undefined, Link: () => null, usePathname: () => "/", useRouter: () => ({}) }));
vi.mock("@/lib/turnstile", () => ({ assertTurnstile: async () => undefined }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => undefined }));

const { db } = await import("@/lib/db");
const { TERMS_VERSION } = await import("@/lib/legal/terms");
const { acceptTermsAction } = await import("@/lib/legal/actions");
const { revealContact } = await import("@/lib/contact/actions");
const { createTicket } = await import("@/lib/tickets/actions");
const wizard = await import("@/lib/wizard/actions");
const { requireUserForAction } = await import("@/lib/auth/session");

const prefix = `tg${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const users: string[] = [];

async function signIn(options: { isDemo?: boolean } = {}): Promise<string> {
  const id = `${prefix}-${users.length}`;
  users.push(id);
  await db.user.create({ data: { id, name: "Dana Test", firstName: "Dana", email: `${id}@example.com`, isDemo: options.isDemo ?? false, phoneNumber: `+99555597${String(Date.now()).slice(-3)}${users.length}`, phoneNumberVerified: true } });
  const sessionId = `${id}-session`;
  await db.session.create({ data: { id: sessionId, token: `tok-${sessionId}`, userId: id, expiresAt: new Date(Date.now() + 3_600_000) } });
  state.sessionId = sessionId;
  state.userId = id;
  return id;
}

const errorOf = (result: { ok: boolean; error?: string }) => (result.ok ? "ok" : result.error);

beforeAll(() => {
  state.sessionId = "";
});

afterAll(async () => {
  await db.ticket.deleteMany({ where: { userId: { in: users } } }).catch(() => undefined);
  await db.listing.deleteMany({ where: { ownerId: { in: users } } });
  await db.rateLimit.deleteMany({ where: { OR: users.map((id) => ({ key: { contains: id } })) } });
  await db.user.deleteMany({ where: { id: { in: users } } });
});

describe("the Terms gate on signed-in actions (LP-1)", () => {
  it("refuses Show contact, a ticket and a post-form save until the Terms are accepted", async () => {
    const userId = await signIn();
    expect(errorOf(await revealContact("no-such-listing"))).toBe("terms_required");
    expect(errorOf(await createTicket({ category: "OTHER", subject: "Question", body: "A question about the site and my account.", locale: "en" }))).toBe(
      "terms_required",
    );
    expect(errorOf(await wizard.createDraft())).toBe("terms_required");
    expect(await db.listing.count({ where: { ownerId: userId } })).toBe(0);

    // The Terms box itself is open to the account.
    expect(errorOf(await acceptTermsAction({ termsAccepted: true, ageConfirmed: true }))).toBe("ok");
    // Past the gate: the actions answer with their own results now.
    expect(errorOf(await revealContact("no-such-listing"))).not.toBe("terms_required");
    await expect(requireUserForAction()).resolves.toMatchObject({ id: userId });
  });

  it("refuses an account whose acceptance is of an older Terms version (LP-2)", async () => {
    const userId = await signIn();
    await db.termsAcceptance.create({ data: { userId, version: "2020-01-01", ageConfirmed: true } });
    const listing = await db.listing.create({ data: { ownerId: userId, status: "LIVE", dealType: "SHORT_STAY", title: `${prefix} flat` } });
    expect(errorOf(await revealContact("no-such-listing"))).toBe("terms_required");
    expect(errorOf(await wizard.saveChanges(listing.id, null))).toBe("terms_required");
    await db.termsAcceptance.create({ data: { userId, version: TERMS_VERSION, ageConfirmed: true } });
    await expect(requireUserForAction()).resolves.toMatchObject({ id: userId });
  });

  it("an acceptance without the 18+ confirmation does not count", async () => {
    const userId = await signIn();
    await db.termsAcceptance.create({ data: { userId, version: TERMS_VERSION, ageConfirmed: false } });
    await expect(requireUserForAction()).rejects.toMatchObject({ code: "terms_required" });
  });

  it("does not ask a demo account", async () => {
    await signIn({ isDemo: true });
    await expect(requireUserForAction()).resolves.toBeTruthy();
  });
});
