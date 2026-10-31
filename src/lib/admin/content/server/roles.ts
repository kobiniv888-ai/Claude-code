import "server-only";
import type { UserRole, UserStatus } from "@/generated/prisma/enums";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { isPlaceholderEmail } from "@/lib/auth/phone";
import { db } from "@/lib/db";

/** Staff list and user search for /admin/roles. */

export type StaffMember = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  twoFactorEnabled: boolean;
  lastSeenAt: Date | null;
  isDemo: boolean;
};

export type RoleCandidate = StaffMember;

const SELECT = {
  id: true,
  name: true,
  email: true,
  phoneNumber: true,
  role: true,
  status: true,
  twoFactorEnabled: true,
  lastSeenAt: true,
  isDemo: true,
} as const;

type Row = { id: string; name: string; email: string; phoneNumber: string | null; role: UserRole; status: UserStatus; twoFactorEnabled: boolean; lastSeenAt: Date | null; isDemo: boolean };

function toMember(row: Row): StaffMember {
  return {
    id: row.id,
    name: row.name,
    email: isPlaceholderEmail(row.email) ? null : row.email,
    phone: row.phoneNumber,
    role: row.role,
    status: row.status,
    twoFactorEnabled: row.twoFactorEnabled,
    lastSeenAt: row.lastSeenAt,
    isDemo: row.isDemo,
  };
}

const ROLE_ORDER: Record<string, number> = { ADMIN: 0, MODERATOR: 1, SUPPORT: 2, EDITOR: 3 };

export async function listStaff(): Promise<StaffMember[]> {
  const rows = await db.user.findMany({
    where: { role: { in: [...STAFF_ROLES] }, deletedAt: null },
    select: SELECT,
    orderBy: { name: "asc" },
    take: 200,
  });
  return rows.map(toMember).sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
}

/** By phone (digits, any format), email or name. */
export async function searchUsersForRole(query: string): Promise<RoleCandidate[]> {
  const q = query.trim();
  const digits = q.replace(/[^\d]/g, "");
  const rows = await db.user.findMany({
    where: {
      deletedAt: null,
      OR: [
        ...(digits.length >= 5 ? [{ phoneNumber: { contains: digits } }] : []),
        { email: { contains: q, mode: "insensitive" as const } },
        { name: { contains: q, mode: "insensitive" as const } },
      ],
    },
    select: SELECT,
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  return rows.map(toMember);
}
