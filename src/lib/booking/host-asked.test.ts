import { describe, expect, it } from "vitest";
import {
  HOST_ASKED_ANSWER_HOURS,
  canAnswerHostAsked,
  displayGuestReason,
  effectiveHostAskedState,
  hostAskedCountsAgainstGuest,
  hostAskedCountsAgainstHost,
  hostAskedDeadline,
  hostAskedState,
} from "./host-asked";
import { countsAsGuestCancellation, summarizeGuestFlag } from "./guest-flags";
import { countsAsHostCancellation, summarizeHostCancellations } from "@/lib/listing/host-flags";

/** Founder's answer (4), 9 Nov 2026: "the host asked me to cancel" (pure rules). */
const now = new Date("2026-11-09T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const guestCancel = (code: string, cancelledAt: Date) => ({
  listingId: "l1",
  status: "CANCELLED_BY_GUEST",
  cancelReasonCode: code,
  cancelledAt,
  checkIn: "2026-12-01",
  checkOut: "2026-12-03",
  noShowReportedAt: null,
});

describe("host-asked states", () => {
  it("reads the stored states and the 72-hour deadline", () => {
    expect(HOST_ASKED_ANSWER_HOURS).toBe(72);
    expect(hostAskedState("HOST_ASKED")).toBe("pending");
    expect(hostAskedState("HOST_ASKED_CONFIRMED")).toBe("confirmed");
    expect(hostAskedState("HOST_ASKED_DENIED")).toBe("denied");
    expect(hostAskedState("HOST_ASKED_EXPIRED")).toBe("expired");
    expect(hostAskedState("CHANGE_OF_PLANS")).toBeNull();
    expect(hostAskedState(null)).toBeNull();
    expect(hostAskedDeadline(hoursAgo(0))?.toISOString()).toBe(new Date(now.getTime() + 72 * 3_600_000).toISOString());
    expect(hostAskedDeadline(null)).toBeNull();
  });

  it("a pending one past 72 hours is expired; without a time it fails closed (expired)", () => {
    expect(effectiveHostAskedState({ cancelReasonCode: "HOST_ASKED", cancelledAt: hoursAgo(71) }, now)).toBe("pending");
    expect(effectiveHostAskedState({ cancelReasonCode: "HOST_ASKED", cancelledAt: hoursAgo(72) }, now)).toBe("expired");
    expect(effectiveHostAskedState({ cancelReasonCode: "HOST_ASKED", cancelledAt: null }, now)).toBe("expired");
    expect(effectiveHostAskedState({ cancelReasonCode: "HOST_ASKED_CONFIRMED", cancelledAt: hoursAgo(500) }, now)).toBe("confirmed");
  });

  it("the host may answer only a pending guest cancellation within the window", () => {
    expect(canAnswerHostAsked({ status: "CANCELLED_BY_GUEST", cancelReasonCode: "HOST_ASKED", cancelledAt: hoursAgo(10) }, now)).toBe(true);
    expect(canAnswerHostAsked({ status: "CANCELLED_BY_GUEST", cancelReasonCode: "HOST_ASKED", cancelledAt: hoursAgo(80) }, now)).toBe(false);
    expect(canAnswerHostAsked({ status: "CANCELLED_BY_GUEST", cancelReasonCode: "HOST_ASKED_DENIED", cancelledAt: hoursAgo(1) }, now)).toBe(false);
    expect(canAnswerHostAsked({ status: "CANCELLED_BY_HOST", cancelReasonCode: "HOST_ASKED", cancelledAt: hoursAgo(1) }, now)).toBe(false);
    expect(canAnswerHostAsked({ status: "CANCELLED_BY_GUEST", cancelReasonCode: "OTHER", cancelledAt: hoursAgo(1) }, now)).toBe(false);
  });

  it("who it counts against", () => {
    expect([null, "pending", "confirmed", "denied", "expired"].map((s) => hostAskedCountsAgainstGuest(s as never))).toEqual([true, false, false, true, true]);
    expect([null, "pending", "confirmed", "denied", "expired"].map((s) => hostAskedCountsAgainstHost(s as never))).toEqual([false, false, true, false, false]);
    expect(displayGuestReason("HOST_ASKED_EXPIRED")).toBe("HOST_ASKED");
    expect(displayGuestReason("OTHER")).toBe("OTHER");
  });
});

describe("guest flag: confirmed and pending never count, denied and expired do", () => {
  it("three confirmed → no flag; three denied/expired → flag (review only)", () => {
    const confirmed = [1, 2, 3].map((h) => guestCancel("HOST_ASKED_CONFIRMED", hoursAgo(h * 24)));
    expect(summarizeGuestFlag(confirmed, null, now)).toMatchObject({ cancellations: 0, open: false });
    const pending = [1, 2, 3].map((h) => guestCancel("HOST_ASKED", hoursAgo(h)));
    expect(summarizeGuestFlag(pending, null, now)).toMatchObject({ cancellations: 0, open: false });
    const disputed = [guestCancel("HOST_ASKED_DENIED", hoursAgo(5)), guestCancel("HOST_ASKED_EXPIRED", hoursAgo(100)), guestCancel("HOST_ASKED", hoursAgo(80))];
    expect(summarizeGuestFlag(disputed, null, now)).toMatchObject({ cancellations: 3, open: true });
    // Decision 7 still holds: a cancelled flight never counts.
    expect(countsAsGuestCancellation(guestCancel("FLIGHT_CANCELLED", hoursAgo(1)), now)).toBe(false);
  });
});

describe("host flag: the host's own cancellations count against the host", () => {
  it("host cancellations and confirmed host-asked ones, 3 in 90 days", () => {
    const own = [
      { status: "CANCELLED_BY_HOST", cancelReasonCode: "DOUBLE_BOOKING", cancelledAt: hoursAgo(24) },
      { status: "CANCELLED_BY_GUEST", cancelReasonCode: "HOST_ASKED_CONFIRMED", cancelledAt: hoursAgo(48) },
      { status: "CANCELLED_BY_GUEST", cancelReasonCode: "HOST_ASKED_CONFIRMED", cancelledAt: hoursAgo(72) },
    ];
    expect(summarizeHostCancellations(own, now)).toEqual({ count: 3, repeat: true });
    // Denied, pending, expired and other guest reasons never count against the host; nor old ones.
    expect(countsAsHostCancellation({ status: "CANCELLED_BY_GUEST", cancelReasonCode: "HOST_ASKED_DENIED", cancelledAt: hoursAgo(1) }, now)).toBe(false);
    expect(countsAsHostCancellation({ status: "CANCELLED_BY_GUEST", cancelReasonCode: "HOST_ASKED", cancelledAt: hoursAgo(1) }, now)).toBe(false);
    expect(countsAsHostCancellation({ status: "CANCELLED_BY_GUEST", cancelReasonCode: "HOST_ASKED_EXPIRED", cancelledAt: hoursAgo(1) }, now)).toBe(false);
    expect(countsAsHostCancellation({ status: "CANCELLED_BY_GUEST", cancelReasonCode: "CHANGE_OF_PLANS", cancelledAt: hoursAgo(1) }, now)).toBe(false);
    expect(summarizeHostCancellations([{ status: "CANCELLED_BY_HOST", cancelReasonCode: "OTHER", cancelledAt: hoursAgo(91 * 24) }, ...own.slice(0, 2)], now)).toEqual({ count: 2, repeat: false });
  });
});
