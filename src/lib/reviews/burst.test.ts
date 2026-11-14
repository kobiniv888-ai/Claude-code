import { describe, expect, it } from "vitest";
import { REVIEW_BURST_COUNT, REVIEW_BURST_HOURS, isReviewBurst, reviewBurstNote } from "./burst";

describe("review bursts (SECURITY_REPORT 14.5.b)", () => {
  it("flags REVIEW_BURST_COUNT reviews in the window, not fewer", () => {
    expect(isReviewBurst(REVIEW_BURST_COUNT - 1)).toBe(false);
    expect(isReviewBurst(REVIEW_BURST_COUNT)).toBe(true);
    expect(isReviewBurst(REVIEW_BURST_COUNT + 10)).toBe(true);
  });

  it("writes a staff note with codes only", () => {
    expect(reviewBurstNote(7)).toBe(`auto · review_burst · count=7 · hours=${REVIEW_BURST_HOURS}`);
  });
});
