import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Locale, TicketCategory, TicketPriority, TicketStatus } from "@/generated/prisma/enums";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { audit } from "@/lib/audit";
import { can, isStaffRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { isEmailAddress, isPlaceholderEmail, notificationEmailFor, sendEmail } from "@/lib/email";
import { AppError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  isAttachmentKeyOwnedBy,
  parseAttachments,
  type TicketAttachment,
} from "./attachments";
import {
  STATUS_EMAIL_STATUSES,
  TICKET_LIMITS,
  canUserClose,
  canUserReply,
  priorityForCategory,
  statusAfterStaffReply,
  statusAfterUserReply,
  ticketPath,
} from "./constants";
import { parseListingRef } from "./listing-ref";

/**
 * Support tickets — server helpers shared by the user's pages (/account/tickets, /help/new-ticket,
 * /contact) and the admin support screens.
 *
 * User functions take the signed-in user's id and check ownership themselves.
 * Staff functions (addStaffReply, changeTicketStatus, assignTicket) take an ALREADY AUTHORIZED
 * staff id — call `requireStaffForAction("tickets")` first — and write to the audit log.
 * Errors are AppErrors with codes the forms translate ("tickets.errors.<code>").
 */

// ─── Types ────────────────────────────────────────────────────

export type TicketMessageView = {
  id: string;
  body: string;
  fromStaff: boolean;
  /** Internal staff note (only ever returned by staff functions). */
  internal: boolean;
  createdAt: Date;
  /** Display name: the user's name, or the staff member's first name for users. */
  authorName: string | null;
  attachments: TicketAttachment[];
};

export type TicketListingRef = {
  id: string;
  publicId: number;
  /** In the viewer's language when a translation exists, else the owner's original. */
  title: string;
  status: string;
};

export type TicketListItem = {
  id: string;
  number: number;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: Date;
  lastMessageAt: Date;
  /** The newest visible message is from the team (the user has something to read). */
  lastFromStaff: boolean;
  lastMessagePreview: string;
  messageCount: number;
};

export type TicketDetail = {
  id: string;
  number: number;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  locale: Locale;
  rating: number | null;
  ratingComment: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
  closedAt: Date | null;
  listing: TicketListingRef | null;
  messages: TicketMessageView[];
};

export type StaffTicketDetail = TicketDetail & {
  userId: string | null;
  user: {
    id: string;
    name: string;
    /** Null for phone-only accounts. */
    email: string | null;
    phoneNumber: string | null;
    locale: Locale;
  } | null;
  guestName: string | null;
  guestEmail: string | null;
  assignedTo: { id: string; name: string } | null;
};

// ─── Small helpers ────────────────────────────────────────────

function firstName(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? first.slice(0, 40) : null;
}

function preview(body: string, length = 140): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

function cleanBody(body: string, min = 1): string {
  const text = (body ?? "").replace(/\r\n?/g, "\n").trim();
  if (text.length < min) throw new ValidationError({ message: ["message_short"] });
  if (text.length > TICKET_LIMITS.messageMax) throw new ValidationError({ message: ["message_long"] });
  return text;
}

function toJsonAttachments(list: TicketAttachment[]): Prisma.InputJsonValue | undefined {
  return list.length ? (list.map((a) => ({ ...a })) as Prisma.InputJsonValue) : undefined;
}

/** Every key must be a valid upload of `ownerId` (the upload endpoint puts the id in the path). */
function assertOwnedAttachments(list: TicketAttachment[], ownerId: string): TicketAttachment[] {
  if (list.length > TICKET_LIMITS.maxAttachments) {
    throw new ValidationError({ attachments: ["too_many_attachments"] });
  }
  for (const item of list) {
    if (!isAttachmentKeyOwnedBy(item.key, ownerId)) throw new AppError("attachment_invalid", undefined, { status: 400 });
  }
  return list;
}

const listingSelect = (locale: string) =>
  ({
    id: true,
    publicId: true,
    title: true,
    status: true,
    translations: {
      where: { locale: isAppLocale(locale) ? locale : siteConfig.i18n.fallbackLocale },
      select: { title: true },
      take: 1,
    },
  }) satisfies Prisma.ListingSelect;

function toListingRef(
  listing: { id: string; publicId: number; title: string; status: string; translations?: { title: string }[] } | null,
): TicketListingRef | null {
  if (!listing) return null;
  const translated = listing.translations?.[0]?.title?.trim();
  return { id: listing.id, publicId: listing.publicId, title: translated || listing.title, status: listing.status };
}

const messageSelect = {
  id: true,
  body: true,
  fromStaff: true,
  internal: true,
  createdAt: true,
  attachments: true,
  author: { select: { name: true } },
} satisfies Prisma.TicketMessageSelect;

type MessageRow = Prisma.TicketMessageGetPayload<{ select: typeof messageSelect }>;

function toMessageView(row: MessageRow, perspective: "user" | "staff"): TicketMessageView {
  return {
    id: row.id,
    body: row.body,
    fromStaff: row.fromStaff,
    internal: row.internal,
    createdAt: row.createdAt,
    // Users see only a staff member's first name; staff see full names.
    authorName: row.fromStaff && perspective === "user" ? firstName(row.author?.name) : (row.author?.name ?? null),
    attachments: parseAttachments(row.attachments),
  };
}

// ─── Listings linked to tickets ───────────────────────────────

export type ListingLookup = {
  id: string;
  publicId: number;
  /** Shown only for live listings and the user's own listings. */
  title: string | null;
};

/**
 * Resolves "1234" or a pasted listing address to a listing. Returns null when nothing matches.
 * The title is only revealed when the listing is public or belongs to `viewerId`.
 */
export async function findListingForTicket(
  ref: string,
  viewerId: string | null,
  locale: string,
): Promise<ListingLookup | null> {
  const publicId = parseListingRef(ref);
  if (publicId == null) return null;
  const listing = await db.listing.findUnique({
    where: { publicId },
    select: { ...listingSelect(locale), ownerId: true },
  });
  if (!listing) return null;
  const visible = listing.status === "LIVE" || (viewerId !== null && listing.ownerId === viewerId);
  return { id: listing.id, publicId: listing.publicId, title: visible ? toListingRef(listing)!.title : null };
}

// ─── User: read ───────────────────────────────────────────────

export async function listTicketsForUser(
  userId: string,
  { page = 1, pageSize = 20 }: { page?: number; pageSize?: number } = {},
): Promise<{ items: TicketListItem[]; total: number; page: number; pageCount: number }> {
  const size = Math.min(Math.max(1, Math.trunc(pageSize)), 100);
  const where = { userId } satisfies Prisma.TicketWhereInput;
  const total = await db.ticket.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);

  const rows = await db.ticket.findMany({
    where,
    orderBy: [{ lastMessageAt: "desc" }, { number: "desc" }],
    skip: (current - 1) * size,
    take: size,
    select: {
      id: true,
      number: true,
      subject: true,
      category: true,
      status: true,
      priority: true,
      createdAt: true,
      lastMessageAt: true,
      messages: {
        where: { internal: false },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { fromStaff: true, body: true },
      },
      _count: { select: { messages: { where: { internal: false } } } },
    },
  });

  return {
    items: rows.map((row) => ({
      id: row.id,
      number: row.number,
      subject: row.subject,
      category: row.category,
      status: row.status,
      priority: row.priority,
      createdAt: row.createdAt,
      lastMessageAt: row.lastMessageAt,
      lastFromStaff: row.messages[0]?.fromStaff ?? false,
      lastMessagePreview: preview(row.messages[0]?.body ?? ""),
      messageCount: row._count.messages,
    })),
    total,
    page: current,
    pageCount,
  };
}

