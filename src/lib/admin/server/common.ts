import "server-only";
import { getTranslations } from "next-intl/server";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { toActionError, type ActionResult } from "@/lib/action";
import type { Permission } from "@/lib/auth/permissions";
import { requireStaffForAction, type CurrentUser } from "@/lib/auth/session";
import { AppError, ForbiddenError } from "@/lib/errors";
import { assertRateLimit, type RateLimitOptions } from "@/lib/rate-limit";
import { translateForLocale } from "@/lib/translate";
import type { UserActionReason, VerificationReason } from "../reasons";
import { requireFreshStaffProof, spendStaffProof, type StaffProofMode } from "./staff-proof";

/**
 * Shared plumbing for admin server actions (server-only, not an action file itself).
 *
 *   export async function approve(input: unknown) {
 *     return runStaffAction("moderation", "listing.approve", async (staff) => { …; return ok(); });
 *   }
 *
 * Checks the staff session + permission (2-step login), rate-limits per staff member and turns
 * thrown errors into ActionResult failures. Error codes the admin UI translates itself
 * (admin.errors.<code>) are thrown as AdminActionError.
 *
 * Destructive actions pass `{ freshProof: "consume" | "window" }` (SECURITY_REPORT 3.6.c,
 * ./staff-proof.ts): after the permission check and before anything else runs, the session needs a
 * fresh AUTHENTICATOR code (an emailed code never counts), or the action answers
 * "fresh_proof_required" and the admin UI asks for the code and tries again (useAdminAction).
 * The list of such actions and their modes: FRESH_PROOF_STAFF_ACTIONS in
 * tests/unit/endpoints/registry.ts (checked by tests/unit/endpoints/endpoint-registry.test.ts).
 */

export const ADMIN_ERROR_CODES = [
  "invalid_status",
  "not_allowed_on_self",
  "not_allowed_on_staff",
  "user_not_found",
  "listing_not_found",
  "report_not_found",
  "request_not_found",
  "ticket_not_found",
  "already_decided",
  "invalid_date",
  "invalid_assignee",
  "account_blocked",
  "missing_listing",
  "role_unchanged",
  "demo_staff_refused",
  "documents_paused",
  "backup_required",
  "cleanup_running",
  "backup_failed",
  // Round 3, phase 3 (flags, bookings, reference prices, outbox).
  "booking_not_found",
  "not_flagged",
  "reference_price_not_found",
  "neighborhood_mismatch",
  "city_not_found",
  "email_not_found",
  "resend_not_configured",
  "cannot_resend",
  // Phase 3 hardening.
  "no_channel",
  "content_changed",
  "changed_since_view",
  // Q13: a destructive action whose audit row could not be written was stopped (src/lib/audit.ts).
  "audit_failed",
] as const;
export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number];

export class AdminActionError extends AppError {
  constructor(code: AdminErrorCode, status = 409) {
    super(code, code, { status });
  }
}

const DEFAULT_LIMIT: RateLimitOptions = { limit: 120, windowSeconds: 60 };

export type StaffActionOptions = {
  limit?: RateLimitOptions;
  /** A destructive action: a fresh authenticator code first (./staff-proof.ts). */
  freshProof?: StaffProofMode;
  /**
   * A narrower rule than the permission (an ADMIN-only action, e.g. canRevealReporter): checked
   * before the fresh code is asked for, so nobody is asked for a code for an action they may not do.
   */
  allow?: (staff: CurrentUser) => boolean;
};

function isRateLimitOptions(value: RateLimitOptions | StaffActionOptions): value is RateLimitOptions {
  return "windowSeconds" in value;
}

export async function runStaffAction<T>(
  permission: Permission,
  scope: string,
  fn: (staff: CurrentUser) => Promise<ActionResult<T>>,
  limitOrOptions: RateLimitOptions | StaffActionOptions = DEFAULT_LIMIT,
): Promise<ActionResult<T>> {
  const options: StaffActionOptions = isRateLimitOptions(limitOrOptions) ? { limit: limitOrOptions } : limitOrOptions;
  try {
    const staff = await requireStaffForAction(permission);
    if (options.allow && !options.allow(staff)) throw new ForbiddenError();
    await assertRateLimit(`admin:${scope}:${staff.id}`, options.limit ?? DEFAULT_LIMIT);
    if (options.freshProof) await requireFreshStaffProof(staff);
    const result = await fn(staff);
    if (result.ok && options.freshProof === "consume") await spendStaffProof(staff);
    return result;
  } catch (error) {
    return toActionError(error);
  }
}

export function localeOf(value: string | null | undefined): AppLocale {
  return isAppLocale(value) ? value : siteConfig.i18n.fallbackLocale;
}

/** "Label — explanation" for a reason, in `locale` (the recipient's language), plus the staff note. */
async function reasonWithNote(
  group: "userReasons" | "verificationReasons",
  code: string,
  locale: AppLocale,
  note: string | null | undefined,
): Promise<{ reasonText: string; note: string | null }> {
  const t = await getTranslations({ locale, namespace: "admin" });
  const reasonText = `${t(`${group}.${code}.label`)} — ${t(`${group}.${code}.explanation`)}`;
  const trimmed = note?.trim();
  if (!trimmed) return { reasonText, note: null };
  const translated = await translateForLocale(trimmed, locale);
  return { reasonText, note: translated.text };
}

export function userReasonText(code: UserActionReason, locale: AppLocale, note?: string | null) {
  return reasonWithNote("userReasons", code, locale, note);
}

export function verificationReasonText(code: VerificationReason, locale: AppLocale, note?: string | null) {
  return reasonWithNote("verificationReasons", code, locale, note);
}

/**
 * True when one of `ownerIds` is the staff member (a report about them or sent by them, their own
 * listing, their own booking). Pages hide the decision buttons with it.
 */
export function isOwnItem(staff: Pick<CurrentUser, "id" | "role">, ownerIds: readonly (string | null | undefined)[]): boolean {
  return staff.role !== "ADMIN" && ownerIds.some((id) => !!id && id === staff.id);
}

/**
 * Staff don't decide about their own items: a report about them or sent by them, approving or
 * restoring their own listing. An ADMIN may (audited like every action): the founder is the only
 * admin and may be a host too, and would otherwise be locked out of their own queue.
 */
export function assertNotOwnItem(staff: Pick<CurrentUser, "id" | "role">, ownerIds: readonly (string | null | undefined)[]): void {
  if (isOwnItem(staff, ownerIds)) throw new AdminActionError("not_allowed_on_self", 403);
}

/** Staff may not act on their own account, and only ADMINs may act on other staff accounts. */
export function assertCanManage(staff: CurrentUser, target: { id: string; role: string }): void {
  if (staff.id === target.id) throw new AdminActionError("not_allowed_on_self", 403);
  if (target.role !== "USER" && staff.role !== "ADMIN") throw new AdminActionError("not_allowed_on_staff", 403);
}
