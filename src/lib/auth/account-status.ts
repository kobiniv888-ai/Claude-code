import type { UserStatus } from "@/generated/prisma/enums";

/**
 * Whether an account may sign in / use its session. Pure, safe on server and client.
 *
 * BANNED and DELETED accounts are always blocked. A SUSPENDED account is blocked until
 * `suspendedUntil` (or forever when no end date is set). WARNED accounts can still sign in.
 */
export type AccountBlock = "banned" | "deleted" | "suspended";

export function accountBlock(
  user: { status: UserStatus | string; suspendedUntil?: Date | string | null },
  now: Date = new Date(),
): AccountBlock | null {
  switch (user.status) {
    case "BANNED":
      return "banned";
    case "DELETED":
      return "deleted";
    case "SUSPENDED": {
      if (!user.suspendedUntil) return "suspended";
      const until = new Date(user.suspendedUntil);
      return Number.isNaN(until.getTime()) || until > now ? "suspended" : null;
    }
    default:
      return null;
  }
}

export function isAccountBlocked(
  user: { status: UserStatus | string; suspendedUntil?: Date | string | null },
  now: Date = new Date(),
): boolean {
  return accountBlock(user, now) !== null;
}
