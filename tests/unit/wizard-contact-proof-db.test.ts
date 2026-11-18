/**
 * SECURITY_REPORT 3.6.a / 14.3.b / 5.h against the local database: the guest-facing contact
 * details of a listing that was ever published change only after a fresh code in this session
 * (src/lib/wizard/actions.ts updateDraft, src/lib/wizard/contact-proof.ts).
 *
 * - LIVE listing, no proof: "fresh_proof_required", nothing saved;
 * - with a proof: saved, contactChangedAt set, the proof spent (a second change needs a new code),
 *   and the host gets the "contact details changed" notice;
 * - a never-published DRAFT, or contact hours only: no code needed.
 *
 * The session, the automatic re-check and email delivery are stand-ins; the fresh-proof rows,
 * rate limits and the listing are real. Fake @example.com user and test numbers; every row is
 * removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as null | Record<string, unknown>,
  emails: [] as { template: string; data: Record<string, unknown> }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => undefined }));
vi.mock("next-intl/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next-intl/server")>()), getLocale: async () => "he" }));
vi.mock("@/lib/auth/session", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    requireUserForAction: async () => {
      if (!state.user) throw new AppError("auth_required", "Sign-in required", { status: 401 });
      return state.user;
    },
  };
});
vi.mock("@/lib/settings", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/settings")>()), assertNotShabbatMode: async () => undefined }));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: async (input: { template: string; data: Record<string, unknown> }) => {
    state.emails.push({ template: input.template, data: input.data });
    return { ok: true, delivery: "logged" };
  },
}));
vi.mock("@/lib/listing/lifecycle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/listing/lifecycle")>()),
  recheckLiveListingAfterEdit: async () => undefined,
  holdLiveListingForReview: async () => undefined,
}));

const { db } = await import("@/lib/db");
const { markFreshProof } = await import("@/lib/auth/fresh-proof");
const { freshProofKey } = await import("@/lib/auth/fresh-proof-rules");
const { updateDraft } = await import("@/lib/wizard/actions");
const { contactChangeNeedsProof, maskedContactSummary } = await import("@/lib/wizard/contact-proof");

const prefix = `wcp${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const userId = `${prefix}-host`;
const sessionId = `${prefix}-session`;
const number = (tail: string) => `+99559${String(Date.now() % 100_000).padStart(5, "0")}${tail}`;
const OLD = number("11");
const NEW = number("22");
const ids = { live: "", draft: "" };

beforeAll(async () => {
  await db.user.create({
    data: { id: userId, name: `${prefix} Host`, email: `${prefix}@example.com`, phoneNumber: number("33"), phoneNumberVerified: true },
  });
  const base = { ownerId: userId, dealType: "SHORT_STAY" as const, title: `${prefix} flat`, contactMethods: [{ channel: "WHATSAPP", value: OLD, order: 0 }] };
  ids.live = (await db.listing.create({ data: { ...base, status: "LIVE", publishedAt: new Date() } })).id;
  ids.draft = (await db.listing.create({ data: { ...base, status: "DRAFT" } })).id;
});

afterAll(async () => {
  await db.verification.deleteMany({ where: { identifier: freshProofKey(sessionId) } });
  await db.securityEvent.deleteMany({ where: { userId } }).catch(() => undefined);
  await db.rateLimit.deleteMany({ where: { key: { contains: userId } } });
  await db.listing.deleteMany({ where: { ownerId: userId } });
  await db.user.deleteMany({ where: { id: userId } });
});

beforeEach(() => {
  state.emails = [];
  state.user = { id: userId, sessionId, role: "USER", phoneNumberVerified: true, isDemo: false, currency: null, keepsShabbat: false, businessName: null };
});

const contact = (value: string) => ({ contactMethods: [{ channel: "WHATSAPP", value, order: 0 }] });
const stored = async (id: string) => db.listing.findUniqueOrThrow({ where: { id }, select: { contactMethods: true, contactChangedAt: true } });

describe("the rule (pure)", () => {
  it("only the contact channels of a listing past the draft stage need a code", () => {
    expect(contactChangeNeedsProof("contact", "LIVE", true)).toBe(true);
    for (const status of ["PAUSED", "IN_REVIEW", "NEEDS_CHANGES", "REJECTED", "EXPIRED"] as const) expect(contactChangeNeedsProof("contact", status, true), status).toBe(true);
    expect(contactChangeNeedsProof("contact", "DRAFT", true)).toBe(false);
    expect(contactChangeNeedsProof("contact", "LIVE", false)).toBe(false);
    expect(contactChangeNeedsProof("text", "LIVE", true)).toBe(false);
  });

  it("the notice shows the new channels masked", () => {
    const summary = maskedContactSummary([{ channel: "WHATSAPP", value: NEW }, { channel: "TELEGRAM", value: "@somebody" }]);
    expect(summary).toContain(`WHATSAPP ••• ••• ••${NEW.slice(-2)}`);
    expect(summary).not.toContain(NEW.slice(-6));
    expect(summary).not.toContain("somebody");
  });
});

describe("a published listing's contact details need a fresh code (3.6.a)", () => {
  it("without a code: refused, nothing saved", async () => {
    await db.verification.deleteMany({ where: { identifier: freshProofKey(sessionId) } });
    expect(await updateDraft(ids.live, "contact", contact(NEW))).toEqual({ ok: false, error: "fresh_proof_required" });
    const row = await stored(ids.live);
    expect(JSON.stringify(row.contactMethods)).toContain(OLD);
    expect(row.contactChangedAt).toBeNull();
    expect(state.emails).toEqual([]);
  });

  it("with a code: saved, contactChangedAt set, the code spent and the host told", async () => {
    await markFreshProof(sessionId, "email_code");
    const result = await updateDraft(ids.live, "contact", contact(NEW));
    expect(result.ok).toBe(true);
    const row = await stored(ids.live);
    expect(JSON.stringify(row.contactMethods)).toContain(NEW);
    expect(row.contactChangedAt).toBeInstanceOf(Date);
    expect(await db.verification.count({ where: { identifier: freshProofKey(sessionId) } })).toBe(0);
    const notice = state.emails.find((e) => e.template === "security_change");
    expect(notice?.data).toMatchObject({ kind: "listing_contact" });
    expect(String(notice?.data.masked)).not.toContain(NEW);

    // One code, one change: the next change asks again.
    expect(await updateDraft(ids.live, "contact", contact(OLD))).toEqual({ ok: false, error: "fresh_proof_required" });
    expect(JSON.stringify((await stored(ids.live)).contactMethods)).toContain(NEW);
  });

  it("the same channels again, or only the contact hours: no code needed", async () => {
    await db.verification.deleteMany({ where: { identifier: freshProofKey(sessionId) } });
    expect((await updateDraft(ids.live, "contact", contact(NEW))).ok).toBe(true);
    expect((await updateDraft(ids.live, "contact", { contactHoursFrom: "09:00", contactHoursTo: "18:00" })).ok).toBe(true);
  });

  it("a never-published draft: no code needed", async () => {
    await db.verification.deleteMany({ where: { identifier: freshProofKey(sessionId) } });
    expect((await updateDraft(ids.draft, "contact", contact(NEW))).ok).toBe(true);
    expect(JSON.stringify((await stored(ids.draft)).contactMethods)).toContain(NEW);
    expect(state.emails).toEqual([]);
  });
});