/** One of the user's tickets with its public conversation (never internal notes), or null. */
export async function getTicketForUser(
  number: number,
  userId: string,
  locale: string = siteConfig.i18n.fallbackLocale,
): Promise<TicketDetail | null> {
  const ticket = await db.ticket.findFirst({
    where: { number, userId },
    select: {
      id: true,
      number: true,
      subject: true,
      category: true,
      status: true,
      priority: true,
      locale: true,
      rating: true,
      ratingComment: true,
      createdAt: true,
      updatedAt: true,
      lastMessageAt: true,
      closedAt: true,
      listing: { select: listingSelect(locale) },
      messages: { where: { internal: false }, orderBy: { createdAt: "asc" }, select: messageSelect },
    },
  });
  if (!ticket) return null;
  return {
    ...ticket,
    listing: toListingRef(ticket.listing),
    messages: ticket.messages.map((m) => toMessageView(m, "user")),
  };
}

/** For the admin support screens: the whole ticket, internal notes included. */
export async function getTicketForStaff(
  idOrNumber: string | number,
  locale: string = siteConfig.i18n.fallbackLocale,
): Promise<StaffTicketDetail | null> {
  const where: Prisma.TicketWhereInput =
    typeof idOrNumber === "number" ? { number: idOrNumber } : { id: idOrNumber };
  const ticket = await db.ticket.findFirst({
    where,
    select: {
      id: true,
      number: true,
      userId: true,
      guestName: true,
      guestEmail: true,
      subject: true,
      category: true,
      status: true,
      priority: true,
      locale: true,
      rating: true,
      ratingComment: true,
      createdAt: true,
      updatedAt: true,
      lastMessageAt: true,
      closedAt: true,
      user: { select: { id: true, name: true, email: true, phoneNumber: true, locale: true } },
      assignedTo: { select: { id: true, name: true } },
      listing: { select: listingSelect(locale) },
      messages: { orderBy: { createdAt: "asc" }, select: messageSelect },
    },
  });
  if (!ticket) return null;
  return {
    ...ticket,
    user: ticket.user
      ? { ...ticket.user, email: isPlaceholderEmail(ticket.user.email) ? null : ticket.user.email }
      : null,
    listing: toListingRef(ticket.listing),
    messages: ticket.messages.map((m) => toMessageView(m, "staff")),
  };
}

