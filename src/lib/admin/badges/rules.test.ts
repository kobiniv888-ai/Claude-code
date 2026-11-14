import { describe, expect, it } from "vitest";
import { hasVisitedBadge, visitedMonth, visitedMonthDate } from "@/lib/listing/visited";
import {
  canSetVisited,
  changedSinceVisit,
  clearVisitSchema,
  earliestVisitDay,
  parseListingQuery,
  parseVisitDay,
  setVisitSchema,
  snapshotFromDetails,
  visitDateErrorCode,
  visitDateProblem,
  visitRefusal,
  VISIT_MAX_AGE_DAYS,
  VISIT_NOTE_MAX,
  type VisitTarget,
} from "./rules";

const listing = (over: Partial<VisitTarget> = {}): VisitTarget => ({
  isDemo: false,
  deletedAt: null,
  status: "LIVE",
  owner: { isDemo: false },
  ...over,
});

describe("who sets the badge", () => {
  it("only an ADMIN (brief 8.3: only the admin)", () => {
    expect(canSetVisited("ADMIN")).toBe(true);
    for (const role of ["MODERATOR", "SUPPORT", "EDITOR", "USER", null, undefined]) expect(canSetVisited(role)).toBe(false);
  });
});

describe("the visit date", () => {
  const today = "2026-11-04";

  it("accepts today and past days within the limit", () => {
    expect(visitDateProblem("2026-11-04", today)).toBeNull();
    expect(visitDateProblem("2026-10-01", today)).toBeNull();
    expect(visitDateProblem(earliestVisitDay(today), today)).toBeNull();
  });

  it("refuses a future day", () => {
    expect(visitDateProblem("2026-11-05", today)).toBe("future");
    expect(visitDateErrorCode("future")).toBe("visit_date_future");
  });

  it("refuses a day further back than the limit (a typo in the year)", () => {
    expect(VISIT_MAX_AGE_DAYS).toBe(730);
    expect(earliestVisitDay(today)).toBe("2024-11-04");
    expect(visitDateProblem("2024-11-03", today)).toBe("too_old");
    expect(visitDateProblem("2016-11-04", today)).toBe("too_old");
    expect(visitDateErrorCode("too_old")).toBe("visit_date_too_old");
  });

  it("refuses something that is not a real calendar day", () => {
    for (const value of ["2026-02-30", "2026-13-01", "04/11/2026", "", null, 20261104]) {
      expect(visitDateProblem(value, today)).toBe("invalid");
    }
    expect(parseVisitDay(" 2026-11-04 ")).toBe("2026-11-04");
    expect(visitDateErrorCode("invalid")).toBe("invalid_input");
  });
});

describe("the input", () => {
  it("needs the listing, the day and a note saying who visited", () => {
    expect(setVisitSchema.safeParse({ listingId: "l1", visitedOn: "2026-11-01", note: "Dana, with the host" }).success).toBe(true);
    expect(setVisitSchema.safeParse({ listingId: "l1", visitedOn: "2026-11-01", note: "  " }).success).toBe(false);
    expect(setVisitSchema.safeParse({ listingId: "l1", visitedOn: "2026-11-01" }).success).toBe(false);
    expect(setVisitSchema.safeParse({ listingId: "l1", visitedOn: "2026-11-01", note: "x".repeat(VISIT_NOTE_MAX + 1) }).success).toBe(false);
    expect(setVisitSchema.safeParse({ listingId: "", visitedOn: "2026-11-01", note: "Dana" }).success).toBe(false);
  });

  it("clearing takes an optional reason", () => {
    expect(clearVisitSchema.parse({ listingId: "l1" })).toEqual({ listingId: "l1", note: "" });
    expect(clearVisitSchema.parse({ listingId: "l1", note: " moved " })).toEqual({ listingId: "l1", note: "moved" });
  });
});

describe("which listings may get it", () => {
  it("never a demo listing or a listing of a demo account", () => {
    expect(visitRefusal(listing({ isDemo: true }))).toBe("visited_demo");
    expect(visitRefusal(listing({ owner: { isDemo: true } }))).toBe("visited_demo");
  });

  it("never a deleted or missing listing", () => {
    expect(visitRefusal(null)).toBe("listing_not_found");
    expect(visitRefusal(listing({ deletedAt: new Date() }))).toBe("listing_not_found");
    expect(visitRefusal(listing({ status: "DELETED" }))).toBe("listing_not_found");
  });

  it("a real listing in any other state (the visit may come before it goes live)", () => {
    for (const status of ["LIVE", "IN_REVIEW", "DRAFT", "PAUSED", "NEEDS_CHANGES"]) expect(visitRefusal(listing({ status }))).toBeNull();
  });
});

