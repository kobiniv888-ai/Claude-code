import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * notifyFounderListingInReview (./founder-admin.ts): at most one email per listing every 6 hours
 * and 20 an hour in all. A listing held back by the hourly cap keeps its own slot, so its next
 * time in review still emails.
 */

const state = vi.hoisted(() => ({ overallOk: true, counts: new Map<string, number>(), resets: [] as string[], sent: [] as string[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    listing: {
      findUnique: async () => ({
        id: "l1",
        publicId: 1234,
        title: "Flat",
        isDemo: false,
        status: "IN_REVIEW",
        riskScore: 0,
        riskReasons: [],
        owner: { name: "Host", businessName: null, isDemo: false },
      }),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async (key: string, { limit }: { limit: number }) => {
    const count = (state.counts.get(key) ?? 0) + 1;
    state.counts.set(key, count);
    if (key === "founder:review:all") return { ok: state.overallOk };
    return { ok: count <= limit };
  },
  resetRateLimit: async (key: string) => {
    state.resets.push(key);
    state.counts.delete(key);
  },
}));
vi.mock("./founder", () => ({ FOUNDER_OUTBOX_ADDRESS: "outbox@example.com", founderAlertRecipients: async () => [{ to: "founder@example.com", locale: "he" }] }));
vi.mock("@/lib/email", () => ({
  sendEmail: async (input: { template: string }) => {
    state.sent.push(input.template);
    return { ok: true, delivery: "sent" };
  },
}));

const { notifyFounderListingInReview } = await import("./founder-admin");

beforeEach(() => {
  state.overallOk = true;
  state.counts.clear();
  state.resets.length = 0;
  state.sent.length = 0;
});

describe("the founder's review email", () => {
  it("a listing held back by the hourly cap keeps its slot: the next time it emails", async () => {
    state.overallOk = false;
    await notifyFounderListingInReview("l1", ["first_listing"]);
    expect(state.sent).toEqual([]);
    expect(state.resets).toEqual(["founder:review:l1"]);

    state.overallOk = true;
    await notifyFounderListingInReview("l1", ["recheck"]);
    expect(state.sent).toEqual(["admin_review_needed"]);
  });

  it("once emailed, the same listing waits 6 hours", async () => {
    await notifyFounderListingInReview("l1", ["first_listing"]);
    await notifyFounderListingInReview("l1", ["recheck"]);
    expect(state.sent).toEqual(["admin_review_needed"]);
    expect(state.resets).toEqual([]);
  });
});
