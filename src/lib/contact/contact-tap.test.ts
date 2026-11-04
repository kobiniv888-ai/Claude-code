/**
 * Contact taps keep only the channel and the time, never who tapped (founder's OK, round 3).
 * The tapper's id is used only to skip the owner's own taps. Older rows are cleared by the
 * clean-up "contact-taps" (Admin → Maintenance).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  updateMany: [] as unknown[],
  created: [] as unknown[],
  user: { id: "guest-1" } as { id: string },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/request", () => ({ getDeviceHash: async () => "d", getIpHash: async () => "i", getUserAgent: async () => "Mozilla/5.0" }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ ok: true }), assertRateLimit: async () => undefined }));
vi.mock("@/lib/crypto", () => ({ hmacHash: (v: string) => v }));
vi.mock("@/lib/db", () => {
  const db = {
    listing: {
      updateMany: async (args: { where: { ownerId?: { not: string } } }) => {
        calls.updateMany.push(args);
        return { count: 1 };
      },
    },
    contactClick: {
      create: (args: unknown) => {
        calls.created.push(args);
        return Promise.resolve(args);
      },
    },
    $executeRaw: () => Promise.resolve(1),
    $transaction: (items: Promise<unknown>[]) => Promise.all(items),
  };
  return { db };
});
vi.mock("@/lib/auth/session", () => ({ requireUserForAction: async () => calls.user }));
vi.mock("@/lib/turnstile", () => ({ assertTurnstile: async () => undefined }));
vi.mock("@/lib/settings", () => ({ assertNotShabbatMode: async () => undefined }));
vi.mock("@/lib/email", () => ({ isPlaceholderEmail: () => false, notificationEmailFor: () => null, sendEmail: async () => undefined }));
vi.mock("./server", () => ({
  findContactableListing: async (id: string) => ({
    id,
    ownerId: "owner-1",
    countryCode: "GE",
    contactMethods: [{ channel: "WHATSAPP", value: "+995555000011", order: 0 }],
    owner: { email: "owner@example.com" },
  }),
  isBlockedBetween: async () => false,
  safetyTipSeen: async () => false,
}));

describe("contact taps", () => {
  beforeEach(() => {
    calls.updateMany = [];
    calls.created = [];
  });

  it("stores only the listing and the channel, never the user", async () => {
    const { recordContactClick } = await import("@/lib/listing/stats");
    expect(await recordContactClick("listing-1", "WHATSAPP", "guest-1")).toBe(true);
    expect(calls.created).toEqual([{ data: { listingId: "listing-1", channel: "WHATSAPP" } }]);
    // The user id is used for the owner check only.
    expect(calls.updateMany).toEqual([expect.objectContaining({ where: expect.objectContaining({ ownerId: { not: "guest-1" } }) })]);
  });

  it("the tap action from the listing page stores no user id either", async () => {
    const { recordContactTap } = await import("./actions");
    expect(await recordContactTap("listing-2", "WHATSAPP")).toEqual({ ok: true, data: { recorded: true } });
    expect(calls.created).toHaveLength(1);
    expect(JSON.stringify(calls.created)).not.toContain("guest-1");
    expect(calls.created[0]).not.toHaveProperty("data.userId");
  });
});
