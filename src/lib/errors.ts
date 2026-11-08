/**
 * Application errors (client-safe — no server imports).
 *
 * Server code throws these; `toActionError()` (@/lib/action) turns them into an
 * `ActionResult` with a stable error code, and route handlers can use `status`.
 * Every code has a friendly message in messages/<locale>/errors.json:
 *   const t = useTranslations("errors"); t(errorMessageKey(result.error))
 */

/** Codes that `toActionError()` produces. */
export const ACTION_ERROR_CODES = [
  "rate_limited",
  "shabbat_mode",
  "auth_required",
  "forbidden",
  "not_found",
  "invalid_input",
  "captcha_failed",
  "server_error",
] as const;
export type ActionErrorCode = (typeof ACTION_ERROR_CODES)[number];

/** Every code with a message in the "errors" namespace. */
export const ERROR_MESSAGE_KEYS = [
  ...ACTION_ERROR_CODES,
  "file_too_large",
  "file_type_not_allowed",
  "heic_not_supported",
  "too_many_photos",
  "phone_not_verified",
  "network",
] as const;
export type ErrorMessageKey = (typeof ERROR_MESSAGE_KEYS)[number];

/** Map any error code to a key that has a message in the "errors" namespace. */
export function errorMessageKey(code: string | null | undefined): ErrorMessageKey {
  return (ERROR_MESSAGE_KEYS as readonly string[]).includes(code ?? "")
    ? (code as ErrorMessageKey)
    : "server_error";
}

export type FieldErrors = Record<string, string[] | undefined>;

/**
 * Base class. `code` is a message key (one of ERROR_MESSAGE_KEYS, or a feature's own key
 * that it translates itself); `status` is the HTTP status for route handlers.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message?: string, options?: { status?: number; cause?: unknown }) {
    super(message ?? code, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = options?.status ?? 400;
  }
}

export class RateLimitError extends AppError {
  readonly resetAt: Date;

  constructor(resetAt: Date, message = "Too many requests") {
    super("rate_limited", message, { status: 429 });
    this.resetAt = resetAt;
  }

  /** Seconds until the window resets (for the Retry-After header). */
  get retryAfterSeconds(): number {
    return Math.max(1, Math.ceil((this.resetAt.getTime() - Date.now()) / 1000));
  }
}

/** Posting, messaging and support pause during Shabbat and holidays (admin setting). */
export class ShabbatModeError extends AppError {
  readonly endsAt: Date | null;

  constructor(endsAt: Date | null = null) {
    super("shabbat_mode", "Paused for Shabbat or a holiday", { status: 423 });
    this.endsAt = endsAt;
  }
}

export class AuthRequiredError extends AppError {
  constructor(message = "Sign-in required") {
    super("auth_required", message, { status: 401 });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Not allowed") {
    super("forbidden", message, { status: 403 });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super("not_found", message, { status: 404 });
  }
}

export class ValidationError extends AppError {
  readonly fieldErrors?: FieldErrors;

  constructor(fieldErrors?: FieldErrors, message = "Invalid input") {
    super("invalid_input", message, { status: 422 });
    this.fieldErrors = fieldErrors;
  }
}

export class CaptchaError extends AppError {
  constructor(message = "CAPTCHA check failed") {
    super("captcha_failed", message, { status: 400 });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
