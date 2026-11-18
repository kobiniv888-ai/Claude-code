/**
 * Contact taps keep only the channel and the time, never who tapped (founder's OK, round 3).
 * The tapper's id is used only to skip the host's and staff's own taps and for the anonymous
 * once-a-day check (src/lib/listing/stats-rules.ts). Older rows are cleared by the clean-up
 * "contact-taps" (Admin → Maintenance). The database rules are in src/lib/listing/stats.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  updateMany: [] as unknown[],
  created: [] as unknown[],
  keys: [] as string[],
  user: { id: "guest-1", isStaff: false } as { id: string; isStaff: boolean },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/request", () => ({
  getClientIp: async () => "203.0.113.1",
  getDeviceHash: async () => "d",
  getIpHash: async () => "i",
  getUserAgent: async () => "Mozilla/5.0",
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ ok: true }), assertRateLimit: async () => undefined }));
vi.mock("@/lib/crypto", () => ({ hmacHash: (v: string) => v }));
vi.mock("@/lib/db", () => {
  const db = {
    listing: {
      findUnique: async () => ({ status: "LIVE", isDemo: false, ownerId: "owner-1" }),
      updateMany: async (args: unknown) => {
        calls.updateMany.push(args);
        return { count: 1 };
      },
    },
    rateLimit: {
      // The day's pepper (src/lib/listing/stats.ts): none yet, so a fresh one is made.
      findFirst: async () => null,
      create: async (args: unknown) => args,
      createMany: async (args: { data: { key: string }[] }) => {
        const key = args.data[0].key;
        if (calls.keys.includes(key)) return { count: 0 };
        calls.keys.push(key);
        return { count: 1 };
      },
    },
    // No device link to the host's or a staff account.
    deviceLink: { findFirst: async () => null },
    contactClick: {
      create: (args: unknown) => {
        calls.created.push(args);
        return Promise.resolve(args);
      },
    },
    $executeRaw: () => Promise.resolve(1),
    $transaction: (items: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) =>
      typeof items === "function" ? items(db) : Promise.all(items),
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
    calls.keys = [];
  });

  it("stores only the listing and the channel, never the user", async () => {
    const { recordContactClick } = await import("@/lib/listing/stats");
    expect(await recordContactClick("listing-1", "WHATSAPP", { id: "guest-1" })).toBe(true);
    expect(calls.created).toEqual([{ data: { listingId: "listing-1", channel: "WHATSAPP" } }]);
    // The once-a-day key holds an anonymous daily ID, never the account id.
    expect(calls.keys).toHaveLength(1);
    expect(calls.keys[0]).not.toContain("guest-1");
    // The host's own taps are not counted.
    expect(await recordContactClick("listing-1", "PHONE", { id: "owner-1" })).toBe(false);
    expect(calls.created).toHaveLength(1);
  });

  it("the tap action from the listing page stores no user id either", async () => {
    const { recordContactTap } = await import("./actions");
    expect(await recordContactTap("listing-2", "WHATSAPP")).toEqual({ ok: true, data: { recorded: true } });
    expect(calls.created).toHaveLength(1);
    expect(JSON.stringify(calls.created)).not.toContain("guest-1");
    expect(calls.created[0]).not.toHaveProperty("data.userId");
  });
});
