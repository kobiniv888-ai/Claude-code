import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { nextDay } from "../params";
import { parseUserSearch } from "../search";

/** Audit log reading for /admin/audit and the "recent activity" lists (server-only). */

export const AUDIT_PAGE_SIZE = 50;

export type AuditFilters = {
  actor?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: Date | null;
  to?: Date | null;
};

const auditSelect = {
  id: true,
  action: true,
  targetType: true,
  targetId: true,
  details: true,
  createdAt: true,
  actor: { select: { id: true, name: true, role: true } },
} satisfies Prisma.AuditLogSelect;

export type AuditRow = Prisma.AuditLogGetPayload<{ select: typeof auditSelect }>;

async function actorIds(query: string): Promise<string[] | null> {
  const q = query.trim();
  if (!q) return null;
  const terms = parseUserSearch(q);
  const or: Prisma.UserWhereInput[] = [{ id: q }];
  if (terms.text) or.push({ name: { contains: terms.text, mode: "insensitive" } });
  if (terms.email) or.push({ email: { equals: terms.email, mode: "insensitive" } });
  if (terms.phones.length) or.push({ phoneNumber: { in: terms.phones } });
  const users = await db.user.findMany({ where: { OR: or }, select: { id: true }, take: 50 });
  return users.map((u) => u.id);
}

export async function listAuditEntries(filters: AuditFilters, page: number) {
  const where: Prisma.AuditLogWhereInput = {};
  const ids = filters.actor ? await actorIds(filters.actor) : null;
  if (ids) where.actorId = { in: ids };
  if (filters.action) where.action = { startsWith: filters.action.trim().slice(0, 120) };
  if (filters.targetType) where.targetType = filters.targetType;
  if (filters.targetId) where.targetId = filters.targetId.trim().slice(0, 64);
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lt: nextDay(filters.to) } : {}),
    };
  }
  const total = await db.auditLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (current - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE,
    select: auditSelect,
  });
  return { rows, total, page: current };
}

export async function recentAuditEntries(take = 8, where: Prisma.AuditLogWhereInput = {}) {
  return db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take, select: auditSelect });
}

/** Target types that appear in the log (for the filter). */
export async function auditTargetTypes(): Promise<string[]> {
  const rows = await db.auditLog.findMany({
    where: { targetType: { not: null } },
    distinct: ["targetType"],
    select: { targetType: true },
    take: 50,
  });
  return rows.map((r) => r.targetType).filter((t): t is string => !!t).sort();
}
