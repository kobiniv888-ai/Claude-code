/**
 * "Turned away?" reports (round 3, brief 8.2): the rules the form and the server share — what
 * happened, when, the screenshot limits, who the host may learn about, and how long screenshots
 * are kept.
 */
import { describe, expect, it } from "vitest";
import { REPORT_DETAILS_MAX, REPORT_OTHER_MIN } from "./schemas";
import {
  HAPPENED_ON_MAX_DAYS_AGO,
  REPORT_SCREENSHOTS,
  REPORT_SCREENSHOT_RETENTION_DAYS,
  TURNED_AWAY_REASONS,
  happenedOnBounds,
  happenedOnProblem,
  isAllowedScreenshotFormat,
  isOwnReportUpload,
  isTurnedAwayReason,
  parseReportAttachments,
  reportAttachmentUrl,
  reporterNameForHost,
  screenshotProblem,
  screenshotRetentionCutoff,
  screenshotsDeleteAt,
  turnedAwayInputSchema,
} from "./turned-away";

const MB = 1024 * 1024;
const USER = "user_abc123";
const key = (name = "a1b2c3", ext = "jpg", user = USER) => `private/report/${user}/${name}.${ext}`;
const shot = (name = "a1b2c3") => ({ key: key(name), mime: "image/jpeg", bytes: 120_000, name: "chat.png" });

function parse(input: Record<string, unknown>) {
  return turnedAwayInputSchema.safeParse({ reason: "CANCELLED_FOR_IDENTITY", happenedOn: "2026-11-02", listingId: "listing-1", ...input });
}

