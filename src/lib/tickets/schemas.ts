/**
 * Input schemas for the ticket and contact forms (client-safe). The forms validate with them
 * before sending and the server actions validate again. Error messages are keys translated by
 * the form ("tickets.fieldErrors.<key>" / "contactPage.fieldErrors.<key>").
 */
import { z } from "zod";
import { locales } from "@/config/site";
import { ticketAttachmentsSchema } from "./attachments";
import { TICKET_CATEGORIES, TICKET_LIMITS } from "./constants";

const L = TICKET_LIMITS;

/** Every field error key the schemas can produce. */
export const TICKET_FIELD_ERRORS = [
  "category_required",
  "subject_short",
  "subject_long",
  "message_short",
  "message_long",
  "reply_short",
  "listing_invalid",
  "listing_not_found",
  "too_many_attachments",
  "attachment_invalid",
  "rating_required",
  "comment_long",
  "name_short",
  "name_long",
  "email_invalid",
] as const;
export type TicketFieldError = (typeof TICKET_FIELD_ERRORS)[number];

/** Any other zod message (wrong type, …) is shown as a generic "check this field". */
export function fieldErrorKey(code: string | undefined): TicketFieldError | "invalid" {
  return (TICKET_FIELD_ERRORS as readonly string[]).includes(code ?? "") ? (code as TicketFieldError) : "invalid";
}

const localeSchema = z.enum(locales);
const categorySchema = z.enum(TICKET_CATEGORIES, { error: "category_required" });
const turnstileSchema = z.string().max(2048).nullish();

export const messageSchema = z
  .string({ error: "message_short" })
  .trim()
  .min(L.messageMin, "message_short")
  .max(L.messageMax, "message_long");

export const createTicketSchema = z.object({
  category: categorySchema,
  subject: z.string({ error: "subject_short" }).trim().min(L.subjectMin, "subject_short").max(L.subjectMax, "subject_long"),
  message: messageSchema,
  /** A listing number or address; empty when no listing is linked. */
  listingRef: z.string().trim().max(500, "listing_invalid").default(""),
  attachments: ticketAttachmentsSchema.default([]),
  turnstileToken: turnstileSchema,
  locale: localeSchema,
});
export type CreateTicketInput = z.input<typeof createTicketSchema>;

export const contactFormSchema = z.object({
  name: z.string({ error: "name_short" }).trim().min(L.nameMin, "name_short").max(L.nameMax, "name_long"),
  email: z
    .string({ error: "email_invalid" })
    .trim()
    .toLowerCase()
    .max(254, "email_invalid")
    .pipe(z.email("email_invalid")),
  category: categorySchema,
  message: messageSchema,
  /** Honeypot: hidden from people, bots fill it in. */
  website: z.string().max(500).optional().default(""),
  turnstileToken: turnstileSchema,
  locale: localeSchema,
});
export type ContactFormInput = z.input<typeof contactFormSchema>;

const ticketNumberSchema = z.number().int().min(1).max(2_147_483_647);

export const replySchema = z.object({
  number: ticketNumberSchema,
  message: z
    .string({ error: "reply_short" })
    .trim()
    .min(L.replyMin, "reply_short")
    .max(L.messageMax, "message_long"),
  attachments: ticketAttachmentsSchema.default([]),
});
export type ReplyInput = z.input<typeof replySchema>;

export const rateTicketSchema = z.object({
  number: ticketNumberSchema,
  rating: z.number({ error: "rating_required" }).int("rating_required").min(1, "rating_required").max(5, "rating_required"),
  comment: z.string().trim().max(L.ratingCommentMax, "comment_long").optional().default(""),
});
export type RateTicketInput = z.input<typeof rateTicketSchema>;

export const ticketNumberInputSchema = z.object({ number: ticketNumberSchema });

/** First error per field, for showing under each input. */
export function firstFieldErrors(
  fieldErrors: Record<string, string[] | undefined> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(fieldErrors ?? {})) {
    if (messages?.[0]) out[field] = messages[0];
  }
  return out;
}
