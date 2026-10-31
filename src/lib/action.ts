/**
 * Server action results.
 *
 *   export async function doThing(input: unknown): Promise<ActionResult<{ id: string }>> {
 *     try {
 *       …
 *       return ok({ id });
 *     } catch (e) {
 *       return toActionError(e);
 *     }
 *   }
 *
 * The client shows `result.error` with `useTranslations("errors")(errorMessageKey(result.error))`
 * (or with its own namespace for feature-specific codes).
 */
import { unstable_rethrow } from "next/navigation";
import { ZodError, flattenError } from "zod";
import {
  AppError,
  ValidationError,
  type ActionErrorCode,
  type ErrorMessageKey,
  type FieldErrors,
} from "@/lib/errors";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export type ActionFailure = Extract<ActionResult<never>, { ok: false }>;

export function ok(): ActionResult<void>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | void> {
  return { ok: true, data };
}

/** A failed result. `code` is an error message key (see @/lib/errors) or a feature's own key. */
export function fail(
  code: ErrorMessageKey | (string & {}),
  fieldErrors?: FieldErrors,
): ActionFailure {
  return fieldErrors ? { ok: false, error: code, fieldErrors } : { ok: false, error: code };
}

const KNOWN_CODES = new Set<string>([
  "rate_limited",
  "shabbat_mode",
  "auth_required",
  "forbidden",
  "not_found",
  "invalid_input",
  "captcha_failed",
] satisfies Exclude<ActionErrorCode, "server_error">[]);

/**
 * Turn anything thrown inside a server action into a failed ActionResult.
 * Next.js control-flow errors (redirect, notFound…) are re-thrown so they keep working.
 * Unknown errors are logged and reported as "server_error" (no details leak to the client).
 */
export function toActionError(error: unknown): ActionFailure {
  unstable_rethrow(error);

  if (error instanceof ValidationError) return fail("invalid_input", error.fieldErrors);
  if (error instanceof ZodError) return fail("invalid_input", flattenError(error).fieldErrors);
  if (error instanceof AppError) {
    // Feature-specific AppError codes (e.g. "file_too_large") pass through unchanged.
    if (KNOWN_CODES.has(error.code) || error.status < 500) return fail(error.code);
    console.error("[action] server error:", error);
    return fail("server_error");
  }

  console.error("[action] unexpected error:", error);
  return fail("server_error");
}

/** Runs `fn` and converts thrown errors with `toActionError`. */
export async function runAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    return toActionError(error);
  }
}