// ─── Create ───────────────────────────────────────────────────

export type CreateTicketRecordInput = {
  /** Signed-in author; null for the public contact form. */
  userId: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  category: TicketCategory;
  subject: string;
  body: string;
  listingId?: string | null;
  locale: AppLocale;
  attachments?: TicketAttachment[];
};

/** Creates the ticket and its first message. Validate the input (and its attachments) first. */
export async function createTicketRecord(
  input: CreateTicketRecordInput,
): Promise<{ id: string; number: number; priority: TicketPriority }> {
  const body = cleanBody(input.body);
  const attachments = input.userId ? assertOwnedAttachments(input.attachments ?? [], input.userId) : [];
  const subject = input.subject.replace(/\s+/g, " ").trim().slice(0, TICKET_LIMITS.subjectMax);
  if (!subject) throw new ValidationError({ subject: ["subject_short"] });

  return db.ticket.create({
    data: {
      userId: input.userId,
      guestName: input.guestName?.trim().slice(0, TICKET_LIMITS.nameMax) || null,
      guestEmail: input.guestEmail?.trim().toLowerCase().slice(0, 254) || null,
      category: input.category,
      priority: priorityForCategory(input.category),
      status: "OPEN",
      subject,
      listingId: input.listingId ?? null,
      locale: input.locale,
      lastMessageAt: new Date(),
      messages: {
        create: {
          authorId: input.userId,
          fromStaff: false,
          internal: false,
          body,
          attachments: toJsonAttachments(attachments),
        },
      },
    },
    select: { id: true, number: true, priority: true },
  });
}

