import { describe, expect, it } from "vitest";
import {
  REVIEW_TEXT_MAX,
  REVIEW_TEXT_MIN,
  canReply,
  cardRating,
  formatHiddenReason,
  getRatingSummary,
  parseHiddenReason,
  parseTranslations,
  pickReviewText,
  quickRatingAverages,
  reviewBlock,
  reviewDaysLeft,
  reviewMonth,
  reviewWindow,
  reviewerFirstName,
  translationTargets,
  visibilityDelta,
  type ReviewEligibilityInput,
} from "./rules";
import { createReviewSchema, replySchema, tidyReviewText } from "./schemas";
import { REVIEW_EMAIL_TEMPLATES } from "./email-templates";
import { writeReviewPath } from "./paths";

const base: ReviewEligibilityInput = {
  status: "COMPLETED",
  checkOut: "2026-10-10",
  dealType: "SHORT_STAY",
  demo: false,
  listingDeleted: false,
  hasReview: false,
  today: "2026-10-12",
};

describe("who may review, and when (brief 8.1)", () => {
  it("opens the day after check-out and closes 14 days after it (Georgia days, both included)", () => {
    expect(reviewWindow("2026-10-10")).toEqual({ opens: "2026-10-11", closes: "2026-10-24" });
    expect(reviewBlock({ ...base, today: "2026-10-10" })).toBe("too_early");
    expect(reviewBlock({ ...base, today: "2026-10-11" })).toBeNull();
    expect(reviewBlock({ ...base, today: "2026-10-24" })).toBeNull();
    expect(reviewBlock({ ...base, today: "2026-10-25" })).toBe("too_late");
    // Across a month end.
    expect(reviewWindow("2026-10-31")).toEqual({ opens: "2026-11-01", closes: "2026-11-14" });
  });

  it("counts a CONFIRMED booking whose check-out passed (the daily job may not have run yet), never a cancelled or no-show one", () => {
    expect(reviewBlock({ ...base, status: "CONFIRMED" })).toBeNull();
    expect(reviewBlock({ ...base, status: "CONFIRMED", today: "2026-10-09" })).toBe("too_early");
    for (const status of ["CANCELLED_BY_GUEST", "CANCELLED_BY_HOST", "NO_SHOW"]) {
      expect(reviewBlock({ ...base, status })).toBe("not_stayed");
    }
  });

  it("is once per booking", () => {
    expect(reviewBlock({ ...base, hasReview: true })).toBe("already_reviewed");
  });

  it("has no reviews for monthly rentals and sales, and none for demo stays", () => {
    expect(reviewBlock({ ...base, dealType: "HOTEL_ROOM" })).toBeNull();
    expect(reviewBlock({ ...base, dealType: "MONTHLY_RENT" })).toBe("not_reviewable_type");
    expect(reviewBlock({ ...base, dealType: "SALE" })).toBe("not_reviewable_type");
    expect(reviewBlock({ ...base, demo: true })).toBe("demo");
    expect(reviewBlock({ ...base, listingDeleted: true })).toBe("listing_gone");
  });

  it("counts the days left, today included", () => {
    expect(reviewDaysLeft("2026-10-10", "2026-10-11")).toBe(14);
    expect(reviewDaysLeft("2026-10-10", "2026-10-24")).toBe(1);
    expect(reviewDaysLeft("2026-10-10", "2026-10-25")).toBe(0);
  });
});

describe("content", () => {
  const valid = { bookingCode: "BT-7K3Q9", rating: 5, text: "A quiet, clean flat with a lovely host.", confirmFinal: true as const };

  it("needs 1–5 stars and 20–2000 characters; quick ratings are optional", () => {
    expect(createReviewSchema.safeParse(valid).success).toBe(true);
    expect(createReviewSchema.safeParse({ ...valid, cleanliness: 4, value: null }).success).toBe(true);
    for (const rating of [0, 6, 4.5]) expect(createReviewSchema.safeParse({ ...valid, rating }).success).toBe(false);
    expect(createReviewSchema.safeParse({ ...valid, accuracy: 7 }).success).toBe(false);
    const short = createReviewSchema.safeParse({ ...valid, text: "x".repeat(REVIEW_TEXT_MIN - 1) });
    expect(short.success).toBe(false);
    expect(short.error?.issues[0].message).toBe("too_short");
    expect(createReviewSchema.safeParse({ ...valid, text: "x".repeat(REVIEW_TEXT_MAX + 1) }).error?.issues[0].message).toBe("too_long");
    // Spaces don't count toward the minimum.
    expect(createReviewSchema.safeParse({ ...valid, text: `   ${"a ".repeat(5)}        ` }).success).toBe(false);
  });

  it("asks the guest to confirm that a review is final", () => {
    expect(createReviewSchema.safeParse({ ...valid, confirmFinal: false }).success).toBe(false);
    expect(replySchema.safeParse({ reviewId: "r1", text: "Thank you!", confirmFinal: true }).success).toBe(true);
    expect(replySchema.safeParse({ reviewId: "r1", text: "Thank you!" }).success).toBe(false);
  });

  it("tidies spaces and blank lines but keeps paragraphs", () => {
    expect(tidyReviewText("  Great   stay \r\n\r\n\r\n\r\nWould  come back  ")).toBe("Great stay\n\nWould come back");
  });
});

