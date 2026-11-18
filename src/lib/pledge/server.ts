import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { pledgeStatus, type PledgeStatus } from "./pledge";

/** Pledge columns of a user (for selects). */
export const PLEDGE_USER_SELECT = { welcomePledgeVersion: true, welcomePledgeAcceptedAt: true } as const;

/**
 * The user's welcome-pledge status (read once per request):
 * { accepted, version, acceptedAt, currentVersion, isCurrent, mustReaccept, badgeValid }.
 */
export const getPledgeStatus = cache(async (userId: string): Promise<PledgeStatus> => {
  const [row, settings] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: PLEDGE_USER_SELECT }),
    getSettings(),
  ]);
  return pledgeStatus(row, settings);
});

/** True when the user may publish (accepted the current wording). */
export async function hasCurrentPledge(userId: string): Promise<boolean> {
  return (await getPledgeStatus(userId)).isCurrent;
}

/**
 * The status to show in a "please accept the pledge" prompt on the account pages, or null when
 * there is nothing to ask: the current version is accepted, or the user has no listings yet
 * (the wizard asks them when they post).
 */
export async function getHostPledgePrompt(userId: string): Promise<PledgeStatus | null> {
  const status = await getPledgeStatus(userId);
  if (status.isCurrent) return null;
  if (status.mustReaccept) return status;
  const listings = await db.listing.count({ where: { ownerId: userId, deletedAt: null } });
  return listings > 0 ? status : null;
}
