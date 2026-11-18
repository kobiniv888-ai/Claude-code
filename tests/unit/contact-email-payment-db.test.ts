/**
 * "Email the owner" (sendContactEmail) refuses payment details (SECURITY_REPORT 14.2.a, S2 review
 * TS-7): an IBAN in the message is refused with a field error, no email is sent, and ONE automatic
 * report names the SENDER (never the host's listing). The session, CAPTCHA, the Shabbat switch,
 * the listing lookup and the email sender are stand-ins; the guard, its report and the rate-limit
 * rows are real (fake @example.com user, removed afterwards).
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ userId: "", sent: [] as unknown[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  requireUserForAction: async () => ({ id: state.userId, firstName: "Noa", name: "Noa", email: `${state.userId}@example.com`, emailIsPlaceholder: false }),
}));
vi.mock("@/lib/turnstile", () => ({ assertTurnstile: async () => undefined }));
vi.mock("@/lib/settings", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/settings")>()), assertNotShabbatMode: async () => undefined }));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: async (message: unknown) => {
    state.sent.push(message);
    return { ok: true, delivery: "logged" };
  },
}));
vi.mock("@/lib/contact/server", () => ({
  findContactableListing: async (id: string) => ({
    id,
    publicId: 4242,
    title: "Test flat",
    ownerId: "owner-contact-payment",
    countryCode: "GE",
    contactMethods: [{ channel: "EMAIL", value: "owner-contact-payment@example.com" }],
    owner: { email: "owner-contact-payment@example.com", locale: "en", name: "Owner", accountType: "PRIVATE", businessName: null },
  }),
  isBlockedBetween: async () => false,
  safetyTipSeen: async () => true,
}));

const { db } = await import("@/lib/db");
const { sendContactEmail } = await import("@/lib/contact/actions");

const prefix = `cep${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const listingId = `${prefix}-listing`;

beforeAll(async () => {
  state.userId = `${prefix}-guest`;
  await db.user.create({ data: { id: state.userId, name: "Noa Guest", email: `${state.userId}@example.com` } });
});

afterAll(async () => {
  await db.report.deleteMany({ where: { targetUserId: state.userId } });
  await db.securityEvent.deleteMany({ where: { userId: state.userId } });
  await db.rateLimit.deleteMany({ where: { OR: [{ key: { contains: state.userId } }, { key: { contains: listingId } }] } });
  await db.user.deleteMany({ where: { id: state.userId } });
});

const input = (message: string) => ({ listingId, name: "Noa Guest", email: "noa@example.com", message, checkIn: null, checkOut: null, turnstileToken: null });

describe("sendContactEmail and payment details (TS-7)", () => {
  it("refuses an IBAN in the message, sends nothing and flags the sender", async () => {
    const result = await sendContactEmail(input("I overpaid, refund the difference to IBAN GE29NB0000000101904917 please."));
    expect(result).toMatchObject({ ok: false, error: "payment_in_text", fieldErrors: { message: ["paymentInText"] } });
    expect(state.sent).toHaveLength(0);
    const reports = await db.report.findMany({ where: { reporterId: null, details: { contains: "surface=contact_message " }, targetUserId: state.userId } });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ targetType: "USER", listingId: null, priority: "URGENT" });
  });

  it("sends a normal message", async () => {
    const result = await sendContactEmail(input("Hello, is the flat free for two adults next month?"));
    expect(result.ok).toBe(true);
    expect(state.sent).toHaveLength(1);
  });
});
