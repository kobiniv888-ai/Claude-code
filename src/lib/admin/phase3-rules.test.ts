import { describe, expect, it, vi } from "vitest";
import { attentionRows, attentionTotal, ATTENTION_KEYS, type AttentionCounts } from "./attention";
import { auditActionKey, auditTargetHref } from "./audit-labels";
import { parseBookingSearch, parseDay, stayOverlap } from "./booking-search";
import {
  bookingFlagKind,
  bookingFlagOpen,
  hostReportFlagFromReports,
  hostReportFlagOpen,
  hostReportWindowStart,
  hoursFromBookingToCancel,
  isFlaggedHost,
  reportCountsForHostFlag,
  HOST_REPORT_FLAG_MIN,
  HOST_REPORT_WINDOW_DAYS,
  type FlagReport,
} from "./flags";
import { resendBlock } from "./outbox";
import { precheckItems, precheckSummary, PRECHECK_IDS } from "./precheck";
import {
  dateToMonth,
  isStaleReference,
  matchReferencePrices,
  monthToDate,
  referenceFieldErrors,
  referencePriceSchema,
  sourceMonthProblem,
  UNIT_BY_DEAL,
  type ReferenceRow,
} from "./reference-prices";
import { BACK_TO_REVIEW_STATUSES, decideSubmitTarget, runReviewGate, type ReviewGate } from "@/lib/listing/review-rule";

/** Round 3, phase 3 (brief 9): the admin panel's rules, one by one. */

const NOW = new Date("2026-11-04T10:00:00.000Z");
const DAY = 24 * 3600 * 1000;
const noGate: ReviewGate = { firstListing: false, flaggedHost: false, failedClosed: false };

describe("review rule: when a listing waits for a person", () => {
  it("always holds a host's first listing", () => {
    expect(decideSubmitTarget({ from: "DRAFT", blocked: false, riskRequiresReview: false, gate: { ...noGate, firstListing: true } })).toEqual({
      target: "IN_REVIEW",
      why: ["first_listing"],
    });
  });

  it("publishes a later, low-risk listing of a host without a flag", () => {
    expect(decideSubmitTarget({ from: "DRAFT", blocked: false, riskRequiresReview: false, gate: noGate })).toEqual({ target: "LIVE", why: [] });
  });

  it("holds a later listing when the automatic checks want a person (risk score at the threshold)", () => {
    expect(decideSubmitTarget({ from: "DRAFT", blocked: false, riskRequiresReview: true, gate: noGate }).target).toBe("IN_REVIEW");
  });

  it("holds a flagged host's NEW listings, but not an edit of a live one", () => {
    const flagged = { ...noGate, flaggedHost: true };
    expect(decideSubmitTarget({ from: "DRAFT", blocked: false, riskRequiresReview: false, gate: flagged })).toEqual({ target: "IN_REVIEW", why: ["flagged_host"] });
    expect(decideSubmitTarget({ from: "LIVE", blocked: false, riskRequiresReview: false, gate: flagged }).target).toBe("LIVE");
  });

  it("brings a listing back to review after 'ask for changes' or a rejection, even at low risk", () => {
    expect(BACK_TO_REVIEW_STATUSES).toEqual(["IN_REVIEW", "NEEDS_CHANGES", "REJECTED"]);
    for (const from of BACK_TO_REVIEW_STATUSES) {
      const decision = decideSubmitTarget({ from, blocked: false, riskRequiresReview: false, gate: noGate });
      expect(decision, from).toEqual({ target: "IN_REVIEW", why: ["back_to_review"] });
    }
  });

  it("never publishes a blocked listing: a draft stays a draft, a live one goes to review", () => {
    expect(decideSubmitTarget({ from: "DRAFT", blocked: true, riskRequiresReview: true, gate: { ...noGate, firstListing: true } })).toEqual({ target: "DRAFT", why: [] });
    expect(decideSubmitTarget({ from: "LIVE", blocked: true, riskRequiresReview: false, gate: noGate })).toEqual({ target: "IN_REVIEW", why: ["blocked"] });
  });

  it("lists every reason that applies", () => {
    const why = decideSubmitTarget({ from: "DRAFT", blocked: false, riskRequiresReview: true, gate: { firstListing: true, flaggedHost: true, failedClosed: false } }).why;
    expect(why).toEqual(["first_listing", "flagged_host", "risk"]);
  });

  it("fails CLOSED: a check that throws counts as 'yes' and is logged", async () => {
    const log = vi.fn();
    const gate = await runReviewGate(
      {
        isFirst: () => Promise.reject(new Error("db down")),
        isFlagged: () => Promise.resolve(false),
      },
      log,
    );
    expect(gate).toEqual({ firstListing: true, flaggedHost: false, failedClosed: true });
    expect(log).toHaveBeenCalledWith("first_listing", expect.any(Error));
    const flagged = await runReviewGate({ isFirst: () => Promise.resolve(false), isFlagged: () => Promise.reject(new Error("timeout")) }, () => undefined);
    expect(flagged).toEqual({ firstListing: false, flaggedHost: true, failedClosed: true });
    expect(decideSubmitTarget({ from: "DRAFT", blocked: false, riskRequiresReview: false, gate: flagged }).target).toBe("IN_REVIEW");
  });

  it("passes the answers through when the checks work", async () => {
    const gate = await runReviewGate({ isFirst: async () => false, isFlagged: async () => false }, () => undefined);
    expect(gate).toEqual(noGate);
  });
});

