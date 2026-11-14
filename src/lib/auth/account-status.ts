import type { UserStatus } from "@/generated/prisma/enums";
import { demoAllowed } from "../site-env";

/**
 * Whether an account may sign in / use its session. Pure, safe on server and client.
 *
 * BANNED and DELETED accounts are always blocked. A SUSPENDED account is blocked until
 * `suspendedUntil` (or forever when no end date is set). WARNED accounts can still sign in.
 */
export type AccountBlock = "banned" | "deleted" | "suspended";

/**
 * Accounts in good standing: they may book, and their listings are public. A SUSPENDED account
 * stays out until staff lift the suspension, even after `suspendedUntil` has passed.
 */
export const ACTIVE_ACCOUNT_STATUSES: readonly UserStatus[] = ["ACTIVE", "WARNED"];

export function isAccountInGoodStanding(status: UserStatus | string): boolean {
  return (ACTIVE_ACCOUNT_STATUSES as readonly string[]).includes(status);
}

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

/** Why Better Auth must not create a session for this account (null: it may). */
export type SessionCreateBlock = "demo_disabled" | AccountBlock;

/**
 * The rule of the `session.create.before` hook (src/lib/auth/server.ts): no session at all for a
 * missing, banned, deleted or suspended account, nor for a DEMO account on the real site
 * (SECURITY_REPORT 3.4.c, founder's decision 1: demo logins only where SITE_ENV is development or
 * staging; SITE_ENV missing counts as the real site). Pure, so it is unit-tested.
 */
export function sessionCreateBlock(
  user: { status: UserStatus | string; suspendedUntil?: Date | string | null; isDemo: boolean } | null,
  env: Partial<Record<string, string | undefined>> = process.env,
  now: Date = new Date(),
): SessionCreateBlock | null {
  if (!user) return "deleted";
  if (user.isDemo && !demoAllowed(env)) return "demo_disabled";
  return accountBlock(user, now);
}