// ─── User: write ──────────────────────────────────────────────

/**
 * The user answers on their ticket. A ticket that was waiting for them or resolved goes back
 * to OPEN. Closed tickets cannot be answered (code "ticket_closed").
 */
export async function addUserMessage({
  number,
  userId,
  body,
  attachments = [],
}: {
  number: number;
  userId: string;
  body: string;
  attachments?: TicketAttachment[];
}): Promise<{ messageId: string; status: TicketStatus }> {
  const text = cleanBody(body);
  const files = assertOwnedAttachments(attachments, userId);

  return db.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirst({ where: { number, userId }, select: { id: true, status: true } });
    if (!ticket) throw new NotFoundError();
    if (!canUserReply(ticket.status)) throw new AppError("ticket_closed", undefined, { status: 409 });

    const now = new Date();
    const status = statusAfterUserReply(ticket.status);
    const message = await tx.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: userId,
        fromStaff: false,
        internal: false,
        body: text,
        attachments: toJsonAttachments(files),
        createdAt: now,
      },
      select: { id: true },
    });
    await tx.ticket.update({ where: { id: ticket.id }, data: { status, lastMessageAt: now } });
    return { messageId: message.id, status };
  });
}

/** "Was this helpful?" — once, while the ticket is RESOLVED. Rating closes the ticket. */
export async function rateTicketForUser({
  number,
  userId,
  rating,
  comment,
}: {
  number: number;
  userId: string;
  rating: number;
  comment?: string | null;
}): Promise<void> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ValidationError({ rating: ["rating_required"] });
  const text = comment?.trim().slice(0, TICKET_LIMITS.ratingCommentMax) || null;
  const now = new Date();
  const { count } = await db.ticket.updateMany({
    where: { number, userId, status: "RESOLVED", rating: null },
    data: { rating, ratingComment: text, status: "CLOSED", closedAt: now },
  });
  if (count === 1) return;

  const ticket = await db.ticket.findFirst({ where: { number, userId }, select: { status: true, rating: true } });
  if (!ticket) throw new NotFoundError();
  if (ticket.rating != null) throw new AppError("already_rated", undefined, { status: 409 });
  throw new AppError("not_rateable", undefined, { status: 409 });
}

/** The user closes their own ticket ("my problem is solved"). */
export async function closeTicketForUser({ number, userId }: { number: number; userId: string }): Promise<void> {
  const ticket = await db.ticket.findFirst({ where: { number, userId }, select: { id: true, status: true } });
  if (!ticket) throw new NotFoundError();
  if (!canUserClose(ticket.status)) return; // already closed — nothing to do
  await db.ticket.update({ where: { id: ticket.id }, data: { status: "CLOSED", closedAt: new Date() } });
}

// ─── Email ────────────────────────────────────────────────────

const recipientSelect = {
  id: true,
  number: true,
  subject: true,
  locale: true,
  userId: true,
  guestName: true,
  guestEmail: true,
  user: { select: { name: true, email: true, locale: true, notificationPrefs: true, status: true } },
} satisfies Prisma.TicketSelect;

type RecipientTicket = Prisma.TicketGetPayload<{ select: typeof recipientSelect }>;

function ticketEmailsWanted(prefs: unknown): boolean {
  if (!prefs || typeof prefs !== "object") return true;
  const email = (prefs as { email?: unknown }).email;
  if (!email || typeof email !== "object") return true;
  return (email as { tickets?: unknown }).tickets !== false;
}

