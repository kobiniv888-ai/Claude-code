/**
 * The guest flag rules (founder's decisions 7 and 8, Q14; SECURITY_REPORT 4.6.a–c): the numbers,
 * the windows, the "never counted" cancellations and when a reviewed flag opens again.
 */
import { describe, expect, it } from "vitest";
import {
  countsAsGuestCancellation,
  FLIGHT_CANCELLED_REASON,
  guestFlagOpen,
  guestFlagReasons,
  isLongStay,
  isTravelDisruptionCancellation,
  LONG_STAY_FLAG_NIGHTS,
  longStayOpen,
  MAX_UPCOMING_BOOKINGS_PER_PHONE,
  REPEAT_CANCEL_FLAG_MIN,
  REPEAT_CANCEL_WINDOW_DAYS,
  REPEAT_NO_SHOW_FLAG_MIN,
  REPEAT_NO_SHOW_WINDOW_DAYS,
  summarizeGuestFlag,
  type GuestFlagBooking,
} from "./guest-flags";

const NOW = new Date("2026-11-08T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 3600 * 1000);

function cancelled(at: Date, reason: string | null = "CHANGE_OF_PLANS"): GuestFlagBooking {
  return { listingId: "l1", checkIn: "2026-12-01", checkOut: "2026-12-03", status: "CANCELLED_BY_GUEST", cancelledAt: at, cancelReasonCode: reason, noShowReportedAt: null };
}

function noShow(at: Date): GuestFlagBooking {
  return { listingId: "l1", checkIn: "2026-10-01", checkOut: "2026-10-03", status: "NO_SHOW", cancelledAt: null, cancelReasonCode: null, noShowReportedAt: at };
}

describe("the numbers the founder approved", () => {
  it("2 upcoming bookings per phone, 14 nights, 3 cancellations in 90 days, 2 no-shows in 365 days", () => {
    expect(MAX_UPCOMING_BOOKINGS_PER_PHONE).toBe(2);
    expect(LONG_STAY_FLAG_NIGHTS).toBe(14);
    expect([REPEAT_CANCEL_FLAG_MIN, REPEAT_CANCEL_WINDOW_DAYS]).toEqual([3, 90]);
    expect([REPEAT_NO_SHOW_FLAG_MIN, REPEAT_NO_SHOW_WINDOW_DAYS]).toEqual([2, 365]);
  });

  it("a long stay is 14 nights or more", () => {
    expect(isLongStay(13)).toBe(false);
    expect(isLongStay(14)).toBe(true);
    expect(isLongStay(Number.NaN)).toBe(false);
    expect(longStayOpen({ nights: 20, status: "CONFIRMED" }, null)).toBe(true);
    expect(longStayOpen({ nights: 20, status: "CONFIRMED" }, NOW)).toBe(false);
    expect(longStayOpen({ nights: 20, status: "CANCELLED_BY_GUEST" }, null)).toBe(false);
    expect(longStayOpen({ nights: 5, status: "CONFIRMED" }, null)).toBe(false);
  });
});

describe("cancellations that never count (decision 7)", () => {
  it("'my flight was cancelled' never counts", () => {
    expect(countsAsGuestCancellation(cancelled(daysAgo(1), FLIGHT_CANCELLED_REASON))).toBe(false);
    expect(countsAsGuestCancellation(cancelled(daysAgo(1)))).toBe(true);
    expect(countsAsGuestCancellation(cancelled(daysAgo(1), null))).toBe(true);
  });

  it("the travel-disruption hook says 'no window' until the next brief adds the windows", () => {
    expect(isTravelDisruptionCancellation({ listingId: "l1", checkIn: "2026-12-01", checkOut: "2026-12-03", cancelledAt: NOW })).toBe(false);
  });

  it("only guest cancellations count (a host cancellation is about the host)", () => {
    expect(countsAsGuestCancellation({ ...cancelled(daysAgo(1)), status: "CANCELLED_BY_HOST" })).toBe(false);
    expect(countsAsGuestCancellation({ ...cancelled(daysAgo(1)), cancelledAt: null })).toBe(false);
  });
});

describe("repeat flags: listed for review, reopened by a new event", () => {
  it("3 cancellations in 90 days flag the guest; the flight-cancelled one is left out", () => {
    const two = [cancelled(daysAgo(10)), cancelled(daysAgo(20)), cancelled(daysAgo(30), FLIGHT_CANCELLED_REASON)];
    expect(summarizeGuestFlag(two, null, NOW)).toMatchObject({ cancellations: 2, reasons: [], open: false });
    const three = [...two, cancelled(daysAgo(89))];
    expect(summarizeGuestFlag(three, null, NOW)).toMatchObject({ cancellations: 3, reasons: ["cancellations"], open: true, latestAt: daysAgo(10) });
  });

  it("cancellations older than 90 days and no-shows older than a year are left out", () => {
    expect(summarizeGuestFlag([cancelled(daysAgo(10)), cancelled(daysAgo(20)), cancelled(daysAgo(91))], null, NOW).cancellations).toBe(2);
    expect(summarizeGuestFlag([noShow(daysAgo(30)), noShow(daysAgo(366))], null, NOW)).toMatchObject({ noShows: 1, open: false });
    expect(summarizeGuestFlag([noShow(daysAgo(30)), noShow(daysAgo(364))], null, NOW)).toMatchObject({ noShows: 2, reasons: ["no_shows"], open: true });
  });

  it("a review closes the flag until a NEW counting event; an event of a rule not met does not reopen it", () => {
    const rows = [noShow(daysAgo(30)), noShow(daysAgo(60))];
    const reviewedAt = daysAgo(5);
    expect(summarizeGuestFlag(rows, reviewedAt, NOW).open).toBe(false);
    expect(summarizeGuestFlag([...rows, noShow(daysAgo(1))], reviewedAt, NOW).open).toBe(true);
    // One cancellation (rule not met) after the review: still closed.
    expect(summarizeGuestFlag([...rows, cancelled(daysAgo(1))], reviewedAt, NOW).open).toBe(false);
    // A flight-cancelled cancellation never reopens it either.
    const cancels = [cancelled(daysAgo(30)), cancelled(daysAgo(40)), cancelled(daysAgo(50))];
    expect(summarizeGuestFlag([...cancels, cancelled(daysAgo(1), FLIGHT_CANCELLED_REASON)], reviewedAt, NOW).open).toBe(false);
  });

  it("guestFlagReasons and guestFlagOpen agree with the thresholds", () => {
    expect(guestFlagReasons({ cancellations: 3, noShows: 2 })).toEqual(["cancellations", "no_shows"]);
    expect(guestFlagReasons({ cancellations: 2, noShows: 1 })).toEqual([]);
    expect(guestFlagOpen({ cancellations: 3, noShows: 0, latestAt: null, reviewedAt: null })).toBe(false);
    expect(guestFlagOpen({ cancellations: 3, noShows: 0, latestAt: NOW, reviewedAt: daysAgo(1) })).toBe(true);
  });

  it("future-dated events (clock skew) are not counted", () => {
    const future = new Date(NOW.getTime() + 3600_000);
    expect(summarizeGuestFlag([cancelled(future), cancelled(daysAgo(1)), cancelled(daysAgo(2))], null, NOW).cancellations).toBe(2);
  });
});
