"use server";

/**
 * Review actions for signed-in users (round 3, brief 8.1). Each checks the session, validates with
 * zod, is rate-limited, and checks ownership in ./service.ts (the guest of the booking; the host
 * of the reviewed place). FINAL: there is no action to edit or delete a review or a reply.
 *
 * - createReview: the guest posts the review of a stay (once, in the window).
 * - replyToReview: the host's one public reply.
 * - reportReview: the host asks Bayit to look at a review (Admin → Reports → "ביקורות").
 * - setReviewRequests: the guest's "ask me for reviews by email" switch (/account/reviews).
 *
 * After the response: translations into the other languages (when a key is set) and the emails.
 */
import { after } from "next/server";
import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { setEmailSwitch } from "@/lib/alerts/unsubscribe-server";
import { requireUserForAction } from "@/lib/auth/session";
import { assertRateLimit } from "@/lib/rate-limit";
import { notifyFounderOfReport } from "@/lib/reports/notify";
import { notifyGuestOfReply, notifyHostOfReview } from "./notify";
import { createReviewSchema, quickRatingColumns, replySchema, reportReviewSchema } from "./schemas";
import { createReviewForBooking, postHostReply, reportReviewByHost } from "./service";
import { translateReply, translateReview } from "./translate";

const HOUR = 3600;
const DAY = 24 * HOUR;

/** The first zod message of a text field ("too_short" / "too_long"), else "invalid_input". */
function textError(error: z.ZodError): string {
  const issue = error.issues.find((i) => i.path[0] === "text");
  return issue?.message === "too_short" || issue?.message === "too_long" ? issue.message : "invalid_input";
}

export async function createReview(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = createReviewSchema.safeParse(input);
    if (!parsed.success) return fail(textError(parsed.error), z.flattenError(parsed.error).fieldErrors);
    await assertRateLimit(`review:create:${user.id}`, { limit: 10, windowSeconds: HOUR });
    const { bookingCode, rating, text, locale, ...rest } = parsed.data;
    const review = await createReviewForBooking({
      guestId: user.id,
      bookingCode,
      rating,
      quick: quickRatingColumns(rest),
      text,
      pageLocale: locale,
    });
    after(async () => {
      await translateReview(review.id);
      await notifyHostOfReview(review.id);
    });
    return ok({ id: review.id });
  });
}

export async function replyToReview(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = replySchema.safeParse(input);
    if (!parsed.success) return fail(textError(parsed.error), z.flattenError(parsed.error).fieldErrors);
    await assertRateLimit(`review:reply:${user.id}`, { limit: 30, windowSeconds: HOUR });
    await postHostReply({ hostId: user.id, reviewId: parsed.data.reviewId, text: parsed.data.text, pageLocale: parsed.data.locale });
    after(async () => {
      await translateReply(parsed.data.reviewId);
      await notifyGuestOfReply(parsed.data.reviewId);
    });
    return ok();
  });
}

export async function reportReview(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = reportReviewSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    await assertRateLimit(`review:report:${user.id}`, { limit: 10, windowSeconds: DAY });
    const report = await reportReviewByHost({ hostId: user.id, ...parsed.data });
    after(() => notifyFounderOfReport(report.id));
    return ok();
  });
}

const switchSchema = z.object({ on: z.boolean() });

export async function setReviewRequests(input: unknown): Promise<ActionResult<{ on: boolean }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = switchSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`review:prefs:${user.id}`, { limit: 30, windowSeconds: HOUR });
    await setEmailSwitch(user.id, "reviewRequests", parsed.data.on);
    return ok({ on: parsed.data.on });
  });
}