describe("'בדיקה לפני פרסום' slot (the automatic checks until phase 4)", () => {
  it("shows every check as not run yet before the checks ran", () => {
    const items = precheckItems([], false);
    expect(items.map((i) => i.id)).toEqual([...PRECHECK_IDS]);
    expect(items.every((i) => i.status === "unchecked")).toBe(true);
  });

  it("marks passed, found, blocking and informational checks", () => {
    const items = precheckItems(
      [
        { code: "first_listing", points: 0 },
        { code: "scam_phrase", points: 20, detail: "western union" },
        { code: "blocked_phrase", points: 100 },
        { code: "price_far_below_area", points: 15 },
      ],
      true,
    );
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId.first_listing.status).toBe("info");
    expect(byId.phrases.status).toBe("blocked");
    expect(byId.phrases.points).toBe(120);
    expect(byId.price.status).toBe("found");
    expect(byId.voip.status).toBe("ok");
    expect(precheckSummary(items)).toEqual({ found: 1, blocked: 1, ok: PRECHECK_IDS.length - 3 });
  });
});

describe("admin home 'דורש טיפול'", () => {
  const counts: AttentionCounts = {
    turnedAwayReports: 1,
    inReview: 3,
    otherReports: 2,
    flagCancellations: 1,
    flagHosts: 0,
    flagNoShows: 4,
    flagGuests: 2,
    flagLongStays: 3,
    hostUnreachable: 1,
    failedEmails: 2,
    outboxWaiting: 9,
  };

  it("puts turned-away reports first, marked urgent, and leaves out empty rows", () => {
    const rows = attentionRows(counts, "ADMIN");
    expect(rows[0]).toEqual({ key: "turnedAwayReports", count: 1, href: "/admin/reports?tab=turnedAway", tone: "urgent" });
    expect(rows.map((r) => r.key)).not.toContain("flagHosts");
    expect(rows.at(-1)?.tone).toBe("info");
  });

  it("shows each role only what it may open", () => {
    expect(attentionRows(counts, "SUPPORT").map((r) => r.key)).toEqual(["turnedAwayReports", "otherReports"]);
    expect(attentionRows(counts, "MODERATOR").map((r) => r.key)).not.toContain("outboxWaiting");
    expect(attentionRows(counts, "EDITOR")).toEqual([]);
    expect(attentionRows(counts, "USER")).toEqual([]);
    expect(attentionRows(null, "ADMIN")).toEqual([]);
  });

  it("counts what needs a person (not the info rows)", () => {
    const rows = attentionRows(counts, "ADMIN");
    // Guest flags need a person; long stays are for information (like no-shows and the outbox).
    expect(attentionTotal(rows)).toBe(1 + 3 + 2 + 1 + 2 + 1 + 2);
    expect(rows.find((r) => r.key === "flagGuests")).toEqual({ key: "flagGuests", count: 2, href: "/admin/flags?view=guests", tone: "attention" });
    expect(rows.find((r) => r.key === "flagLongStays")).toEqual({ key: "flagLongStays", count: 3, href: "/admin/flags?view=longStays", tone: "info" });
    expect(ATTENTION_KEYS).toHaveLength(Object.keys(counts).length);
  });
});

