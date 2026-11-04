import { describe, expect, it, vi } from "vitest";

/**
 * loadAttentionCounts (./server/attention.ts) when one count fails: the others still load, the
 * failed one reads 0 AND is listed in `failed` (so the home block never says "all clear" and the
 * daily summary waits for the next run).
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    listing: { count: async () => 2 },
    report: {
      count: async ({ where }: { where: { kind?: string } }) => {
        if (where.kind === "TURNED_AWAY") throw new Error("pool timeout");
        return 1;
      },
    },
    auditLog: { count: async () => 0 },
    emailOutbox: { count: async () => 0 },
  },
}));
vi.mock("./server/flags", () => ({
  getOpenFlagCounts: async () => {
    throw new Error("flags query failed");
  },
}));

const { loadAttentionCounts } = await import("./server/attention");
const { attentionState } = await import("./attention");

describe("a failed attention count", () => {
  it("is reported as failed, the rest still load, and the block never says all clear", async () => {
    const counts = await loadAttentionCounts(new Date("2026-11-04T10:00:00Z"));
    expect(counts).toMatchObject({ inReview: 2, otherReports: 1, turnedAwayReports: 0 });
    expect([...counts.failed].sort()).toEqual(["flagCancellations", "flagHosts", "flagNoShows", "turnedAwayReports"]);
    expect(attentionState(counts, "ADMIN")).toBe("partial");
  });
});
