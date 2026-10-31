"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { fail, ok, toActionError, type ActionFailure, type ActionResult } from "@/lib/action";
import { getCurrentUser, requireUserForAction } from "@/lib/auth/session";
import { ShabbatModeError, ValidationError } from "@/lib/errors";
import { assertRateLimit, assertRateLimitByIp } from "@/lib/rate-limit";
import { assertNotShabbatMode } from "@/lib/settings";
import { assertTurnstile } from "@/lib/turnstile";
import { TICKET_RATE_LIMITS, ticketPath } from "./constants";
import { parseListingRef } from "./listing-ref";
import {
  contactFormSchema,
  createTicketSchema,
  rateTicketSchema,
  replySchema,
  ticketNumberInputSchema,
} from "./schemas";
import {
  addUserMessage,
  closeTicketForUser,
  createTicketRecord,
  findListingForTicket,
  rateTicketForUser,
  sendTicketCreatedEmail,
} from "./server";

/**
 * Server actions for the help center, the contact form and the user's ticket pages.
 * Every action: session (where needed) → zod → Shabbat mode → rate limit → CAPTCHA (public
 * forms) → ownership checks in the ticket helpers.
 */

/** A failed result; during Shabbat mode it says when posting opens again. */
export type TicketActionResult<T = void> = ActionResult<T> | (ActionFailure & { shabbatEndsAt?: string | null });

function toTicketActionError(error: unknown): ActionFailure & { shabbatEndsAt?: string | null } {
  if (error instanceof ShabbatModeError) {
    return { ...fail("shabbat_mode"), shabbatEndsAt: error.endsAt ? error.endsAt.toISOString() : null };
  }
  return toActionError(error);
}

function invalid(error: z.ZodError): ActionFailure {
  return fail("invalid_input", z.flattenError(error).fieldErrors);
}

/** "Link a listing" preview while the user types (title only for public or own listings). */
export async function lookupTicketListing(
  ref: string,
  locale: string,
): Promise<TicketActionResult<{ publicId: number; title: string | null }>> {
  try {
    const user = await requireUserForAction();
    const value = z.string().max(500).safeParse(ref);
    if (!value.success || parseListingRef(value.data) == null) return fail("listing_invalid");
    await assertRateLimit(`ticket:listing-lookup:${user.id}`, TICKET_RATE_LIMITS.listingLookup);
    const listing = await findListingForTicket(value.data, user.id, locale);
    if (!listing) return fail("listing_not_found");
    return ok({ publicId: listing.publicId, title: listing.title });
  } catch (error) {
    return toTicketActionError(error);
  }
}

/** "Open a ticket" (signed-in). On success it redirects to the new ticket's page. */
export async function createTicket(input: unknown): Promise<TicketActionResult<{ number: number }>> {
  let created: { number: number; locale: string } | null = null;
  try {
    const user = await requireUserForAction();
    const parsed = createTicketSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;

    await assertNotShabbatMode();
    await assertRateLimit(`ticket:create:${user.id}`, TICKET_RATE_LIMITS.create);
    await assertTurnstile(data.turnstileToken, { expectedAction: "ticket" });

    let listingId: string | null = null;
    if (data.listingRef) {
      if (parseListingRef(data.listingRef) == null) throw new ValidationError({ listingRef: ["listing_invalid"] });
      const listing = await findListingForTicket(data.listingRef, user.id, data.locale);
      if (!listing) throw new ValidationError({ listingRef: ["listing_not_found"] });
      listingId = listing.id;
    }

    const ticket = await createTicketRecord({
      userId: user.id,
      category: data.category,
      subject: data.subject,
      body: data.message,
      listingId,
      locale: data.locale,
      attachments: data.attachments,
    });
    await sendTicketCreatedEmail(ticket.id);
    created = { number: ticket.number, locale: data.locale };
  } catch (error) {
    return toTicketActionError(error);
  }
  if (!created) return fail("server_error");
  // Outside the try: redirect() works by throwing.
  return redirect({ href: `${ticketPath(created.number)}?created=1`, locale: created.locale });
}

/** The public contact form (no account needed). `number` is null when the honeypot caught a bot. */
export async function submitContactForm(input: unknown): Promise<TicketActionResult<{ number: number | null }>> {
  try {
    const parsed = contactFormSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;

    // Bots fill in the hidden field: answer as if it worked, store nothing.
    if (data.website.trim()) return ok({ number: null });

    await assertNotShabbatMode();
    await assertRateLimitByIp("ticket:contact", TICKET_RATE_LIMITS.contact);
    await assertTurnstile(data.turnstileToken, { expectedAction: "contact" });

    // Signed-in visitors get the ticket in their account too.
    const user = await getCurrentUser();
    const firstLine = data.message.split("\n").find((line) => line.trim()) ?? data.message;
    const subject = firstLine.replace(/\s+/g, " ").trim().slice(0, 80);

    const ticket = await createTicketRecord({
      userId: user && user.twoFactorVerified ? user.id : null,
      guestName: data.name,
      guestEmail: data.email,
      category: data.category,
      subject,
      body: data.message,
      locale: data.locale,
    });
    await sendTicketCreatedEmail(ticket.id);
    return ok({ number: ticket.number });
  } catch (error) {
    return toTicketActionError(error);
  }
}

/** The user answers on their own ticket. */
export async function replyToTicket(input: unknown): Promise<TicketActionResult<{ status: string }>> {
  try {
    const user = await requireUserForAction();
    const parsed = replySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    await assertNotShabbatMode();
    await assertRateLimit(`ticket:reply:${user.id}`, TICKET_RATE_LIMITS.reply);
    const result = await addUserMessage({
      number: parsed.data.number,
      userId: user.id,
      body: parsed.data.message,
      attachments: parsed.data.attachments,
    });
    return ok({ status: result.status });
  } catch (error) {
    return toTicketActionError(error);
  }
}

/** "Was this helpful?" — 1 to 5 stars and an optional comment; closes the ticket. */
export async function rateTicket(input: unknown): Promise<TicketActionResult> {
  try {
    const user = await requireUserForAction();
    const parsed = rateTicketSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    await assertRateLimit(`ticket:rate:${user.id}`, TICKET_RATE_LIMITS.rate);
    await rateTicketForUser({ userId: user.id, ...parsed.data });
    return ok();
  } catch (error) {
    return toTicketActionError(error);
  }
}

/** The user closes their own ticket. */
export async function closeTicket(input: unknown): Promise<TicketActionResult> {
  try {
    const user = await requireUserForAction();
    const parsed = ticketNumberInputSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    await assertRateLimit(`ticket:close:${user.id}`, TICKET_RATE_LIMITS.close);
    await closeTicketForUser({ number: parsed.data.number, userId: user.id });
    return ok();
  } catch (error) {
    return toTicketActionError(error);
  }
}