describe("flags", () => {
  const report = (days: number, extra: Partial<FlagReport> = {}): FlagReport => ({
    status: "OPEN",
    targetType: "USER",
    createdAt: new Date(NOW.getTime() - days * DAY),
    ...extra,
  });

  it("counts reports from the last 12 months, without dismissed ones or reports about reviews", () => {
    expect(HOST_REPORT_FLAG_MIN).toBe(2);
    expect(HOST_REPORT_WINDOW_DAYS).toBe(365);
    expect(hostReportWindowStart(NOW).getTime()).toBe(NOW.getTime() - 365 * DAY);
    expect(reportCountsForHostFlag(report(10), NOW)).toBe(true);
    expect(reportCountsForHostFlag(report(10, { status: "RESOLVED" }), NOW)).toBe(true);
    expect(reportCountsForHostFlag(report(10, { status: "DISMISSED" }), NOW)).toBe(false);
    expect(reportCountsForHostFlag(report(10, { targetType: "REVIEW" }), NOW)).toBe(false);
    expect(reportCountsForHostFlag(report(366), NOW)).toBe(false);
  });

  it("flags a host with 2 or more counting reports", () => {
    expect(hostReportFlagFromReports([report(5)], null, NOW)).toBe(false);
    expect(hostReportFlagFromReports([report(5), report(40)], null, NOW)).toBe(true);
    expect(hostReportFlagFromReports([report(5), report(40, { status: "DISMISSED" })], null, NOW)).toBe(false);
    expect(hostReportFlagFromReports([report(5), report(400)], null, NOW)).toBe(false);
  });

  it("closes the flag when marked reviewed, and a NEW report opens it again", () => {
    const reviewedAt = new Date(NOW.getTime() - 2 * DAY);
    expect(hostReportFlagFromReports([report(5), report(40)], reviewedAt, NOW)).toBe(false);
    expect(hostReportFlagFromReports([report(5), report(40), report(1)], reviewedAt, NOW)).toBe(true);
    expect(hostReportFlagOpen({ reportCount: 3, latestReportAt: null, reviewedAt: null })).toBe(false);
  });

  it("knows a booking's flag: host cancellation within 48 hours, or a no-show (listed only)", () => {
    expect(bookingFlagKind({ status: "CANCELLED_BY_HOST", flaggedForReview: true })).toBe("host_cancellation");
    // "The host asked me to cancel" is flagged on a guest cancellation.
    expect(bookingFlagKind({ status: "CANCELLED_BY_GUEST", flaggedForReview: true })).toBe("host_cancellation");
    expect(bookingFlagKind({ status: "NO_SHOW", flaggedForReview: false })).toBe("no_show");
    expect(bookingFlagKind({ status: "CANCELLED_BY_HOST", flaggedForReview: false })).toBeNull();
    expect(bookingFlagOpen({ status: "NO_SHOW", flaggedForReview: false, flagReviewedAt: null })).toBe(true);
    expect(bookingFlagOpen({ status: "NO_SHOW", flaggedForReview: false, flagReviewedAt: NOW })).toBe(false);
    expect(bookingFlagOpen({ status: "CONFIRMED", flaggedForReview: false, flagReviewedAt: null })).toBe(false);
  });

  it("calls a host flagged for an open report flag or an open 48-hour cancellation, never for no-shows", () => {
    expect(isFlaggedHost({ reportFlagOpen: true, openCancellationFlags: 0 })).toBe(true);
    expect(isFlaggedHost({ reportFlagOpen: false, openCancellationFlags: 1 })).toBe(true);
    expect(isFlaggedHost({ reportFlagOpen: false, openCancellationFlags: 0 })).toBe(false);
  });

  it("measures the hours from booking to cancellation", () => {
    const booked = new Date("2026-11-01T10:00:00Z");
    expect(hoursFromBookingToCancel(booked, new Date("2026-11-01T10:59:00Z"))).toBe(0);
    expect(hoursFromBookingToCancel(booked, new Date("2026-11-03T09:00:00Z"))).toBe(47);
    expect(hoursFromBookingToCancel(booked, null)).toBeNull();
    expect(hoursFromBookingToCancel(booked, new Date("2026-11-01T09:00:00Z"))).toBe(0);
  });
});

