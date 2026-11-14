/**
 * SECURITY_REPORT 4.6.e (contact-reveal-race-1) against the real RateLimit table: the 40-a-day
 * "Show contact" cap holds for PARALLEL calls. Before the fix a call still being checked already
 * counted as "seen" (and a refusal reset it), so 3 parallel calls for a new listing past the cap
 * showed 2 of them. Now the "seen" marker is written only after the caps pass
 * (src/lib/contact/seen-store.ts), so:
 *
 * (a) with the daily key at 40, 3 parallel calls for each of 5 new listings show nothing;
 * (b) under the cap, 3 parallel first views of one listing are all shown, and a 4th (sequential)
 *     view of it is free (the daily count does not move).
 *
 * The session, the CAPTCHA, the listing lookup and the security log are stand-ins; the rate-limit
 * store is real. Its rows are removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ userId: "" }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  requireUserForAction: async () => ({ id: state.userId, firstName: "Noa", name: "Noa", email: `${state.userId}@example.com`, emailIsPlaceholder: false }),
}));
vi.mock("@/lib/turnstile", () => ({ assertTurnstile: async () => undefined }));
vi.mock("@/lib/security/events", () => ({ recordSecurityEvent: async () => true }));
vi.mock("@/lib/contact/server", () => ({
  findContactableListing: async (id: string) => ({
    id,
    ownerId: "owner-race",
    countryCode: "GE",
    contactMethods: [{ channel: "WHATSAPP", value: "+995500000099" }],
    owner: { email: "owner-race@example.com" },
  }),
  isBlockedBetween: async () => false,
  safetyTipSeen: async () => true,
}));

const { db } = await import("@/lib/db");
const { hmacHash } = await import("@/lib/crypto");
const { revealContact } = await import("@/lib/contact/actions");
const { CONTACT_REVEALS_PER_DAY } = await import("@/lib/contact/limits");

const prefix = `race${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const users: string[] = [];
const listings: string[] = [];
function newUser(): string {
  state.userId = `${prefix}-guest-${users.length}`;
  users.push(state.userId);
  return state.userId;
}
function newListing(): string {
  const id = `${prefix}-listing-${listings.length}`;
  listings.push(id);
  return id;
}
const dailyKey = (userId: string) => `contact-reveal:daily:${userId}`;
const dailyCount = async (userId: string) => Number((await db.rateLimit.findUnique({ where: { key: dailyKey(userId) } }))?.count ?? 0);

afterAll(async () => {
  await db.rateLimit.deleteMany({
    where: {
      OR: [
        { key: { in: users.flatMap((u) => [dailyKey(u), `contact-reveal:user:${u}`]) } },
        { key: { in: listings.map((l) => `contact-reveal:listing:${l}`) } },
      ],
    },
  });
  // The hashed "seen" markers of these test users and listings (the same hash as the action).
  const seen = users.flatMap((u) => listings.map((l) => `contact-reveal:seen:${hmacHash(`contact-reveal|${u}|${l}`)}`));
  await db.rateLimit.deleteMany({ where: { key: { in: seen } } });
});

describe("show contact: the daily cap holds for parallel calls (contact-reveal-race-1)", () => {
  it("(a) past the cap, 3 parallel calls for each of 5 new listings show nothing", async () => {
    const userId = newUser();
    await db.rateLimit.create({ data: { key: dailyKey(userId), count: CONTACT_REVEALS_PER_DAY, resetAt: new Date(Date.now() + 86_400_000) } });
    let shown = 0;
    for (let i = 0; i < 5; i++) {
      const listingId = newListing();
      const results = await Promise.all([revealContact(listingId), revealContact(listingId), revealContact(listingId)]);
      for (const result of results) {
        if (result.ok) shown += 1;
        else expect(result.error).toBe("rate_limited");
      }
    }
    expect(shown).toBe(0);
  });

  it("(b) under the cap, parallel first views are all shown, and a later view of the same listing is free", async () => {
    const userId = newUser();
    const listingId = newListing();
    const results = await Promise.all([revealContact(listingId), revealContact(listingId), revealContact(listingId)]);
    expect(results.every((r) => r.ok)).toBe(true);
    const afterParallel = await dailyCount(userId);
    expect(afterParallel).toBeGreaterThanOrEqual(1);
    expect(afterParallel).toBeLessThanOrEqual(3);
    expect((await revealContact(listingId)).ok).toBe(true);
    expect(await dailyCount(userId)).toBe(afterParallel);
  });
});