describe("final once posted", () => {
  it("allows one reply, never on a hidden review", () => {
    expect(canReply({ hostReply: null, hidden: false })).toBe(true);
    expect(canReply({ hostReply: "Thanks!", hidden: false })).toBe(false);
    expect(canReply({ hostReply: null, hidden: true })).toBe(false);
  });
});

describe("the average and the count (contract 3)", () => {
  it("shows the average only from 3 visible reviews, with one decimal", () => {
    expect(getRatingSummary({ reviewCount: 0, ratingSum: 0 })).toEqual({ count: 0, average: null });
    expect(getRatingSummary({ reviewCount: 2, ratingSum: 10 })).toEqual({ count: 2, average: null });
    expect(getRatingSummary({ reviewCount: 3, ratingSum: 14 })).toEqual({ count: 3, average: 4.7 });
    expect(getRatingSummary({ reviewCount: 4, ratingSum: 18 })).toEqual({ count: 4, average: 4.5 });
    expect(getRatingSummary({ reviewCount: 7, ratingSum: 35 })).toEqual({ count: 7, average: 5 });
  });

  it("gives the card a rating only with an average", () => {
    expect(cardRating({ reviewCount: 2, ratingSum: 9 })).toBeNull();
    expect(cardRating({ reviewCount: 12, ratingSum: 56 })).toEqual({ average: 4.7, count: 12 });
  });

  it("shows a quick rating only when 3 visible reviews rated it", () => {
    expect(
      quickRatingAverages([
        { key: "cleanliness", average: 4.666, count: 3 },
        { key: "value", average: 5, count: 2 },
        { key: "location", average: null, count: 0 },
      ]),
    ).toEqual([{ key: "cleanliness", average: 4.7 }]);
  });
});

describe("hide math", () => {
  it("takes a hidden review out of the counters and puts it back when shown again", () => {
    const start = { reviewCount: 3, ratingSum: 13 };
    const hidden = visibilityDelta(start, 2, "hide");
    expect(hidden).toEqual({ reviewCount: 2, ratingSum: 11 });
    // Two visible reviews left: no average any more.
    expect(getRatingSummary(hidden).average).toBeNull();
    expect(visibilityDelta(hidden, 2, "show")).toEqual(start);
  });

  it("never goes below zero", () => {
    expect(visibilityDelta({ reviewCount: 0, ratingSum: 0 }, 5, "hide")).toEqual({ reviewCount: 0, ratingSum: 0 });
  });

  it("keeps the reason code and the staff note together", () => {
    const stored = formatHiddenReason("personal_info", "  Names the host's neighbour  ");
    expect(parseHiddenReason(stored)).toEqual({ code: "personal_info", note: "Names the host's neighbour" });
    expect(parseHiddenReason("weird\nnote")).toEqual({ code: "other", note: "note" });
    expect(parseHiddenReason(null)).toBeNull();
  });
});

describe("first name and month (founder's answer 6)", () => {
  it("shows the first name only, never the full name", () => {
    expect(reviewerFirstName({ firstName: "Dana", name: "Dana Levi" })).toBe("Dana");
    expect(reviewerFirstName({ firstName: null, name: "Dana Levi" })).toBe("Dana");
    expect(reviewerFirstName({ firstName: null, name: "+995555123456" })).toBeNull();
    expect(reviewerFirstName({ firstName: "Dana", name: "Dana Levi", status: "DELETED" })).toBeNull();
  });

  it("dates a review by its month in Georgia", () => {
    expect(reviewMonth(new Date("2026-10-15T12:00:00Z"))).toBe("2026-10");
    // 22:00 UTC on 31 October is already 1 November in Tbilisi (UTC+4).
    expect(reviewMonth(new Date("2026-10-31T22:00:00Z"))).toBe("2026-11");
  });
});

describe("translation fallback", () => {
  it("shows the translation into the reader's language, with the original kept", () => {
    const shown = pickReviewText("דירה מקסימה", "he", { en: "A lovely flat", ru: "" }, "en");
    expect(shown).toEqual({ shown: "A lovely flat", original: "דירה מקסימה", translated: true, language: "he" });
  });

  it("shows the original when there is no translation (no key) or the reader writes the same language", () => {
    expect(pickReviewText("דירה מקסימה", "he", null, "en")).toMatchObject({ shown: "דירה מקסימה", translated: false });
    expect(pickReviewText("דירה מקסימה", "he", { ru: "Милая квартира" }, "en")).toMatchObject({ shown: "דירה מקסימה", translated: false });
    expect(pickReviewText("דירה מקסימה", "he", { he: "something else" }, "he")).toMatchObject({ shown: "דירה מקסימה", translated: false });
  });

  it("reads only known languages with text, and translates into the four others", () => {
    expect(parseTranslations({ en: "Hi", xx: "?", ru: "  ", ka: 5 })).toEqual({ en: "Hi" });
    expect(parseTranslations("nope")).toEqual({});
    expect(translationTargets("ru")).toEqual(["he", "en", "ar", "ka"]);
  });
});

describe("emails and links", () => {
  it("has the review request and the notices", () => {
    expect(REVIEW_EMAIL_TEMPLATES).toEqual(["review_request", "review_posted_host", "review_reply_guest", "review_hidden", "review_shown"]);
  });

  it("opens the form for one booking, with the stars tapped on the trip page", () => {
    expect(writeReviewPath("BT-7K3Q9")).toBe("/account/reviews/write/BT-7K3Q9");
    expect(writeReviewPath("BT-7K3Q9", 4)).toBe("/account/reviews/write/BT-7K3Q9?rating=4");
  });
});