/** Who gets emails about a ticket, in which language, with which link (null for guests). */
function ticketRecipient(ticket: RecipientTicket): {
  to: string;
  locale: AppLocale;
  name: string | null;
  ticketUrl: string | null;
} | null {
  const guestEmail = ticket.guestEmail && isEmailAddress(ticket.guestEmail) ? ticket.guestEmail : null;
  // The language the ticket was written in (set from the page), else the account's language.
  const userLocale = ticket.user?.locale;
  const locale: AppLocale = isAppLocale(ticket.locale)
    ? ticket.locale
    : isAppLocale(userLocale)
      ? userLocale
      : siteConfig.i18n.fallbackLocale;

  if (ticket.user) {
    if (ticket.user.status === "DELETED" || ticket.user.status === "BANNED") return null;
    if (!ticketEmailsWanted(ticket.user.notificationPrefs)) return null;
    // An address typed into the contact form wins: the user asked to be answered there.
    const to = guestEmail ?? notificationEmailFor(ticket.user);
    if (!to) return null;
    return { to, locale, name: ticket.user.name || ticket.guestName, ticketUrl: ticketPath(ticket.number) };
  }
  if (!guestEmail) return null;
  return { to: guestEmail, locale, name: ticket.guestName, ticketUrl: null };
}

async function loadRecipientTicket(ticketId: string): Promise<RecipientTicket | null> {
  return db.ticket.findUnique({ where: { id: ticketId }, select: recipientSelect });
}

/** Confirmation email after a ticket is opened (skipped for phone-only accounts). */
export async function sendTicketCreatedEmail(ticketId: string): Promise<void> {
  const ticket = await loadRecipientTicket(ticketId);
  const recipient = ticket ? ticketRecipient(ticket) : null;
  if (!ticket || !recipient) return;
  await sendEmail({
    to: recipient.to,
    locale: recipient.locale,
    template: "ticket_created",
    data: { name: recipient.name, ticketNumber: ticket.number, subject: ticket.subject, ticketUrl: recipient.ticketUrl },
  });
}

async function sendTicketReplyEmail(ticket: RecipientTicket, replyText: string): Promise<void> {
  const recipient = ticketRecipient(ticket);
  if (!recipient) return;
  await sendEmail({
    to: recipient.to,
    locale: recipient.locale,
    template: "ticket_reply",
    data: {
      name: recipient.name,
      ticketNumber: ticket.number,
      subject: ticket.subject,
      replyText,
      ticketUrl: recipient.ticketUrl,
    },
  });
}

async function sendTicketStatusEmail(ticket: RecipientTicket, status: TicketStatus): Promise<void> {
  const recipient = ticketRecipient(ticket);
  if (!recipient) return;
  await sendEmail({
    to: recipient.to,
    locale: recipient.locale,
    template: "ticket_status",
    data: { name: recipient.name, ticketNumber: ticket.number, subject: ticket.subject, status, ticketUrl: recipient.ticketUrl },
  });
}

// ─── Staff ────────────────────────────────────────────────────

function closedAtFor(status: TicketStatus, now: Date): Date | null {
  return status === "CLOSED" ? now : null;
}

/**
 * A staff reply or internal note. Public replies email the user (in the ticket's language, with
 * a link to the ticket; guests get the reply by email). Without `newStatus`, a public reply moves
 * an OPEN ticket to IN_PROGRESS and leaves other statuses as they are; notes never change it.
 * Attachments must be the staff member's own uploads.
 */
