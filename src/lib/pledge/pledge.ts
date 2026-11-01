/**
 * The Bayit welcome pledge (client-safe, pure).
 *
 * Every host accepts it before publishing: "I commit to welcoming Israeli and Jewish guests and
 * clients, and to never refusing anyone because of religion or country of origin."
 *
 * - The wording is versioned: siteConfig.pledge.currentVersion, texts in
 *   messages/<locale>/pledge.json → versions.v<N>.statement.
 * - User.welcomePledgeVersion / welcomePledgeAcceptedAt: the version the host accepted, and when.
 * - Listing.welcomePledgeVersion / welcomePledgeAt: a snapshot taken when the listing is submitted.
 * - The green "welcomes Israelis" badge shows while the owner's version is at least the admin
 *   setting pledgeRequiredVersion; publishing needs the current version.
 */
import { siteConfig } from "@/config/site";

/** The wording hosts accept today. */
export const PLEDGE_CURRENT_VERSION: number = siteConfig.pledge.currentVersion;

export type PledgeHolder = { welcomePledgeVersion: number | null };
export type PledgeSettings = { pledgeRequiredVersion: number };

/** The version a host needs for the badge (never above the current one). */
export function requiredPledgeVersion(settings: PledgeSettings, currentVersion: number = PLEDGE_CURRENT_VERSION): number {
  const required = Number.isInteger(settings.pledgeRequiredVersion) ? settings.pledgeRequiredVersion : currentVersion;
  return Math.min(Math.max(required, 1), currentVersion);
}

/** True when the owner's accepted pledge is still valid for the green badge. */
export function hasWelcomePledge(
  owner: PledgeHolder | null | undefined,
  settings: PledgeSettings,
  currentVersion: number = PLEDGE_CURRENT_VERSION,
): boolean {
  const version = owner?.welcomePledgeVersion;
  return typeof version === "number" && version >= requiredPledgeVersion(settings, currentVersion);
}

export type PledgeStatus = {
  /** The host accepted some version of the pledge. */
  accepted: boolean;
  /** The version they accepted (null = never). */
  version: number | null;
  /** ISO date-time of the acceptance. */
  acceptedAt: string | null;
  currentVersion: number;
  /** They accepted the current wording: they may publish. */
  isCurrent: boolean;
  /** They accepted an older wording and are asked to accept the new one. */
  mustReaccept: boolean;
  /** Their listings show the green "welcomes Israelis" badge. */
  badgeValid: boolean;
};

export function pledgeStatus(
  row: { welcomePledgeVersion: number | null; welcomePledgeAcceptedAt: Date | string | null } | null | undefined,
  settings: PledgeSettings,
  currentVersion: number = PLEDGE_CURRENT_VERSION,
): PledgeStatus {
  const version = typeof row?.welcomePledgeVersion === "number" ? row.welcomePledgeVersion : null;
  const at = row?.welcomePledgeAcceptedAt ?? null;
  const accepted = version !== null;
  const isCurrent = accepted && version >= currentVersion;
  return {
    accepted,
    version,
    acceptedAt: at === null ? null : typeof at === "string" ? at : at.toISOString(),
    currentVersion,
    isCurrent,
    mustReaccept: accepted && !isCurrent,
    badgeValid: hasWelcomePledge({ welcomePledgeVersion: version }, settings, currentVersion),
  };
}

/** The pledge.json key of a version's texts: t(`${pledgeVersionKey(1)}.statement`). */
export function pledgeVersionKey(version: number): `versions.v${number}` {
  return `versions.v${version}`;
}
