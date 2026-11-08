import "server-only";
import type { z } from "zod";
import { fail, type ActionResult } from "@/lib/action";
import { runStaffAction } from "@/lib/admin/server/common";
import type { Permission } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import type { RateLimitOptions } from "@/lib/rate-limit";
import { issuesToFieldErrors } from "../schemas";

/**
 * Shared plumbing for the content / settings / roles actions (server-only).
 * Error codes are translated by the UI with adminContent.errors.<code>.
 */

export const CONTENT_ERROR_CODES = [
  "slug_taken",
  "city_in_use",
  "neighborhood_in_use",
  "item_not_found",
  "listing_not_found",
  "listing_not_live",
  "featured_limit",
  "date_in_past",
  "last_admin",
  "not_allowed_on_self",
  "account_blocked",
  "role_unchanged",
  "user_not_found",
  "unknown_key",
  "invalid_message",
  "unknown_placeholder",
  "confirmation_mismatch",
  "no_phrases",
  "phrase_exists",
  "reorder_mismatch",
  // Q13: a destructive action whose audit row could not be written was stopped (src/lib/audit.ts).
  "audit_failed",
] as const;
export type ContentErrorCode = (typeof CONTENT_ERROR_CODES)[number];

export class ContentActionError extends AppError {
  constructor(code: ContentErrorCode, status = 409) {
    super(code, code, { status });
  }
}

/** Default: 60 writes a minute per staff member and area. */
const WRITE_LIMIT: RateLimitOptions = { limit: 60, windowSeconds: 60 };

export function runContentAction<T>(
  permission: Permission,
  scope: string,
  fn: (staff: CurrentUser) => Promise<ActionResult<T>>,
  limit: RateLimitOptions = WRITE_LIMIT,
): Promise<ActionResult<T>> {
  return runStaffAction(permission, `content:${scope}`, fn, limit);
}

/** Validates input; on failure returns an "invalid_input" result with dotted field paths. */
export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
): { ok: true; data: z.output<S> } | { ok: false; result: ReturnType<typeof fail> } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, result: fail("invalid_input", issuesToFieldErrors(parsed.error)) };
}

/** Prisma unique-constraint violation (P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}