describe("finding a listing", () => {
  it("reads a number as the listing's public number", () => {
    expect(parseListingQuery("1234")).toEqual({ publicId: 1234, text: null });
    expect(parseListingQuery("#1234")).toEqual({ publicId: 1234, text: null });
    expect(parseListingQuery("ID 1234")).toEqual({ publicId: 1234, text: null });
    expect(parseListingQuery("0")).toEqual({ publicId: null, text: null });
  });

  it("anything else is part of the title", () => {
    expect(parseListingQuery("  דירה   בוואקה ")).toEqual({ publicId: null, text: "דירה בוואקה" });
    expect(parseListingQuery("a")).toEqual({ publicId: null, text: null });
    expect(parseListingQuery("")).toEqual({ publicId: null, text: null });
  });
});

describe("changed since the visit", () => {
  const visitDay = "2026-10-20";
  const before = new Date("2026-10-15T10:00:00Z");
  const after = new Date("2026-10-25T10:00:00Z");
  const snapshot = { location: "loc-a", photoIds: ["p1", "p2", "p3", "p4"] };

  it("nothing when the place and the photos are the same", () => {
    const photos = snapshot.photoIds.map((id) => ({ id, createdAt: before }));
    expect(changedSinceVisit(visitDay, snapshot, { location: "loc-a", photos })).toEqual([]);
  });

  it("the address or pin moved", () => {
    const photos = snapshot.photoIds.map((id) => ({ id, createdAt: before }));
    expect(changedSinceVisit(visitDay, snapshot, { location: "loc-b", photos })).toEqual(["location"]);
  });

  it("most photos were replaced (half is not most)", () => {
    const half = [{ id: "p1", createdAt: before }, { id: "p2", createdAt: before }, { id: "n1", createdAt: after }, { id: "n2", createdAt: after }];
    expect(changedSinceVisit(visitDay, snapshot, { location: "loc-a", photos: half })).toEqual([]);
    const most = [{ id: "p1", createdAt: before }, { id: "n1", createdAt: after }, { id: "n2", createdAt: after }, { id: "n3", createdAt: after }];
    expect(changedSinceVisit(visitDay, snapshot, { location: "loc-a", photos: most })).toEqual(["photos"]);
  });

  it("most photos were removed", () => {
    expect(changedSinceVisit(visitDay, snapshot, { location: "loc-a", photos: [{ id: "p1", createdAt: before }] })).toEqual(["photos"]);
  });

  it("both at once", () => {
    expect(changedSinceVisit(visitDay, snapshot, { location: "loc-b", photos: [] })).toEqual(["location", "photos"]);
  });

  it("without a snapshot: photos added after the visit day count as new; the location can't be judged", () => {
    const sameDay = new Date("2026-10-20T22:00:00Z");
    const photos = [{ id: "a", createdAt: before }, { id: "b", createdAt: sameDay }, { id: "c", createdAt: after }];
    expect(changedSinceVisit(visitDay, null, { location: "anything", photos })).toEqual([]);
    const mostlyNew = [{ id: "a", createdAt: before }, { id: "c", createdAt: after }, { id: "d", createdAt: after }];
    expect(changedSinceVisit(visitDay, null, { location: "anything", photos: mostlyNew })).toEqual(["photos"]);
  });

  it("reads the snapshot back from the audit entry, ignoring anything malformed", () => {
    expect(snapshotFromDetails({ visitedOn: visitDay, snapshot })).toEqual(snapshot);
    expect(snapshotFromDetails({ snapshot: { location: 1, photoIds: [] } })).toBeNull();
    expect(snapshotFromDetails({ snapshot: { location: "x", photoIds: [1] } })).toBeNull();
    expect(snapshotFromDetails(null)).toBeNull();
    expect(snapshotFromDetails("x")).toBeNull();
  });
});

describe("what the public site knows", () => {
  const visitedAt = new Date("2026-11-03T00:00:00.000Z");

  it("the badge and the month only, never for demo listings", () => {
    expect(hasVisitedBadge({ visitedAt, isDemo: false })).toBe(true);
    expect(hasVisitedBadge({ visitedAt, isDemo: true })).toBe(false);
    expect(hasVisitedBadge({ visitedAt: null, isDemo: false })).toBe(false);
    expect(visitedMonth({ visitedAt, isDemo: false })).toBe("2026-11");
    expect(visitedMonth({ visitedAt, isDemo: true })).toBeNull();
    expect(visitedMonth({ visitedAt: null, isDemo: false })).toBeNull();
    expect(visitedMonthDate("2026-11")).toBe("2026-11-01");
  });
});
