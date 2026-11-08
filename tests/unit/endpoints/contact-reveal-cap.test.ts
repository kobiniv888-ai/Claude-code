/**
 * SECURITY_REPORT 4.6.e (founder's OK to Q14): "Show contact" for at most 40 different listings a
 * day per account, on the server, failing closed. Showing a listing already shown today is free;
 * a refused listing does not count as shown (or the next tap would skip the cap). The real action
 * runs; the session, the CAPTCHA, the listing lookup and the limit store are replaced (the store by
 * an in-memory copy of its fixed-window rule).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  counts: new Map<string, number>(),
  storeBroken: false,
  events: [] as { type: string; userId?: string | null; meta?: Record<string, unknown> | null }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  requireUserForAction: async () => ({ id: "guest-1", firstName: "Noa", name: "Noa", email: "guest-1@example.com", emailIsPlaceholder: false }),
}));
vi.mock("@/lib/turnstile", () => ({ assertTurnstile: async () => undefined }));
vi.mock("@/lib/security/events", () => ({
  recordSecurityEvent: async (event: { type: string; userId?: string | null; meta?: Record<string, unknown> | null }) => {
    state.events.push(event);
    return true;
  },
}));
vi.mock("@/lib/crypto", () => ({ hmacHash: (v: string) => v }));
vi.mock("@/lib/contact/server", () => ({
  findContactableListing: async (id: string) => ({
    id,
    ownerId: "owner-1",
    countryCode: "GE",
    contactMethods: [{ channel: "WHATSAPP", value: "+995500000099" }],
    owner: { email: "owner-1@example.com" },
  }),
  isBlockedBetween: async () => false,
  safetyTipSeen: async () => true,
}));
vi.mock("@/lib/rate-limit", async () => {
  const { RateLimitError } = await import("@/lib/errors");
  const rateLimit = async (key: string, { limit }: { limit: number }) => {
    const resetAt = new Date(Date.now() + 60_000);
    if (state.storeBroken) return { ok: false, remaining: 0, resetAt, failed: true };
    const count = (state.counts.get(key) ?? 0) + 1;
    state.counts.set(key, count);
    return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt };
  };
  return {
    rateLimit,
    assertRateLimit: async (key: string, options: { limit: number }) => {
      const result = await rateLimit(key, options);
      if (!result.ok) throw new RateLimitError(result.resetAt);
      return result;
    },
    resetRateLimit: async (key: string) => void state.counts.delete(key),
  };
});

const { revealContact } = await import("@/lib/contact/actions");
const { CONTACT_REVEALS_PER_DAY } = await import("@/lib/contact/limits");

describe("show contact: at most 40 different listings a day (4.6.e)", () => {
  beforeEach(() => {
    state.counts.clear();
    state.storeBroken = false;
    state.events = [];
  });

  it("shows 40 different listings, refuses the 41st, and showing one of the 40 again stays free", async () => {
    expect(CONTACT_REVEALS_PER_DAY).toBe(40);
    for (let i = 1; i <= 40; i++) {
      // The older hourly cap (30 an hour) is still there: an hour passes after the 30th.
      if (i === 31) state.counts.delete("contact-reveal:user:guest-1");
      const result = await revealContact(`listing-${i}`);
      expect(result.ok, `listing ${i}`).toBe(true);
    }
    expect(await revealContact("listing-41")).toEqual(expect.objectContaining({ ok: false, error: "rate_limited" }));
    // In the security log (for the alerts), without the listing or any contact detail.
    expect(state.events).toEqual([{ type: "show_contact_cap_hit", userId: "guest-1", meta: { limit: 40 } }]);
    // A listing already shown today: no new count.
    expect((await revealContact("listing-3")).ok).toBe(true);
    // The refused listing was not marked as shown: asking again is refused again, not let through.
    expect(await revealContact("listing-41")).toEqual(expect.objectContaining({ ok: false, error: "rate_limited" }));
    expect(await revealContact("listing-42")).toEqual(expect.objectContaining({ ok: false, error: "rate_limited" }));
  });

  it("fails closed when the limit store cannot be read", async () => {
    state.storeBroken = true;
    expect(await revealContact("listing-1")).toEqual(expect.objectContaining({ ok: false, error: "rate_limited" }));
    // A broken store is not somebody hitting the cap.
    expect(state.events).toEqual([]);
  });
});
