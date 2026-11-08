import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { TicketCategory, TicketPriority, TicketStatus } from "@/generated/prisma/enums";
import { siteConfig } from "@/config/site";
import { isAppLocale, pickLocalized } from "@/i18n/locale";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { ACTIVE_TICKET_STATUSES, TICKET_CATEGORIES, TICKET_STATUSES } from "@/lib/tickets/constants";
import { ADMIN_PAGE_SIZE, coverPhotoSelect, realEmail } from "./shared";
import { canSeeGuestPhone, type StaffViewer } from "../staff-visibility";

/** The support queue and the ticket page (server-only). */

export { TICKET_CATEGORIES, TICKET_STATUSES };
export const TICKET_STATUS_FILTERS = ["active", ...TICKET_STATUSES, "all"] as const;
export type TicketStatusFilter = (typeof TICKET_STATUS_FILTERS)[number];
export const TICKET_ASSIGNED_FILTERS = ["me", "unassigned"] as const;
export type TicketAssignedFilter = (typeof TICKET_ASSIGNED_FILTERS)[number];
export const TICKET_PRIORITIES = ["NORMAL", "URGENT"] as const satisfies readonly TicketPriority[];

export type TicketFilters = {
  status: TicketStatusFilter;
  category?: TicketCategory;
  priority?: TicketPriority;
  assigned?: TicketAssignedFilter;
};

const URGENT_ACTIVE: Prisma.TicketWhereInput = {
  priority: "URGENT",
  status: { in: [...ACTIVE_TICKET_STATUSES] },
};

function ticketWhere(filters: TicketFilters, staffId: string): Prisma.TicketWhereInput {
  const status: Prisma.TicketWhereInput =
    filters.status === "all"
      ? {}
      : filters.status === "active"
        ? { status: { in: [...ACTIVE_TICKET_STATUSES] } }
        : { status: filters.status as TicketStatus };
  return {
    ...status,
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.assigned === "me" ? { assignedToId: staffId } : {}),
    ...(filters.assigned === "unassigned" ? { assignedToId: null } : {}),
  };
}

const rowSelect = {
  id: true,
  number: true,
  subject: true,
  category: true,
  priority: true,
  status: true,
  locale: true,
  createdAt: true,
  lastMessageAt: true,
  guestName: true,
  guestEmail: true,
  user: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  listing: { select: { publicId: true } },
  _count: { select: { messages: { where: { internal: false } } } },
  messages: {
    where: { internal: false },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { body: true, fromStaff: true },
  },
} satisfies Prisma.TicketSelect;

export type TicketQueueRow = Prisma.TicketGetPayload<{ select: typeof rowSelect }>;

/**
 * Urgent active tickets (scam reports) are pinned above the list on every page; the paginated
 * list below holds everything else that matches the filters.
 */
export async function listStaffTickets(filters: TicketFilters, staffId: string, page: number) {
  const where = ticketWhere(filters, staffId);
  const listWhere: Prisma.TicketWhereInput = { AND: [where, { NOT: URGENT_ACTIVE }] };
  const [pinned, total] = await Promise.all([
    db.ticket.findMany({
      where: { AND: [where, URGENT_ACTIVE] },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: rowSelect,
    }),
    db.ticket.count({ where: listWhere }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = await db.ticket.findMany({
    where: listWhere,
    orderBy: [{ lastMessageAt: "desc" }],
    skip: (current - 1) * ADMIN_PAGE_SIZE,
    take: ADMIN_PAGE_SIZE,
    select: rowSelect,
  });
  return { pinned, rows, total, page: current };
}

/** Saved replies with the body in `locale` (falls back to English, then any language). */
export async function savedRepliesFor(locale: string) {
  const rows = await db.savedReply.findMany({ orderBy: { title: "asc" }, take: 200, select: { id: true, title: true, body: true } });
  return rows
    .map((r) => ({ id: r.id, title: r.title, body: pickLocalized(r.body, locale) }))
    .filter((r) => r.body.trim().length > 0);
}

/** Active staff members who handle tickets (for "Assign to"). */
export async function ticketStaffMembers() {
  const rows = await db.user.findMany({
    where: { role: { in: ["ADMIN", "MODERATOR", "SUPPORT", "EDITOR"] }, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
  return rows.filter((r) => can(r.role, "tickets"));
}

/**
 * Extra context for the ticket page: the requester's account and the linked listing. The
 * requester's phone is ADMIN only (founder's decision Q12: an account's verified phone is the
 * guest phone of its bookings); support answers in the ticket thread.
 */
export async function ticketContext(ticket: { userId: string | null; listing: { id: string } | null }, locale: string, viewer: Pick<StaffViewer, "role">) {
  const [requester, listing] = await Promise.all([
    ticket.userId
      ? db.user.findUnique({
          where: { id: ticket.userId },
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            status: true,
            role: true,
            createdAt: true,
            idVerifiedAt: true,
            _count: { select: { tickets: true, listings: true, reportsAgainst: true } },
          },
        })
      : Promise.resolve(null),
    ticket.listing
      ? db.listing.findUnique({
          where: { id: ticket.listing.id },
          select: {
            id: true,
            publicId: true,
            title: true,
            status: true,
            dealType: true,
            price: true,
            currency: true,
            pricePeriod: true,
            reportCount: true,
            riskScore: true,
            photos: coverPhotoSelect,
            city: { select: { names: true } },
            owner: { select: { id: true, name: true, status: true } },
            translations: {
              where: { locale: isAppLocale(locale) ? locale : siteConfig.i18n.fallbackLocale },
              select: { title: true },
              take: 1,
            },
          },
        })
      : Promise.resolve(null),
  ]);
  const showPhone = canSeeGuestPhone(viewer);
  return {
    requester: requester ? { ...requester, email: realEmail(requester.email), phoneNumber: showPhone ? requester.phoneNumber : null, phoneWithheld: !showPhone && !!requester.phoneNumber } : null,
    listing,
  };
}
