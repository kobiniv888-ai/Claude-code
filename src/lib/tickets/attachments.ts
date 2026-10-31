/**
 * Ticket attachments (screenshots) — pure helpers, client-safe.
 *
 * Files are uploaded first with POST /api/uploads/private (purpose "ticket"), which answers
 * { key, mime, bytes, name }. The ticket message stores that list in TicketMessage.attachments,
 * and the files are served only through /api/tickets/attachment?key=… to the ticket's owner
 * and to support staff.
 */
import { z } from "zod";
import { isOwnPrivateUpload } from "@/lib/media";
import { isValidStorageKey } from "@/lib/storage/keys";
import { TICKET_LIMITS } from "./constants";

export type TicketAttachment = { key: string; mime: string; bytes: number; name: string };

export const ticketAttachmentSchema = z.object({
  key: z.string().min(1).max(512).refine(isValidStorageKey, "attachment_invalid"),
  mime: z.string().trim().min(1).max(100),
  bytes: z.number().int().min(0).max(100 * 1024 * 1024),
  name: z.string().trim().max(200).default(""),
});

export const ticketAttachmentsSchema = z
  .array(ticketAttachmentSchema)
  .max(TICKET_LIMITS.maxAttachments, "too_many_attachments")
  .refine((list) => new Set(list.map((a) => a.key)).size === list.length, "attachment_invalid");

/** Reads TicketMessage.attachments (JSON) safely; invalid entries are dropped. */
export function parseAttachments(value: unknown): TicketAttachment[] {
  if (!Array.isArray(value)) return [];
  const out: TicketAttachment[] = [];
  for (const item of value) {
    const parsed = ticketAttachmentSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * The upload endpoint stores a user's ticket files under "private/ticket/<userId>/", so any
 * other key was not uploaded by this user for a ticket (and must not be attached to theirs).
 */
export function isAttachmentKeyOwnedBy(key: string, userId: string): boolean {
  return isValidStorageKey(key) && isOwnPrivateUpload(key, userId, "ticket");
}

/** Raster images that are safe to show inline (never SVG). */
const INLINE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export function isInlineImage(mime: string | null | undefined): boolean {
  return INLINE_IMAGE_TYPES.has((mime ?? "").toLowerCase().split(";")[0].trim());
}

/** The protected download address of an attachment. */
export function attachmentUrl(key: string): string {
  return `/api/tickets/attachment?key=${encodeURIComponent(key)}`;
}

/** A file name that is safe in a Content-Disposition header. */
export function safeDownloadName(name: string | null | undefined, fallback: string): string {
  const cleaned = (name ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f"\\/<>:|?*]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}