describe("bookings search", () => {
  it("reads a booking code however it is typed", () => {
    expect(parseBookingSearch("bt-7k3q9").code).toBe("BT-7K3Q9");
    expect(parseBookingSearch("7K3Q9").code).toBe("BT-7K3Q9");
    expect(parseBookingSearch(" BT 7K3Q9 ").code).toBe("BT-7K3Q9");
    // 0, O, 1 and I never appear in a code.
    expect(parseBookingSearch("BT-10OI0").code).toBeNull();
  });

  it("also reads a listing number, a name, an email or a phone", () => {
    expect(parseBookingSearch("#1234").people.listingPublicId).toBe(1234);
    expect(parseBookingSearch("noa@example.com").people.email).toBe("noa@example.com");
    expect(parseBookingSearch("+995 555 12 34 56").people.phoneDigits).toBe("995555123456");
    expect(parseBookingSearch("Sarah").people.text).toBe("Sarah");
    expect(parseBookingSearch("").code).toBeNull();
  });

  it("parses stay dates and refuses impossible ones", () => {
    expect(parseDay("2026-11-01")?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("01/11/2026")).toBeNull();
    expect(parseDay(null)).toBeNull();
  });

  it("finds stays whose nights touch the chosen days", () => {
    const from = parseDay("2026-11-10");
    const to = parseDay("2026-11-12");
    expect(stayOverlap(from, to)).toEqual({ checkInBefore: new Date("2026-11-13T00:00:00.000Z"), checkOutAfter: from });
    expect(stayOverlap(null, null)).toEqual({ checkInBefore: null, checkOutAfter: null });
    expect(stayOverlap(to, from)).toBeNull();
  });
});

describe("reference prices", () => {
  const valid = {
    cityId: "city1",
    neighborhoodId: "",
    dealType: "MONTHLY_RENT",
    propertyType: "",
    bedrooms: "2",
    unit: "MONTH",
    perSqm: false,
    low: "1 200",
    high: "1,800",
    currency: "USD",
    sourceName: "Example Realty Report",
    sourceUrl: "https://example.com/report",
    sourceMonth: "2026-09",
    note: "",
  };

  it("accepts a full range and cleans empty optional fields", () => {
    const parsed = referencePriceSchema.parse(valid);
    expect(parsed).toMatchObject({ neighborhoodId: null, propertyType: null, bedrooms: 2, low: 1200, high: 1800, note: null });
  });

  it("refuses a high price below the low one, a unit that does not fit the type and per-m² outside sales", () => {
    const errors = (input: Record<string, unknown>) => {
      const result = referencePriceSchema.safeParse({ ...valid, ...input });
      return result.success ? {} : referenceFieldErrors(result.error);
    };
    expect(errors({ high: "900" })).toEqual({ high: ["high_below_low"] });
    expect(errors({ unit: "NIGHT" })).toEqual({ unit: ["unit_mismatch"] });
    expect(errors({ perSqm: true })).toEqual({ perSqm: ["per_sqm_sale_only"] });
    expect(errors({ sourceUrl: "javascript:alert(1)" })).toEqual({ sourceUrl: ["invalid_url"] });
    expect(errors({ sourceName: "" })).toEqual({ sourceName: ["required"] });
    expect(errors({ low: "0" })).toEqual({ low: ["out_of_range"] });
    expect(errors({ sourceMonth: "2026-13" })).toEqual({ sourceMonth: ["invalid_date"] });
  });

  it("uses one unit per deal type", () => {
    expect(UNIT_BY_DEAL).toEqual({ SHORT_STAY: "NIGHT", HOTEL_ROOM: "NIGHT", MONTHLY_RENT: "MONTH", SALE: "TOTAL" });
    expect(referencePriceSchema.safeParse({ ...valid, dealType: "SALE", unit: "TOTAL", perSqm: true }).success).toBe(true);
  });

  it("keeps report months in the past and marks old reports", () => {
    expect(sourceMonthProblem("2026-11", NOW)).toBeNull();
    expect(sourceMonthProblem("2026-12", NOW)).toBe("date_in_future");
    expect(sourceMonthProblem("1999-01", NOW)).toBe("invalid_date");
    expect(dateToMonth(monthToDate("2026-09"))).toBe("2026-09");
    expect(isStaleReference(monthToDate("2024-11"), NOW)).toBe(false);
    expect(isStaleReference(monthToDate("2024-10"), NOW)).toBe(true);
  });

  it("matches the most specific active row first, then the newest", () => {
    const row = (id: string, extra: Partial<ReferenceRow>): ReferenceRow & { id: string } => ({
      id,
      cityId: "c1",
      neighborhoodId: null,
      dealType: "MONTHLY_RENT",
      propertyType: null,
      bedrooms: null,
      active: true,
      sourceMonth: monthToDate("2026-01"),
      ...extra,
    });
    const rows = [
      row("city", {}),
      row("cityNewer", { sourceMonth: monthToDate("2026-06") }),
      row("hood", { neighborhoodId: "n1" }),
      row("hood2bed", { neighborhoodId: "n1", bedrooms: 2 }),
      row("otherHood", { neighborhoodId: "n2" }),
      row("off", { neighborhoodId: "n1", bedrooms: 2, propertyType: "APARTMENT", active: false }),
      row("sale", { dealType: "SALE" }),
      row("3bed", { bedrooms: 3 }),
    ];
    const ids = matchReferencePrices(rows, { cityId: "c1", neighborhoodId: "n1", dealType: "MONTHLY_RENT", propertyType: "APARTMENT", bedrooms: 2 }).map((r) => r.id);
    expect(ids).toEqual(["hood2bed", "hood", "cityNewer", "city"]);
  });
});

