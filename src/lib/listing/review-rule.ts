import type { ListingStatus } from "@/generated/prisma/enums";

/**
 * When a listing must wait for a person before it goes live (round 3, brief 9 "Listings to
 * review", founder's binding defaults). Pure and client-safe; ./lifecycle.ts
 * submitForPublication() applies it.
 *
 *   - Each host's FIRST listing always waits for review, as the site promises. The check FAILS
 *     CLOSED: when it cannot be answered (a database error) the listing waits.
 *   - Later listings wait when the automatic checks say so (risk score >= the review threshold,
 *     30 points by default) or when the host is FLAGGED (./host-flags.ts): a flagged host's
 *     NEW listings wait (that check fails closed too).
 *   - Once a person asked to look ("ask for changes", a rejection, or already waiting), only a
 *     person lets it go live: the fixed listing comes BACK to review.
 *   - A blocked result (a BLOCK phrase, an unverified phone) is never published: a live or waiting
 *     listing goes to review, anything else keeps its status.
 */

/** Statuses from which only a person may put the listing on the site. */
export const BACK_TO_REVIEW_STATUSES: readonly ListingStatus[] = ["IN_REVIEW", "NEEDS_CHANGES", "REJECTED"];

export type ReviewGate = {
  /** The account has no other listing that was ever published, and this one never was. */
  firstListing: boolean;
  /** The host has an open flag (only applies to a listing's first publication). */
  flaggedHost: boolean;
  /** One of the two checks could not run and was counted as "yes". */
  failedClosed: boolean;
};

export type SubmitDecisionInput = {
  from: ListingStatus;
  /** The automatic checks blocked publishing. */
  blocked: boolean;
  /** The automatic checks want a person (high risk score, or their own first-listing check). */
  riskRequiresReview: boolean;
  gate: ReviewGate;
};

export type SubmitDecision = {
  target: ListingStatus;
  /** Why it waits for a person (empty when it goes live or stays). */
  why: ("blocked" | "back_to_review" | "first_listing" | "flagged_host" | "risk")[];
};

export function decideSubmitTarget(input: SubmitDecisionInput): SubmitDecision {
  const { from, blocked, riskRequiresReview, gate } = input;
  if (blocked) {
    return from === "LIVE" || from === "IN_REVIEW" ? { target: "IN_REVIEW", why: ["blocked"] } : { target: from, why: [] };
  }
  const why: SubmitDecision["why"] = [];
  if (BACK_TO_REVIEW_STATUSES.includes(from)) why.push("back_to_review");
  if (gate.firstListing) why.push("first_listing");
  // "New listings": a flagged host's edits of a listing that is already published are not held.
  if (gate.flaggedHost && from === "DRAFT") why.push("flagged_host");
  if (riskRequiresReview) why.push("risk");
  return why.length > 0 ? { target: "IN_REVIEW", why } : { target: "LIVE", why: [] };
}

/**
 * Runs the two gate checks; a check that throws counts as "yes" (fail closed) and is logged.
 * `isFirst` / `isFlagged` are the database queries (injected so the rule is testable).
 */
export async function runReviewGate(
  checks: { isFirst: () => Promise<boolean>; isFlagged: () => Promise<boolean> },
  log: (what: string, error: unknown) => void = (what, error) => console.error(`[review-rule] ${what} check failed, the listing waits:`, error),
): Promise<ReviewGate> {
  let failedClosed = false;
  const safe = async (what: string, check: () => Promise<boolean>) => {
    try {
      return await check();
    } catch (error) {
      failedClosed = true;
      log(what, error);
      return true;
    }
  };
  const [firstListing, flaggedHost] = await Promise.all([safe("first_listing", checks.isFirst), safe("flagged_host", checks.isFlagged)]);
  return { firstListing, flaggedHost, failedClosed };
}
