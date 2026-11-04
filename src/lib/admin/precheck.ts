import type { RiskReasonCode } from "@/lib/risk";

/**
 * The "בדיקה לפני פרסום" slot on the listing review page (round 3, brief 9 "show the listing with
 * its mistake-check results"). Pure and client-safe. Until the phase-4 mistake check exists
 * (src/lib/listing/preflight.ts, planned), it lists the automatic checks that ran on the listing
 * (src/lib/risk) one by one: passed, found something, blocked, or not run yet. Phase 4 adds its
 * own items to the same list.
 */

export const PRECHECK_IDS = [
  "phone_verified",
  "first_listing",
  "duplicate_photos",
  "price",
  "phrases",
  "contact_info",
  "velocity",
  "shared_device",
  "voip",
] as const;
export type PrecheckId = (typeof PRECHECK_IDS)[number];

/** Which risk reasons each check can produce. */
const CODES: Record<PrecheckId, readonly RiskReasonCode[]> = {
  phone_verified: ["phone_not_verified"],
  first_listing: ["first_listing"],
  duplicate_photos: ["duplicate_photos_other_account", "duplicate_photos_same_account"],
  price: ["price_far_below_area"],
  phrases: ["scam_phrase", "blocked_phrase"],
  contact_info: ["contact_info_in_text"],
  velocity: ["new_account_velocity"],
  shared_device: ["shared_device"],
  voip: ["voip_phone"],
};

/** Reasons that stop publishing outright. */
const BLOCKING: ReadonlySet<RiskReasonCode> = new Set(["phone_not_verified", "blocked_phrase"]);

/**
 * - ok: the check ran and found nothing;
 * - found: it found something (adds points);
 * - blocked: it stops publishing;
 * - info: not a problem, only why the listing waits (the account's first listing);
 * - unchecked: the checks have not run on this listing yet.
 */
export type PrecheckStatus = "ok" | "found" | "blocked" | "info" | "unchecked";

export type PrecheckItem = {
  id: PrecheckId;
  status: PrecheckStatus;
  points: number;
  /** The reason codes found (for their labels) and their details. */
  findings: { code: RiskReasonCode; points: number; detail?: string }[];
};

export function precheckItems(reasons: readonly { code: RiskReasonCode; points: number; detail?: string }[], checked: boolean): PrecheckItem[] {
  return PRECHECK_IDS.map((id) => {
    const findings = reasons.filter((r) => CODES[id].includes(r.code));
    const points = findings.reduce((sum, r) => sum + r.points, 0);
    let status: PrecheckStatus;
    if (!checked) status = "unchecked";
    else if (findings.length === 0) status = "ok";
    else if (findings.some((r) => BLOCKING.has(r.code))) status = "blocked";
    else if (id === "first_listing") status = "info";
    else status = "found";
    return { id, status, points, findings };
  });
}

/** Counts for the slot's summary line. */
export function precheckSummary(items: readonly PrecheckItem[]): { found: number; blocked: number; ok: number } {
  return {
    found: items.filter((i) => i.status === "found").length,
    blocked: items.filter((i) => i.status === "blocked").length,
    ok: items.filter((i) => i.status === "ok").length,
  };
}
