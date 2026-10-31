/**
 * Support tickets — vocabulary and pure rules (client-safe, no server imports).
 * Shared by the help center, the user's ticket pages and the admin support screens.
 */
import type { TicketCategory, TicketPriority, TicketStatus } from "@/generated/prisma/enums";
import { siteConfig } from "@/config/site";

/** Categories in the order the "Open a ticket" form shows them. */
export const TICKET_CATEGORIES = [
  "LISTING_PROBLEM",
  "SCAM_REPORT",
  "ACCOUNT_VERIFICATION",
  "TECHNICAL",
  "PAYMENT",
  "OTHER",
] as const satisfies readonly TicketCategory[];

/** The life of a ticket, in order: Open → In progress → Waiting for you → Resolved → Closed. */
export const TICKET_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_USER",
  "RESOLVED",
  "CLOSED",
] as const satisfies readonly TicketStatus[];

/** Statuses that still need someone to act. */
export const ACTIVE_TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_FOR_USER"] as const satisfies readonly TicketStatus[];

/** A status change to one of these emails the user (ticket_status template). */
export const STATUS_EMAIL_STATUSES = ["WAITING_FOR_USER", "RESOLVED"] as const satisfies readonly TicketStatus[];

export const TICKET_LIMITS = {
  subjectMin: 4,
  subjectMax: 120,
  messageMin: 10,
  messageMax: 5000,
  replyMin: 2,
  nameMin: 2,
  nameMax: 80,
  ratingCommentMax: 1000,
  /** Screenshots per message. */
  maxAttachments: 5,
  /** Per screenshot — the same limit as POST /api/uploads/private. */
  maxAttachmentBytes: siteConfig.listings.maxPhotoBytes,
} as const;

/** Rate limits (per user for signed-in actions, per IP for the public contact form). */
export const TICKET_RATE_LIMITS = {
  create: { limit: 5, windowSeconds: 3600 },
  contact: { limit: 3, windowSeconds: 3600 },
  reply: { limit: 20, windowSeconds: 3600 },
  rate: { limit: 10, windowSeconds: 3600 },
  close: { limit: 10, windowSeconds: 3600 },
  listingLookup: { limit: 30, windowSeconds: 300 },
} as const;

export function isTicketCategory(value: unknown): value is TicketCategory {
  return typeof value === "string" && (TICKET_CATEGORIES as readonly string[]).includes(value);
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value);
}

/** Scam reports jump the queue. */
export function priorityForCategory(category: TicketCategory): TicketPriority {
  return category === "SCAM_REPORT" ? "URGENT" : "NORMAL";
}

/** A reply from the user puts a waiting or resolved ticket back in the team's queue. */
export function statusAfterUserReply(status: TicketStatus): TicketStatus {
  return status === "WAITING_FOR_USER" || status === "RESOLVED" ? "OPEN" : status;
}

/** Default status after a public staff reply when the agent does not pick one. */
export function statusAfterStaffReply(status: TicketStatus): TicketStatus {
  return status === "OPEN" ? "IN_PROGRESS" : status;
}

export function canUserReply(status: TicketStatus): boolean {
  return status !== "CLOSED";
}

export function canUserClose(status: TicketStatus): boolean {
  return status !== "CLOSED";
}

/** "Was this helpful?" is asked once, while the ticket is resolved. */
export function canUserRate(ticket: { status: TicketStatus; rating: number | null }): boolean {
  return ticket.status === "RESOLVED" && ticket.rating == null;
}

export function isActiveStatus(status: TicketStatus): boolean {
  return (ACTIVE_TICKET_STATUSES as readonly string[]).includes(status);
}

/** Position of a status on the progress line (0 = Open … 4 = Closed). */
export function statusStepIndex(status: TicketStatus): number {
  return TICKET_STATUSES.indexOf(status);
}

/** The user's page for a ticket (without the locale prefix). */
export function ticketPath(number: number | string): string {
  return `/account/tickets/${number}`;
}

/** Ticket numbers in URLs: a positive whole number that fits a Postgres integer. */
export function parseTicketNumber(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,10}$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= 2_147_483_647 ? n : null;
}
