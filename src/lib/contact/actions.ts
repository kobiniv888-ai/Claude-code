"use server";

/**
 * Contacting owners (BRIEF section 8). Every action needs a signed-in user.
 *
 * - revealContact: the owner's contact methods for one listing, only after "Show contact"
 *   (behind the invisible CAPTCHA, action "reveal_contact").
 * - recordContactTap: one tap on a channel button (owner stats), before the app opens.
 * - markSafetyTipSeen: the first-contact safety tip was accepted.
 * - sendContactEmail: the email channel — a form, so the owner's address stays hidden.
 */
import { personName } from "@/lib/auth/first-name";
import { z } from "zod";
import { isAppLocale } from "@/i18n/locale";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { requireUserForAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isPlaceholderEmail, notificationEmailFor, sendEmail } from "@/lib/email";
import { formatDateRange } from "@/lib/format";
import { CONTACT_CHANNELS } from "@/lib/listing/fields";
import { recordContactClick } from "@/lib/listing/stats";
import { listingPath } from "@/lib/listing/urls";
import { assertRateLimit, rateLimit } from "@/lib/rate-limit";
import { assertNotShabbatMode } from "@/lib/settings";
import { assertTurnstile } from "@/lib/turnstile";
import { parseContactMethods, revealedValue, type RevealedContact } from "./links";
import { findContactableListing, isBlockedBetween, safetyTipSeen } from "./server";

const HOUR = 3600;
const DAY = 24 * HOUR;

const listingIdSchema = z.string().trim().min(1).max(64);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish()
  .transform((v) => v ?? null);

const emailSchema = z
  .object({
    listingId: listingIdSchema,
    name: z.string().trim().min(2).max(80),
    email: z.email().trim().max(254),
    message: z.string().trim().min(10).max(2000),
    checkIn: day,
    checkOut: day,
    turnstileToken: z.string().max(2048).nullish(),
  })
  .strict();

export type RevealResult = {
  methods: RevealedContact[];
  /** The visitor already accepted the first-contact safety tip. */
  safetyTipSeen: boolean;
  /** To prefill the email form. */
  sender: { name: string; email: string | null };
};

const turnstileTokenSchema = z.string().max(2048).nullish();

/** The owner's contact methods in their order. EMAIL comes without its value. */
export async function revealContact(listingId: string, turnstileToken?: string | null): Promise<ActionResult<RevealResult>> {
  return runAction<RevealResult>(async () => {
    const user = await requireUserForAction();
    const id = listingIdSchema.safeParse(listingId);
    const token = turnstileTokenSchema.safeParse(turnstileToken);
    if (!id.success || !token.success) return fail("invalid_input");

    await assertRateLimit(`contact-reveal:user:${user.id}`, { limit: 30, windowSeconds: HOUR });
    await assertTurnstile(token.data, { expectedAction: "reveal_contact" });
    const listing = await findContactableListing(id.data);
    if (!listing) return fail("not_found");
    if (await isBlockedBetween(user.id, listing.ownerId)) return fail("blocked");

    // The per-listing cap counts each visitor once a day, so a popular listing is not locked by refreshes.
    const firstToday = await rateLimit(`contact-reveal:seen:${user.id}:${listing.id}`, { limit: 1, windowSeconds: DAY });
    if (firstToday.ok) await assertRateLimit(`contact-reveal:listing:${listing.id}`, { limit: 200, windowSeconds: DAY });

    const methods = parseContactMethods(listing.contactMethods)
      .filter((m) => m.channel !== "EMAIL" || hasEmailDestination(m.value, listing.owner.email))
      .map((m) => ({ channel: m.channel, value: revealedValue(m) }));
    return ok({
      methods,
      safetyTipSeen: await safetyTipSeen(user.id),
      // Never a phone number or an email as a name (bug 8.2).
      sender: { name: personName(user) ?? "", email: user.emailIsPlaceholder ? null : user.email },
    });
  });
}

const tapSchema = z.object({ listingId: listingIdSchema, channel: z.enum(CONTACT_CHANNELS) });

/** Counts one tap on a channel button for the owner's stats (owners' own taps are not counted). */
export async function recordContactTap(listingId: string, channel: string): Promise<ActionResult<{ recorded: boolean }>> {
  return runAction<{ recorded: boolean }>(async () => {
    const user = await requireUserForAction();
    const input = tapSchema.safeParse({ listingId, channel });
    if (!input.success) return fail("invalid_input");
    const limit = await rateLimit(`contact-tap:${user.id}`, { limit: 60, windowSeconds: HOUR });
    if (!limit.ok) return ok({ recorded: false });

    const listing = await findContactableListing(input.data.listingId);
    if (!listing) return fail("not_found");
    if (!parseContactMethods(listing.contactMethods).some((m) => m.channel === input.data.channel)) return fail("invalid_input");
    const recorded = await recordContactClick(listing.id, input.data.channel, user.id);
    return ok({ recorded });
  });
}

/** The first-contact safety tip was read ("I understand"). */
export async function markSafetyTipSeen(): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`safety-tip:${user.id}`, { limit: 20, windowSeconds: HOUR });
    await db.user.updateMany({ where: { id: user.id, safetyTipSeenAt: null }, data: { safetyTipSeenAt: new Date() } });
    return ok();
  });
}

function hasEmailDestination(value: string, accountEmail: string): boolean {
  const destination = value.includes("@") ? value : accountEmail;
  return !!destination && !isPlaceholderEmail(destination);
}

/** Sends the guest's message to the owner by email; the owner replies straight to the guest. */
export async function sendContactEmail(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = emailSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const data = parsed.data;

    await assertNotShabbatMode();
    await assertTurnstile(data.turnstileToken, { expectedAction: "contact_owner" });
    await assertRateLimit(`contact-email:user:${user.id}`, { limit: 5, windowSeconds: HOUR });
    await assertRateLimit(`contact-email:user-day:${user.id}`, { limit: 20, windowSeconds: DAY });

    const listing = await findContactableListing(data.listingId);
    if (!listing) return fail("not_found");
    if (listing.ownerId === user.id) return fail("own_listing");
    if (await isBlockedBetween(user.id, listing.ownerId)) return fail("blocked");
    await assertRateLimit(`contact-email:listing:${listing.id}`, { limit: 50, windowSeconds: DAY });

    const emailMethod = parseContactMethods(listing.contactMethods).find((m) => m.channel === "EMAIL");
    if (!emailMethod) return fail("no_email");
    const to = emailMethod.value.includes("@") ? emailMethod.value : notificationEmailFor(listing.owner);
    if (!to || isPlaceholderEmail(to)) return fail("no_email");

    const ownerLocale = isAppLocale(listing.owner.locale) ? listing.owner.locale : "en";
    const dates = data.checkIn && data.checkOut && data.checkOut > data.checkIn
      ? formatDateRange(data.checkIn, data.checkOut, ownerLocale)
      : null;
    const sent = await sendEmail({
      to,
      template: "contact_owner",
      locale: ownerLocale,
      replyTo: data.email,
      data: {
        ownerName: (listing.owner.accountType === "BUSINESS" && listing.owner.businessName) || listing.owner.name,
        senderName: data.name,
        senderEmail: data.email,
        senderPhone: null,
        message: data.message,
        listingTitle: listing.title,
        listingUrl: listingPath(listing.publicId, listing.title),
        listingId: listing.publicId,
        dates,
      },
    });
    if (!sent.ok) return fail("send_failed");
    return ok();
  });
}
