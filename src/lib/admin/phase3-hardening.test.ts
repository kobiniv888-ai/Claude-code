import { describe, expect, it } from "vitest";
import { attentionRows, attentionState, type AttentionCounts } from "./attention";
import { parseBookingSearch } from "./booking-search";
import { OUTBOX_WAITING_WHERE, outboxListWhere } from "./outbox";
import { parseAmount, referencePriceSchema, sourceMonthProblem } from "./reference-prices";
import { reportDecisions } from "./report-decisions";
import { parseUserSearch } from "./search";
import { hostCancelHours } from "@/lib/listing/host-flags";
import { decideSubmitTarget, riskScoreNeedsReview, type ReviewGate } from "@/lib/listing/review-rule";

/**
 * Phase 3 hardening, the pure rules: which report decisions are offered, the admin home's counts
 * and links, pasted phone numbers and booking codes, reference price amounts, hours to cancel and
 * the founder's review reasons.
 */

describe("report decisions offered", () => {
  const base = { kind: "TURNED_AWAY" as const, open: true, own: false, hostActionable: true, revealed: false };

  it("a turned-away report about a host who can be acted on: host actions and dismiss", () => {
    expect(reportDecisions(base)).toEqual({ hostActions: true, resolve: false, dismiss: true });
  });

  it("a removed, deleted or unmanageable host: resolve, so a valid report isn't closed as 'no real problem'", () => {
    expect(reportDecisions({ ...base, hostActionable: false })).toEqual({ hostActions: false, resolve: true, dismiss: true });
  });

  it("after the reporter was named to the host: resolve, never dismiss", () => {
    expect(reportDecisions({ ...base, revealed: true })).toEqual({ hostActions: true, resolve: true, dismiss: false });
  });

  it("nothing on a decided report or on the staff member's own report", () => {
    expect(reportDecisions({ ...base, open: false })).toEqual({ hostActions: false, resolve: false, dismiss: false });
    expect(reportDecisions({ ...base, own: true })).toEqual({ hostActions: false, resolve: false, dismiss: false });
  });

  it("listing reports keep resolve", () => {
    expect(reportDecisions({ ...base, kind: "GENERAL" }).resolve).toBe(true);
  });
});

describe("admin home counts", () => {
  const counts: AttentionCounts = {
    turnedAwayReports: 0,
    inReview: 0,
    otherReports: 2,
    flagCancellations: 0,
    flagHosts: 0,
    flagNoShows: 0,
    flagGuests: 0,
    flagLongStays: 0,
    hostUnreachable: 0,
    failedEmails: 1,
    outboxWaiting: 3,
  };
  const zero: AttentionCounts = { ...counts, otherReports: 0, failedEmails: 0, outboxWaiting: 0 };

  it("never says 'all clear' when a count failed or nothing loaded", () => {
    expect(attentionState(null, "ADMIN")).toBe("unavailable");
    expect(attentionState({ ...zero, failed: ["turnedAwayReports"] }, "ADMIN")).toBe("partial");
    expect(attentionState({ ...zero, failed: [] }, "ADMIN")).toBe("clear");
    expect(attentionState({ ...counts, failed: [] }, "ADMIN")).toBe("rows");
    // A failure the role can't see (the outbox, for a moderator) doesn't hide its all-clear.
    expect(attentionState({ ...zero, failed: ["outboxWaiting"] }, "MODERATOR")).toBe("clear");
    expect(attentionState({ ...zero, failed: ["outboxWaiting"] }, "ADMIN")).toBe("partial");
  });

  it("each row links to the list counted with the same filter", () => {
    const rows = Object.fromEntries(attentionRows(counts, "ADMIN").map((r) => [r.key, r.href]));
    expect(rows.otherReports).toBe("/admin/reports?tab=listings");
    expect(rows.failedEmails).toBe("/admin/outbox?status=FAILED&recent=7");
    expect(rows.outboxWaiting).toBe("/admin/outbox?waiting=1&recent=7");
  });

  it("the outbox 'waiting' filter leaves out demo-only emails and login codes, like the count", () => {
    const now = new Date("2026-11-04T10:00:00Z");
    const where = outboxListWhere({ waiting: true, recentDays: 7 }, now);
    expect(where).toMatchObject(OUTBOX_WAITING_WHERE);
    // Weekly digests are never sent again, so they never wait (outbox-1).
    expect(where.template).toEqual({ notIn: ["login_code", "weekly_host_stats"] });
    expect(where.createdAt).toEqual({ gte: new Date("2026-10-28T10:00:00Z") });
    expect(outboxListWhere({ status: "FAILED" })).toEqual({ status: "FAILED" });
  });
});

