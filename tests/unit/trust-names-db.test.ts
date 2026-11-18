/**
 * S2 review TS-5 (SECURITY_REPORT 14.2.a) against the local database: the first-name step (the
 * public host name) and a booking's guest name (what the host reads) are checked for payment
 * details like every other user text, and a web address is never a name. Creates its own fake
 * user (@example.com) and removes it, its events and its automatic reports afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }) }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/request", () => ({ getIpHash: async () => `vitest-names-ip`, getClientIp: async () => "203.0.113.9", getDeviceHash: async () => null }));
vi.mock("@/lib/auth/session", () => ({ requireUserForAction: async () => state.user }));
vi.mock("@/lib/settings", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/settings")>()), assertNotShabbatMode: async () => {} }));

const { db } = await import("@/lib/db");
const { saveFirstName } = await import("@/lib/auth/profile-actions");
const { createBookingAction } = await import("@/lib/booking/actions");

const id = `vitest-names-${randomUUID().slice(0, 8)}`;
const startedAt = new Date();

beforeAll(async () => {
  await db.user.create({ data: { id, name: "", firstName: "Dana", email: `${id}@example.com`, emailVerified: true, locale: "en" } });
  state.user = { id, sessionId: `${id}-s`, email: `${id}@example.com`, emailIsPlaceholder: false, name: "", firstName: "Dana", locale: "en", twoFactorVerified: true };
});

afterAll(async () => {
  await db.report.deleteMany({ where: { targetUserId: id } });
  await db.securityEvent.deleteMany({ where: { userId: id } });
  await db.rateLimit.deleteMany({ where: { OR: [{ key: { contains: id } }, { key: { contains: "vitest-names-ip" } }] } });
  await db.user.deleteMany({ where: { id } });
});

describe("names are user text too (TS-5)", () => {
  it("saveFirstName refuses payment details, flags the account and keeps the old name", async () => {
    const result = await saveFirstName({ firstName: "Pay via WesternUnion" });
    expect(result).toMatchObject({ ok: false, error: "payment_in_text", fieldErrors: { firstName: ["paymentInText"] } });
    expect((await db.user.findUniqueOrThrow({ where: { id } })).firstName).toBe("Dana");
    const events = await db.securityEvent.findMany({ where: { userId: id, type: "payment_details_blocked", createdAt: { gte: startedAt } } });
    expect(events).toHaveLength(1);
    expect(events[0]?.meta).toMatchObject({ surface: "profile" });
    expect(await db.report.count({ where: { targetUserId: id, reason: "ASKED_MONEY_UPFRONT", details: { contains: "surface=profile " } } })).toBe(1);
  });

  it("saveFirstName refuses a web address as a name (paypal.me/x, bayit-pay.com)", async () => {
    for (const firstName of ["paypal.me/x", "bayit-pay.com"]) {
      expect(await saveFirstName({ firstName })).toMatchObject({ ok: false, error: "invalid_input", fieldErrors: { firstName: ["not_a_name"] } });
    }
    expect((await db.user.findUniqueOrThrow({ where: { id } })).firstName).toBe("Dana");
  });

  it("a booking's guest name with payment details is refused before anything is booked", async () => {
    const result = await createBookingAction({
      listingId: "not-a-real-listing",
      checkIn: "2027-03-01",
      checkOut: "2027-03-03",
      adults: 1,
      guestName: "Pay via WesternUnion",
      rulesAccepted: true,
    });
    expect(result).toMatchObject({ ok: false, error: "payment_in_text", fieldErrors: { guestName: ["paymentInText"] } });
    // "pay via wise.com" is not a name at all.
    const domain = await createBookingAction({ listingId: "x", checkIn: "2027-03-01", checkOut: "2027-03-03", adults: 1, guestName: "pay via wise.com", rulesAccepted: true });
    expect(domain).toMatchObject({ ok: false });
    expect(await db.booking.count({ where: { guestUserId: id } })).toBe(0);
  });
});
