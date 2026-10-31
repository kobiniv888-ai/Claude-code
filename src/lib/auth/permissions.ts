import type { UserRole } from "@/generated/prisma/enums";

/**
 * Staff roles and what each one may do in the admin panel.
 * The table mirrors docs/CONVENTIONS.md → "Roles and permissions". Pure, safe on server and client.
 */

export const STAFF_ROLES = ["ADMIN", "MODERATOR", "SUPPORT", "EDITOR"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERMISSIONS = [
  "moderation",
  "reports",
  "reports.view",
  "users.view",
  "users.manage",
  "verifications",
  "tickets",
  "content",
  "settings",
  "roles",
  "audit",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** ADMIN is not listed: it has every permission. */
const ROLE_PERMISSIONS: Record<Exclude<StaffRole, "ADMIN">, readonly Permission[]> = {
  MODERATOR: ["moderation", "reports", "reports.view", "users.view", "users.manage", "verifications"],
  SUPPORT: ["reports.view", "users.view", "tickets"],
  EDITOR: ["content"],
};

export function isStaffRole(role: UserRole | string | null | undefined): role is StaffRole {
  return typeof role === "string" && (STAFF_ROLES as readonly string[]).includes(role);
}

export function can(role: UserRole | string | null | undefined, permission: Permission): boolean {
  if (!isStaffRole(role)) return false;
  if (role === "ADMIN") return true;
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Every permission a role has, e.g. to build the admin navigation. */
export function permissionsFor(role: UserRole | string | null | undefined): Permission[] {
  return PERMISSIONS.filter((permission) => can(role, permission));
}