describe("pasted phone numbers and booking codes (admin search)", () => {
  const E164 = "+995555123456";

  it("bidi marks, Arabic-Indic digits and tel: / wa.me links still find the number", () => {
    for (const pasted of ["‪+995 555 12 34 56‬", "‎+995555123456", "٠٥٥٥١٢٣٤٥٦", "tel:+995555123456", "https://wa.me/995555123456"]) {
      expect(parseUserSearch(pasted).phones, JSON.stringify(pasted)).toContain(E164);
    }
  });

  it("a booking code with an invisible direction mark is still a code", () => {
    expect(parseBookingSearch("‎BT-7K3Q9").code).toBe("BT-7K3Q9");
  });

  it("a partial local number drops its national 0 (stored numbers are E.164)", () => {
    expect(parseUserSearch("053-123").phoneDigits).toBe("53123");
    expect(parseUserSearch("0555 12 34").phoneDigits).toBe("5551234");
    expect(parseUserSearch("+995 555 12").phoneDigits).toBe("99555512");
  });
});

describe("reference price amounts", () => {
  const values = {
    cityId: "city_1",
    dealType: "SHORT_STAY",
    unit: "NIGHT",
    currency: "GEL",
    sourceName: "Report",
    sourceMonth: "2026-10",
  };
  const parse = (low: string, high: string) => referencePriceSchema.safeParse({ ...values, low, high });

  it("a single comma or dot before one or two digits is the decimal point", () => {
    expect(parseAmount("45,5")).toBe(45.5);
    expect(parseAmount("60,50")).toBe(60.5);
    expect(parseAmount("45.5")).toBe(45.5);
    const parsed = parse("45,5", "60,5");
    expect(parsed.success && [parsed.data.low, parsed.data.high]).toEqual([45.5, 60.5]);
  });

  it("thousands with commas or spaces; '1.500' is ambiguous and refused", () => {
    expect(parseAmount("1,500")).toBe(1500);
    expect(parseAmount("1 500 000")).toBe(1_500_000);
    expect(parseAmount("1,500.50")).toBe(1500.5);
    expect(Number.isNaN(parseAmount("1.500"))).toBe(true);
    const ambiguous = parse("1.500", "2.000");
    expect(ambiguous.success).toBe(false);
    expect(ambiguous.error?.issues[0]?.message).toBe("invalid_number");
  });

  it("at most two decimals and at least 0.01 (the column keeps cents)", () => {
    const tiny = parse("0.004", "1");
    expect(tiny.success).toBe(false);
    expect(tiny.error?.issues[0]?.message).toBe("out_of_range");
  });

  it("the month is the city's month (Tbilisi is a day ahead of UTC at 01:00 on the 1st)", () => {
    const tbilisiFirstOfMonth = new Date("2026-10-31T21:00:00Z");
    expect(sourceMonthProblem("2026-11", tbilisiFirstOfMonth, "GE")).toBeNull();
    expect(sourceMonthProblem("2026-12", tbilisiFirstOfMonth, "GE")).toBe("date_in_future");
  });
});

describe("hours from booking to the host's cancellation", () => {
  it("rounds down on every page (47.6 hours is 47)", () => {
    const createdAt = new Date("2026-11-01T00:00:00Z");
    const cancelledAt = new Date(createdAt.getTime() + 47.6 * 3_600_000);
    expect(hostCancelHours({ status: "CANCELLED_BY_HOST", createdAt, cancelledAt })).toBe(47);
    expect(hostCancelHours({ status: "CANCELLED_BY_GUEST", createdAt, cancelledAt })).toBeNull();
  });
});

describe("the founder's review email reasons", () => {
  const gate: ReviewGate = { firstListing: true, flaggedHost: false, failedClosed: false };

  it("a clean first listing waits as a first listing only, not as 'the checks found a risk'", () => {
    expect(decideSubmitTarget({ from: "DRAFT", blocked: false, riskRequiresReview: riskScoreNeedsReview(0, 30), gate })).toEqual({
      target: "IN_REVIEW",
      why: ["first_listing"],
    });
  });

  it("a risky first listing says both", () => {
    expect(decideSubmitTarget({ from: "DRAFT", blocked: false, riskRequiresReview: riskScoreNeedsReview(45, 30), gate }).why).toEqual(["first_listing", "risk"]);
  });
});