function issues(input: Record<string, unknown>): string[] {
  const result = parse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}:${i.message}`);
}

describe("what happened", () => {
  it("offers the brief's four choices, in its order, with Other last", () => {
    expect(TURNED_AWAY_REASONS).toEqual(["CANCELLED_FOR_IDENTITY", "ASKED_RELIGION_OR_ORIGIN", "REFUSED_OR_IGNORED", "OTHER"]);
    expect(isTurnedAwayReason("REFUSED_OR_IGNORED")).toBe(true);
    expect(isTurnedAwayReason("FAKE_LISTING")).toBe(false);
    expect(isTurnedAwayReason(undefined)).toBe(false);
  });
});

describe("the form (turnedAwayInputSchema)", () => {
  it("accepts a report from a listing or from a booking, and trims the text", () => {
    const fromListing = parse({ details: "  He asked where I was from.  " });
    expect(fromListing.success && fromListing.data).toMatchObject({ listingId: "listing-1", bookingId: null, details: "He asked where I was from.", attachments: [] });
    const fromBooking = parse({ listingId: undefined, bookingId: "booking-1", details: "   " });
    expect(fromBooking.success && fromBooking.data).toMatchObject({ bookingId: "booking-1", listingId: null, details: null });
  });

  it("needs a booking or a listing", () => {
    expect(issues({ listingId: null })).toContain("listingId:target_required");
    expect(issues({ listingId: "" })).toContain("listingId:target_required");
  });

  it("takes only the four turned-away reasons", () => {
    expect(issues({ reason: "FAKE_LISTING" })).not.toEqual([]);
    expect(issues({ reason: "" })).not.toEqual([]);
    for (const reason of TURNED_AWAY_REASONS.filter((r) => r !== "OTHER")) expect(issues({ reason })).toEqual([]);
  });

  it("needs a few words for Other, and caps the text", () => {
    expect(issues({ reason: "OTHER" })).toContain("details:details_required");
    expect(issues({ reason: "OTHER", details: "x".repeat(REPORT_OTHER_MIN - 1) })).toContain("details:details_required");
    expect(issues({ reason: "OTHER", details: "x".repeat(REPORT_OTHER_MIN) })).toEqual([]);
    expect(issues({ details: "x".repeat(REPORT_DETAILS_MAX + 1) })).not.toEqual([]);
  });

  it("allows at most 5 screenshots, each once, each a valid storage key", () => {
    const five = ["a1", "b2", "c3", "d4", "e5"].map(shot);
    expect(issues({ attachments: five })).toEqual([]);
    expect(issues({ attachments: [...five, shot("f6")] })).toContain("attachments:too_many_files");
    expect(issues({ attachments: [shot("a1"), shot("a1")] })).toContain("attachments:attachment_invalid");
    expect(issues({ attachments: [{ ...shot(), key: "../../etc/passwd" }] })).not.toEqual([]);
    expect(issues({ attachments: [{ ...shot(), bytes: REPORT_SCREENSHOTS.maxBytes + 1 }] })).not.toEqual([]);
  });

  it("refuses fields it does not know (no way to set the priority, kind or host from the browser)", () => {
    expect(issues({ priority: "NORMAL" })).not.toEqual([]);
    expect(issues({ targetUserId: "someone" })).not.toEqual([]);
    expect(issues({ reporterRevealedAt: new Date().toISOString() })).not.toEqual([]);
  });
});

describe("when it happened", () => {
  const today = "2026-11-04";

  it("is a real calendar day", () => {
    expect(happenedOnProblem("", today)).toBe("date_invalid");
    expect(happenedOnProblem("2026-02-30", today)).toBe("date_invalid");
    expect(happenedOnProblem("04/11/2026", today)).toBe("date_invalid");
    expect(happenedOnProblem("2026-11-04T10:00", today)).toBe("date_invalid");
    expect(happenedOnProblem("2026-11-04", today)).toBeNull();
  });

  it("is not in the future (one day of slack for a phone already on tomorrow)", () => {
    expect(happenedOnProblem("2026-11-05", today)).toBeNull();
    expect(happenedOnProblem("2026-11-06", today)).toBe("date_future");
  });

  it("is within the last year", () => {
    const { min, max } = happenedOnBounds(today);
    expect(max).toBe(today);
    expect(min).toBe("2025-11-04");
    expect(HAPPENED_ON_MAX_DAYS_AGO).toBe(365);
    expect(happenedOnProblem(min, today)).toBeNull();
    expect(happenedOnProblem("2025-11-03", today)).toBe("date_too_old");
  });
});

describe("screenshots: images only, with a size limit", () => {
  it("is at most 5 files of 5 MB", () => {
    expect(REPORT_SCREENSHOTS.maxFiles).toBe(5);
    expect(REPORT_SCREENSHOTS.maxBytes).toBe(5 * MB);
  });

  it("lets the browser pick only JPEG, PNG and WebP", () => {
    expect(screenshotProblem({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(screenshotProblem({ type: "IMAGE/PNG", size: 1000 })).toBeNull();
    expect(screenshotProblem({ type: "image/webp; q=1", size: 1000 })).toBeNull();
    for (const type of ["image/gif", "image/heic", "image/svg+xml", "application/pdf", "video/mp4", ""]) {
      expect(screenshotProblem({ type, size: 1000 }), type).toBe("file_type_not_allowed");
    }
  });

  it("refuses empty files and files over 5 MB", () => {
    expect(screenshotProblem({ type: "image/png", size: 5 * MB })).toBeNull();
    expect(screenshotProblem({ type: "image/png", size: 5 * MB + 1 })).toBe("file_too_large");
    expect(screenshotProblem({ type: "image/png", size: 0 })).toBe("file_too_large");
  });

  it("lets the server store only what the bytes say is JPEG, PNG or WebP", () => {
    for (const format of ["jpeg", "png", "webp"]) expect(isAllowedScreenshotFormat(format)).toBe(true);
    for (const format of ["gif", "heif", "avif", "svg", "tiff", "", null, undefined]) expect(isAllowedScreenshotFormat(format)).toBe(false);
  });

  it("attaches only the reporter's own report uploads", () => {
    expect(isOwnReportUpload(key(), USER)).toBe(true);
    expect(isOwnReportUpload(key("x", "webp"), USER)).toBe(true);
    expect(isOwnReportUpload(key("x", "jpg", "someone_else"), USER)).toBe(false);
    expect(isOwnReportUpload(`private/ticket/${USER}/x.jpg`, USER)).toBe(false);
    expect(isOwnReportUpload(`private/report/${USER}/../x.jpg`, USER)).toBe(false);
    expect(isOwnReportUpload(key("x", "pdf"), USER)).toBe(false);
  });

  it("reads stored screenshots safely, dropping anything malformed", () => {
    expect(parseReportAttachments(null)).toEqual([]);
    expect(parseReportAttachments({ key: key() })).toEqual([]);
    expect(parseReportAttachments([shot("a1"), { key: 5 }, "x", { ...shot("b2"), name: undefined }])).toEqual([shot("a1"), { ...shot("b2"), name: "" }]);
  });

  it("opens them only through the staff route", () => {
    expect(reportAttachmentUrl("rep_1", 0)).toBe("/api/admin/reports/rep_1/0");
    expect(reportAttachmentUrl("a/b", 2)).toBe("/api/admin/reports/a%2Fb/2");
  });
});

describe("who the host may learn about", () => {
  const reporter = { firstName: "Noa", name: "Noa Levi" };

  it("never names the reporter until the founder decides to", () => {
    expect(reporterNameForHost({ reporterRevealedAt: null, reporter })).toBeNull();
    expect(reporterNameForHost({ reporterRevealedAt: undefined, reporter })).toBeNull();
  });

  it("after the decision, gives the first name only", () => {
    const revealedAt = new Date("2026-11-04T10:00:00Z");
    expect(reporterNameForHost({ reporterRevealedAt: revealedAt, reporter })).toBe("Noa");
    expect(reporterNameForHost({ reporterRevealedAt: revealedAt, reporter: { firstName: null, name: "  Dana Cohen " } })).toBe("Dana");
    expect(reporterNameForHost({ reporterRevealedAt: revealedAt, reporter: { firstName: " ", name: " " } })).toBeNull();
    expect(reporterNameForHost({ reporterRevealedAt: revealedAt, reporter: null })).toBeNull();
    // A phone number or an email stored as the name is never passed on.
    expect(reporterNameForHost({ reporterRevealedAt: revealedAt, reporter: { firstName: null, name: "+972 50 123 4567" } })).toBeNull();
    expect(reporterNameForHost({ reporterRevealedAt: revealedAt, reporter: { firstName: "noa@example.com", name: null } })).toBeNull();
  });
});

describe("keeping screenshots", () => {
  const handledAt = new Date("2026-01-10T12:00:00Z");

  it("keeps them while the report is open", () => {
    expect(screenshotsDeleteAt({ status: "OPEN", handledAt: null })).toBeNull();
    expect(screenshotsDeleteAt({ status: "OPEN", handledAt })).toBeNull();
    expect(screenshotsDeleteAt({ status: "RESOLVED", handledAt: null })).toBeNull();
  });

  it("deletes them 180 days after the decision", () => {
    expect(REPORT_SCREENSHOT_RETENTION_DAYS).toBe(180);
    expect(screenshotsDeleteAt({ status: "RESOLVED", handledAt })?.toISOString()).toBe("2026-07-09T12:00:00.000Z");
    expect(screenshotsDeleteAt({ status: "DISMISSED", handledAt })?.toISOString()).toBe("2026-07-09T12:00:00.000Z");
    expect(screenshotRetentionCutoff(new Date("2026-07-09T12:00:00Z")).toISOString()).toBe(handledAt.toISOString());
  });
});