describe("outbox 'send again'", () => {
  // A deliverable-looking address (pure test: nothing is sent); reserved domains are refused below.
  const row = { status: "LOGGED", provider: "console", template: "listing_approved", to: "host@mail.example-host.co" };

  it("is offered only once Resend is set up, for kept emails that can really go out", () => {
    expect(resendBlock(row, true)).toBeNull();
    expect(resendBlock(row, false)).toBe("not_configured");
    expect(resendBlock({ ...row, status: "SENT" }, true)).toBe("not_logged");
    expect(resendBlock({ ...row, status: "FAILED" }, true)).toBe("not_logged");
    // Demo accounts' emails ("outbox" provider) and login codes are never sent again.
    expect(resendBlock({ ...row, provider: "outbox" }, true)).toBe("outbox_only");
    expect(resendBlock({ ...row, template: "login_code" }, true)).toBe("login_code");
    // The weekly digest is only worth sending that week (outbox-1).
    expect(resendBlock({ ...row, template: "weekly_host_stats" }, true)).toBe("expired");
    expect(resendBlock({ ...row, to: "995555000011@phone.bayit.invalid" }, true)).toBe("bad_address");
    expect(resendBlock({ ...row, to: "admin-alerts@outbox.invalid" }, true)).toBe("bad_address");
    expect(resendBlock({ ...row, to: "not an email" }, true)).toBe("bad_address");
  });

  it("never to demo or reserved test domains, whatever sender logged them", () => {
    expect(resendBlock({ ...row, to: "noa@demo.bayit.example" }, true)).toBe("demo_or_test");
    expect(resendBlock({ ...row, template: "welcome", to: "x@example.test" }, true)).toBe("demo_or_test");
    expect(resendBlock({ ...row, to: "host@example.com" }, true)).toBe("demo_or_test");
    expect(resendBlock({ ...row, to: "host@EXAMPLE.org" }, true)).toBe("demo_or_test");
    expect(resendBlock({ ...row, to: "dev@localhost" }, true)).toBe("bad_address");
  });

  it("never an email whose Reply-To the outbox didn't keep (the host's reply would miss the guest)", () => {
    expect(resendBlock({ ...row, template: "contact_owner" }, true)).toBe("reply_to_lost");
  });
});

describe("audit log links", () => {
  it("links the new targets to their admin pages", () => {
    expect(auditTargetHref("Booking", "b1")).toBe("/admin/bookings/b1");
    expect(auditTargetHref("ReferencePrice", "r1")).toBe("/admin/reference-prices/r1");
    expect(auditTargetHref("EmailOutbox", "e1")).toBe("/admin/outbox/e1");
    expect(auditActionKey("flag.booking_reviewed")).toBe("actions.flag_booking_reviewed");
    expect(auditActionKey("verification.document_view")).toBe("actions.verification_document_view");
  });
});