export async function addStaffReply(
  ticketId: string,
  staffId: string,
  body: string,
  {
    internal = false,
    newStatus,
    attachments = [],
  }: { internal?: boolean; newStatus?: TicketStatus; attachments?: TicketAttachment[] } = {},
): Promise<{ messageId: string; status: TicketStatus }> {
  const text = cleanBody(body);
  const files = assertOwnedAttachments(attachments, staffId);

  const result = await db.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, select: { id: true, status: true } });
    if (!ticket) throw new NotFoundError();
    const now = new Date();
    const status = newStatus ?? (internal ? ticket.status : statusAfterStaffReply(ticket.status));
    const message = await tx.ticketMessage.create({
      data: {
        ticketId,
        authorId: staffId,
        fromStaff: true,
        internal,
        body: text,
        attachments: toJsonAttachments(files),
        createdAt: now,
      },
      select: { id: true },
    });
    if (!internal || status !== ticket.status) {
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status,
          ...(internal ? {} : { lastMessageAt: now }),
          ...(status !== ticket.status ? { closedAt: closedAtFor(status, now) } : {}),
        },
      });
    }
    return { messageId: message.id, status, previousStatus: ticket.status };
  });

  await audit({
    actorId: staffId,
    action: internal ? "ticket.note" : "ticket.reply",
    targetType: "Ticket",
    targetId: ticketId,
    details: {
      messageId: result.messageId,
      attachments: files.length,
      ...(result.status !== result.previousStatus ? { status: { from: result.previousStatus, to: result.status } } : {}),
    },
  });

  if (!internal) {
    const ticket = await loadRecipientTicket(ticketId);
    if (ticket) await sendTicketReplyEmail(ticket, text);
  }

  return { messageId: result.messageId, status: result.status };
}

/** Changes the status; WAITING_FOR_USER and RESOLVED email the user. */
export async function changeTicketStatus(
  ticketId: string,
  staffId: string,
  status: TicketStatus,
): Promise<{ status: TicketStatus; changed: boolean }> {
  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: { status: true } });
  if (!ticket) throw new NotFoundError();
  if (ticket.status === status) return { status, changed: false };

  const now = new Date();
  await db.ticket.update({ where: { id: ticketId }, data: { status, closedAt: closedAtFor(status, now) } });
  await audit({
    actorId: staffId,
    action: "ticket.status",
    targetType: "Ticket",
    targetId: ticketId,
    details: { from: ticket.status, to: status },
  });

  if ((STATUS_EMAIL_STATUSES as readonly string[]).includes(status)) {
    const full = await loadRecipientTicket(ticketId);
    if (full) await sendTicketStatusEmail(full, status);
  }
  return { status, changed: true };
}

/** Assigns the ticket to a staff member who handles tickets, or unassigns it (null). */
export async function assignTicket(
  ticketId: string,
  staffId: string,
  assigneeId: string | null,
): Promise<{ assignedToId: string | null; changed: boolean }> {
  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: { assignedToId: true } });
  if (!ticket) throw new NotFoundError();

  if (assigneeId) {
    const assignee = await db.user.findUnique({ where: { id: assigneeId }, select: { role: true, status: true } });
    if (!assignee || !isStaffRole(assignee.role) || !can(assignee.role, "tickets") || assignee.status !== "ACTIVE") {
      throw new AppError("invalid_assignee", undefined, { status: 400 });
    }
  }
  if (ticket.assignedToId === assigneeId) return { assignedToId: assigneeId, changed: false };

  await db.ticket.update({ where: { id: ticketId }, data: { assignedToId: assigneeId } });
  await audit({
    actorId: staffId,
    action: "ticket.assign",
    targetType: "Ticket",
    targetId: ticketId,
    details: { from: ticket.assignedToId, to: assigneeId },
  });
  return { assignedToId: assigneeId, changed: true };
}

// ─── Attachment access ────────────────────────────────────────

/**
 * May `viewer` download the attachment `key`? The ticket's owner may (except files on internal
 * notes); staff with the "tickets" permission may download everything.
 */
export async function canAccessTicketAttachment(
  key: string,
  viewer: { id: string; role: string },
): Promise<TicketAttachment | null> {
  const messages = await db.ticketMessage.findMany({
    where: { attachments: { array_contains: [{ key }] } },
    select: { internal: true, attachments: true, ticket: { select: { userId: true } } },
    take: 5,
  });
  const isSupportStaff = can(viewer.role, "tickets");
  for (const message of messages) {
    const attachment = parseAttachments(message.attachments).find((a) => a.key === key);
    if (!attachment) continue;
    if (isSupportStaff) return attachment;
    if (!message.internal && message.ticket.userId === viewer.id) return attachment;
  }
  return null;
}
